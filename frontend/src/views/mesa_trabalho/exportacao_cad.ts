/**
 * Módulo de Exportação CAD / CSV (SRP - Single Responsibility Principle)
 *
 * Centraliza toda a lógica de exportação de vértices geodésicos para:
 * - AutoCAD via clipboard (comando GCOLA): formatação de payload com blocos e atributos
 * - Planilha CSV (PT-BR): exportação tabular com separador ponto-e-vírgula
 *
 * Anteriormente essas funções estavam inline no mesa_geodesica.ts misturadas
 * com event listeners e lógica de UI. Agora são funções puras que recebem
 * os dados do contexto e retornam os resultados formatados.
 */

import { showToast } from '../../utils';
import { API_BASE } from '../../config';
import { latLonToUTM } from './mesa_geodesica';
import type { MesaTrabalhoContext } from './mesa_trabalho_context';

// ─────────────────────────────────────────────────────────────────
// Filtragem comum de pontos (usado por ambas exportações)
// ─────────────────────────────────────────────────────────────────

/**
 * Aplica os filtros ativos da mesa de trabalho sobre a lista de pontos,
 * respeitando o estado atual de ocultação, filtros rápidos e busca textual.
 */
export function filtrarPontosParaExportacao(ctx: MesaTrabalhoContext): any[] {
  let pontos = [...ctx.pontosList];

  // 1. Ocultar pontos fora da poligonal
  if (ctx.ocultarForaPoligono) {
    pontos = pontos.filter(p => p.ignorar_poligono !== 1);
  }

  // 2. Filtros rápidos de tipo/status
  if (ctx.filtroRapidoAtivo !== 'todos') {
    if (ctx.filtroRapidoAtivo === 'bases') {
      pontos = pontos.filter(p => p.tipo_ponto === 'M' || p.tipo === 'M' || p.tipo_ponto === 'B' || p.tipo === 'B');
    } else if (ctx.filtroRapidoAtivo === 'rovers') {
      pontos = pontos.filter(p => p.tipo_ponto !== 'M' && p.tipo !== 'M' && p.tipo_ponto !== 'B' && p.tipo !== 'B');
    } else if (ctx.filtroRapidoAtivo === 'brutos') {
      pontos = pontos.filter(p => p.status_ponto !== 'CORRIGIDO' && p.status_correcao !== 'CORRIGIDO');
    } else if (ctx.filtroRapidoAtivo === 'corrigidos') {
      pontos = pontos.filter(p => p.status_ponto === 'CORRIGIDO' || p.status_correcao === 'CORRIGIDO');
    }
  }

  // 3. Filtro de busca textual
  if (ctx.searchFilterValue) {
    pontos = pontos.filter(p =>
      (p.nome_vertice && p.nome_vertice.toLowerCase().includes(ctx.searchFilterValue)) ||
      (p.tipo_ponto && p.tipo_ponto.toLowerCase().includes(ctx.searchFilterValue)) ||
      (p.tipo && p.tipo.toLowerCase().includes(ctx.searchFilterValue)) ||
      (p.arquivo_origem && p.arquivo_origem.toLowerCase().includes(ctx.searchFilterValue)) ||
      (p.ordem_caminhamento && String(p.ordem_caminhamento).includes(ctx.searchFilterValue))
    );
  }

  return pontos;
}

// ─────────────────────────────────────────────────────────────────
// Mapeamento de tipos de ponto para blocos do AutoCAD
// ─────────────────────────────────────────────────────────────────

const MAPA_BLOCOS_CAD: Record<string, string> = {
  'M': 'BL-MEMOVEM3',  // Marco Base PPP
  'B': 'BL-MEMOVEM3',  // Marco Base Auxiliar
  'V': 'BL-MEMOVEV3',  // Vértice Virtual
  'P': 'BL-MEMOVEP3',  // Ponto de Detalhe
  'O': 'BL-MEMOVEP3',  // Outros
};

const BLOCO_PADRAO = 'BL-MEMOVEP3';

/**
 * Resolve o nome do bloco AutoCAD a partir do tipo de ponto geodésico.
 */
function resolverBlocoCAD(tipoPonto: string): string {
  return MAPA_BLOCOS_CAD[tipoPonto.toUpperCase()] || BLOCO_PADRAO;
}

/**
 * Sanitiza strings para evitar quebra do parser AutoLISP durante a injeção via GCOLA.
 * Remove ou substitui caracteres que podem interferir no parse dos atributos.
 */
function sanitizarParaCAD(texto: string | number | boolean | null | undefined): string {
  if (texto === null || texto === undefined) return '';
  return String(texto)
    .replace(/;/g, ' ')
    .replace(/,/g, ' ')
    .replace(/\(/g, '[')
    .replace(/\)/g, ']')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

// ─────────────────────────────────────────────────────────────────
// Exportação para AutoCAD (Clipboard → comando GCOLA)
// ─────────────────────────────────────────────────────────────────

/**
 * Gera o payload formatado para inserção de blocos no AutoCAD via GCOLA.
 * Cada linha segue o formato:
 * `ACAO=NOVO;BLOCO=<bloco>;X=<e>;Y=<n>;Z=<alt>;ATRIB(ID:<nome>,TIPO:<tipo>,SIGMA:<sigma>)`
 *
 * @returns Array de strings formatadas (uma por vértice), ou array vazio se nenhum ponto válido.
 */
export function gerarPayloadCAD(pontos: any[], ctx: MesaTrabalhoContext): string[] {
  return pontos.map((p) => {
    let x = p.e_corrigido || p.e_original;
    let y = p.n_corrigido || p.n_original;

    // Fallback: converte lat/lon para UTM se não houver coordenadas planas
    if (!x || !y) {
      if (p.lat && p.lon) {
        const utm = latLonToUTM(p.lat, p.lon);
        x = utm.e;
        y = utm.n;
      }
    }

    if (!x || !y) return null;

    const z = p.alt || p.alt_original || 0.0;
    const tipo = (p.tipo_ponto || p.tipo || 'P').toUpperCase();
    const bloco = resolverBlocoCAD(tipo);
    const nome = sanitizarParaCAD(p.nome_vertice || '');
    const sigma = p.sigma_lat || p.sigma_e || 0.0;
    
    // Recupera dados do segmento para método e limite
    let metodo = '';
    let limite = '';
    let cns = '';
    let matricula = '';
    let confrontante_nome = '';

    const segmento = ctx.segmentosList ? ctx.segmentosList.find((s: any) => s.ponto_inicio_id === p.id) : null;
    if (segmento) {
      metodo = segmento.metodo_posicionamento_sigef || p.metodo_posicionamento || '';
      limite = segmento.tipo_limite_sigef || p.tipo_limite || p.tipo_limite_sigef || '';
    } else {
      metodo = p.metodo_posicionamento || '';
      limite = p.tipo_limite || p.tipo_limite_sigef || '';
    }

    // Recupera dados do confrontante
    const confrontanteId = p.confrontante_id || (segmento && segmento.confrontante_id);
    if (confrontanteId && ctx.confrontantesList) {
      const confObj = ctx.confrontantesList.find((c: any) => c.id === confrontanteId);
      if (confObj) {
        confrontante_nome = confObj.nome || '';
        matricula = confObj.matricula_imovel || '';
        cns = confObj.cns_confrontante || '';
      }
    } else {
      if (p.nome_confrontante || p.confrontante_nome) confrontante_nome = p.nome_confrontante || p.confrontante_nome;
      if (p.confrontante_matricula) matricula = p.confrontante_matricula;
      if (p.confrontante_cartorio) cns = p.confrontante_cartorio;
    }

    metodo = sanitizarParaCAD(metodo);
    limite = sanitizarParaCAD(limite);
    cns = sanitizarParaCAD(cns);
    matricula = sanitizarParaCAD(matricula);
    confrontante_nome = sanitizarParaCAD(confrontante_nome);

    return `ACAO=NOVO;BLOCO=${bloco};X=${Number(x).toFixed(4)};Y=${Number(y).toFixed(4)};Z=${Number(z).toFixed(4)};ATRIB(ID:${nome},TIPO:${tipo},SIGMA:${Number(sigma).toFixed(3)},METPOS:${metodo},TIPLIM:${limite},CNS:${cns},MATR:${matricula},CONFRO:${confrontante_nome})`;
  }).filter((l): l is string => l !== null);
}

/**
 * Executa a exportação completa para o AutoCAD:
 * filtra os pontos ativos, gera o payload GCOLA e copia para o clipboard.
 */
export async function exportarParaCAD(ctx: MesaTrabalhoContext): Promise<void> {
  let pontosExport = filtrarPontosParaExportacao(ctx);

  // Filtro adicional: se há pontos selecionados manualmente, exporta apenas eles
  if (ctx.selectedPontoIds && ctx.selectedPontoIds.length > 0) {
    pontosExport = pontosExport.filter(p => ctx.selectedPontoIds.includes(p.id));
  }

  if (pontosExport.length === 0) {
    alert("Nenhum dado selecionado ou visível para exportar ao CAD!");
    return;
  }

  const payloadLines = gerarPayloadCAD(pontosExport, ctx);

  if (payloadLines.length === 0) {
    alert("Os pontos selecionados não possuem coordenadas válidas para exportação.");
    return;
  }

  const payloadString = payloadLines.join('\n');
  try {
    await navigator.clipboard.writeText(payloadString);
    showToast(`${payloadLines.length} vértices copiados para a área de transferência! Cole no AutoCAD com o comando GCOLA.`, "success");
  } catch (err) {
    console.error("Failed to copy to clipboard: ", err);
    alert("Erro ao copiar para a área de transferência. O navegador pode estar bloqueando a ação.");
  }
}

// ─────────────────────────────────────────────────────────────────
// Exportação para CSV (download de arquivo .csv)
// ─────────────────────────────────────────────────────────────────

/**
 * Gera e dispara o download de um arquivo CSV com os vértices do levantamento.
 * Formato PT-BR: separador ponto-e-vírgula, BOM UTF-8 para Excel.
 */
export function exportarParaCSV(ctx: MesaTrabalhoContext): void {
  const pontosExport = filtrarPontosParaExportacao(ctx);

  if (pontosExport.length === 0) {
    alert("Nenhum dado para exportar!");
    return;
  }

  const headers = ["Ordem", "Vertice", "Tipo", "Status", "Latitude", "Longitude", "Altitude", "Este_Corr", "Norte_Corr", "Este_Orig", "Norte_Orig", "Arquivo_Origem"];
  let seqValida = 1;
  const rows = pontosExport.map((p) => {
    const isIgn = p.ignorar_poligono === 1 || p.tipo_ponto === 'B' || p.tipo === 'B';
    const ordem = isIgn ? '-' : seqValida++;
    return [
      ordem,
      p.nome_vertice,
      p.tipo_ponto || p.tipo || '-',
      p.status_ponto || p.status_correcao || 'BRUTO',
      p.lat || '',
      p.lon || '',
      p.alt || p.alt_original || '',
      p.e_corrigido || '',
      p.n_corrigido || '',
      p.e_original || '',
      p.n_original || '',
      p.arquivo_origem || ''
    ];
  });

  const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map(e => e.join(";"))].join("\n");
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `vertices_levantamento_${ctx.currentLevId}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ─────────────────────────────────────────────────────────────────
// Importação do CAD (Clipboard → Sincronização Inteligente/Upsert)
// ─────────────────────────────────────────────────────────────────

interface PontoCADPreview {
  id: string;
  tipo: string;
  bloco: string;
  x: number;
  y: number;
  z: number;
  poligono: string;
  ordem: number;
  sigma: string;
  metpos: string;
  tiplim: string;
  cns: string;
  matr: string;
  confro: string;
  existente: boolean;
}

/**
 * Faz o parse estruturado do payload copiado via comando GCOPIA no AutoCAD.
 */
function parsearPayloadCAD(text: string, pontosExistentes: any[]): {
  pontos: PontoCADPreview[];
  total: number;
  naPoligonal: number;
  suporte: number;
  novos: number;
  atualizados: number;
  confrontantes: string[];
} {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const pontos: PontoCADPreview[] = [];
  const confrontantesSet = new Set<string>();
  const nomesExistentes = new Set((pontosExistentes || []).map(p => (p.nome_vertice || p.nome || '').toUpperCase()));

  for (const line of lines) {
    const parts = line.split(';');
    let x = 0, y = 0, z = 0;
    let id = '', tipo = '', bloco = '', poligono = '1', ordem = 0;
    let sigma = '0.000', metpos = '', tiplim = '', cns = '', matr = '', confro = '';

    for (const part of parts) {
      if (part.includes('=') && !part.startsWith('ATRIB(')) {
        const [param, val] = part.split('=');
        const pUpper = param.trim().toUpperCase();
        const vTrim = (val || '').trim();
        if (pUpper === 'BLOCO') bloco = vTrim;
        else if (pUpper === 'X') x = parseFloat(vTrim) || 0;
        else if (pUpper === 'Y') y = parseFloat(vTrim) || 0;
        else if (pUpper === 'Z') z = parseFloat(vTrim) || 0;
        else if (pUpper === 'POLIGONO') poligono = vTrim;
        else if (pUpper === 'ORDEM') ordem = parseInt(vTrim) || 0;
      }

      if (part.startsWith('ATRIB(') && part.endsWith(')')) {
        const attrStr = part.slice(6, -1);
        const regex = /(ID|TIPO|SIGMA|METPOS|TIPLIM|CNS|MATR|CONFRO)\s*:\s*(.*?)(?=(?:,\s*(?:ID|TIPO|SIGMA|METPOS|TIPLIM|CNS|MATR|CONFRO)\s*:)|$)/gi;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(attrStr)) !== null) {
          const k = match[1].trim().toUpperCase();
          const v = match[2].trim();
          if (k === 'ID') id = v;
          else if (k === 'TIPO') tipo = v.toUpperCase();
          else if (k === 'SIGMA') sigma = v;
          else if (k === 'METPOS') metpos = v;
          else if (k === 'TIPLIM') tiplim = v;
          else if (k === 'CNS') cns = v;
          else if (k === 'MATR') matr = v;
          else if (k === 'CONFRO') confro = v;
        }
      }
    }

    if (!id || x === 0 || y === 0) continue;

    // Inferência inteligente de tipo
    let tipoFinal = tipo;
    if (!tipoFinal || tipoFinal === 'V') {
      const bUpper = bloco.toUpperCase();
      const idUpper = id.toUpperCase();
      if (bUpper.includes('MEMOVEM') || idUpper.includes('-M-')) tipoFinal = 'M';
      else if (bUpper.includes('MEMOVEP') || idUpper.includes('-P-')) tipoFinal = 'P';
      else if (bUpper.includes('MEMOVEB') || idUpper.includes('-B-') || idUpper.startsWith('BASE')) tipoFinal = 'B';
      else tipoFinal = tipoFinal || 'V';
    }

    if (confro && confro.trim()) {
      confrontantesSet.add(confro.trim());
    }

    const jaExiste = nomesExistentes.has(id.toUpperCase());

    pontos.push({
      id,
      tipo: tipoFinal,
      bloco,
      x,
      y,
      z,
      poligono,
      ordem,
      sigma,
      metpos,
      tiplim,
      cns,
      matr,
      confro,
      existente: jaExiste
    });
  }

  const naPoligonal = pontos.filter(p => p.poligono === '1').length;
  const suporte = pontos.filter(p => p.poligono === '0').length;
  const novos = pontos.filter(p => !p.existente).length;
  const atualizados = pontos.filter(p => p.existente).length;

  return {
    pontos,
    total: pontos.length,
    naPoligonal,
    suporte,
    novos,
    atualizados,
    confrontantes: Array.from(confrontantesSet)
  };
}

/**
 * Importa/Sincroniza os vértices do CAD via Clipboard com Modal Interativo de Conferência.
 */
export async function importarDoCADClipboard(ctx: MesaTrabalhoContext): Promise<void> {
  if (!ctx.currentLevId) {
    alert("Nenhum levantamento ativo selecionado!");
    return;
  }

  try {
    const text = await navigator.clipboard.readText();
    if (!text || (!text.includes("ACAO=") && !text.includes("ATRIB("))) {
      alert("A área de transferência não contém um payload válido do CAD. Selecione a polilinha e os pontos no AutoCAD/TopoCAD e execute o comando GCOPIAR antes de importar.");
      return;
    }

    const preview = parsearPayloadCAD(text, ctx.pontosList || []);
    if (preview.total === 0) {
      alert("Nenhum vértice válido encontrado no payload da Área de Transferência.");
      return;
    }

    // Abre o Modal Interativo de Conferência Inteligente
    abrirModalConfirmacaoCAD(ctx, preview, text);

  } catch (err: any) {
    console.error("Erro na importação do CAD:", err);
    alert(err.message || "Falha ao ler a área de transferência ou sincronizar os pontos com o CAD.");
  }
}

/**
 * Renderiza o modal de conferência inteligente com preview dos vértices, suporte a polilinha e opções de destino.
 */
function abrirModalConfirmacaoCAD(ctx: MesaTrabalhoContext, preview: ReturnType<typeof parsearPayloadCAD>, rawText: string): void {
  const existingModal = document.getElementById('modal-cad-sync-preview');
  if (existingModal) existingModal.remove();

  const matriculasOptionsHtml = (ctx.matriculasList && ctx.matriculasList.length > 0)
    ? ctx.matriculasList.map((m: any) => `
        <option value="${m.id}" ${ctx.currentMatriculaId === m.id ? 'selected' : ''}>
          Matrícula ${m.numero_matricula || m.num_matricula || m.id} (${(m.area_ha || m.area || 0).toFixed(2)} ha)
        </option>
      `).join('')
    : `<option value="">[Sem Matrícula Registrada]</option>`;

  const linhasPreviewHtml = preview.pontos.map(p => `
    <tr class="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors text-[11px]">
      <td class="px-3 py-1.5 font-mono font-bold text-white flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full ${p.tipo === 'M' ? 'bg-amber-400' : p.tipo === 'P' ? 'bg-mint-vibrant' : p.tipo === 'B' ? 'bg-purple-400' : 'bg-sky-400'}"></span>
        ${p.id}
      </td>
      <td class="px-3 py-1.5">
        <span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${p.tipo === 'M' ? 'bg-amber-500/20 text-amber-300' : p.tipo === 'P' ? 'bg-mint-vibrant/20 text-mint-vibrant' : p.tipo === 'B' ? 'bg-purple-500/20 text-purple-300' : 'bg-sky-500/20 text-sky-300'}">
          ${p.tipo === 'M' ? 'Marco' : p.tipo === 'P' ? 'Ponto' : p.tipo === 'B' ? 'Base' : 'Virtual'}
        </span>
      </td>
      <td class="px-3 py-1.5">
        ${p.poligono === '1'
          ? `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/20 flex items-center gap-1 w-max">
               <i data-lucide="check" class="w-3 h-3"></i> Perímetro #${p.ordem}
             </span>`
          : `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-white/5 text-white/40 border border-white/10 flex items-center gap-1 w-max">
               <i data-lucide="minus" class="w-3 h-3"></i> Suporte (Fora)
             </span>`}
      </td>
      <td class="px-3 py-1.5 font-mono text-white/70">${p.x.toFixed(3)}</td>
      <td class="px-3 py-1.5 font-mono text-white/70">${p.y.toFixed(3)}</td>
      <td class="px-3 py-1.5 text-white/80 max-w-[180px] truncate" title="${p.confro || '-'}">${p.confro || '-'}</td>
      <td class="px-3 py-1.5 text-white/60">${p.metpos || '-'}</td>
    </tr>
  `).join('');

  const modalHtml = `
    <div id="modal-cad-sync-preview" class="fixed inset-0 bg-black/85 backdrop-blur-md z-[var(--geo-z-modal,9999)] flex items-center justify-center p-4">
      <div class="glass-card w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-mint-vibrant/30 rounded-2xl bg-[#0c1510]/95">
        
        <!-- Cabeçalho do Modal -->
        <div class="p-5 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-mint-vibrant/10 border border-mint-vibrant/30 flex items-center justify-center text-mint-vibrant shadow-inner">
              <i data-lucide="refresh-cw" class="w-5 h-5 animate-spin-slow"></i>
            </div>
            <div>
              <h3 class="text-base font-bold text-white flex items-center gap-2">
                Sincronização Inteligente do CAD
                <span class="px-2 py-0.5 text-[10px] rounded-full bg-mint-vibrant/20 text-mint-vibrant border border-mint-vibrant/30 font-mono">
                  AutoCAD / TopoCAD
                </span>
              </h3>
              <p class="text-xs text-white/50">Conferência dos vértices, topologia da polilinha e amarração de confrontantes</p>
            </div>
          </div>
          <button class="text-white/40 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/5" id="btn-fechar-cad-preview" type="button">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <!-- Conteúdo do Modal -->
        <div class="p-6 overflow-y-auto space-y-5 custom-scrollbar flex-1">
          
          <!-- Cards de Métricas e Resumo -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div class="bg-white/[0.03] border border-white/10 rounded-xl p-3.5 flex flex-col justify-between">
              <span class="text-[10px] text-white/50 font-bold uppercase tracking-wider">No Perímetro</span>
              <div class="flex items-baseline gap-1.5 mt-1">
                <span class="text-xl font-bold font-mono text-mint-vibrant">${preview.naPoligonal}</span>
                <span class="text-[11px] text-white/40">vértices</span>
              </div>
              <span class="text-[9px] text-mint-vibrant/80 mt-1">Sequência via Polilinha</span>
            </div>

            <div class="bg-white/[0.03] border border-white/10 rounded-xl p-3.5 flex flex-col justify-between">
              <span class="text-[10px] text-white/50 font-bold uppercase tracking-wider">Pontos de Suporte</span>
              <div class="flex items-baseline gap-1.5 mt-1">
                <span class="text-xl font-bold font-mono text-white/70">${preview.suporte}</span>
                <span class="text-[11px] text-white/40">fora</span>
              </div>
              <span class="text-[9px] text-white/40 mt-1">Ignorados no polígono</span>
            </div>

            <div class="bg-white/[0.03] border border-white/10 rounded-xl p-3.5 flex flex-col justify-between">
              <span class="text-[10px] text-white/50 font-bold uppercase tracking-wider">Confrontantes</span>
              <div class="flex items-baseline gap-1.5 mt-1">
                <span class="text-xl font-bold font-mono text-purple-300">${preview.confrontantes.length}</span>
                <span class="text-[11px] text-white/40">detectados</span>
              </div>
              <span class="text-[9px] text-purple-300/80 mt-1">Auto-amarração</span>
            </div>

            <div class="bg-white/[0.03] border border-white/10 rounded-xl p-3.5 flex flex-col justify-between">
              <span class="text-[10px] text-white/50 font-bold uppercase tracking-wider">Operações</span>
              <div class="flex items-baseline gap-1.5 mt-1">
                <span class="text-xs font-bold text-amber-300">${preview.novos} novos</span>
                <span class="text-[10px] text-white/40">/</span>
                <span class="text-xs font-bold text-sky-300">${preview.atualizados} atualiz.</span>
              </div>
              <span class="text-[9px] text-white/40 mt-1">Upsert determinístico</span>
            </div>
          </div>

          <!-- Configurações de Ingestão -->
          <div class="bg-white/[0.02] border border-white/5 p-4 rounded-xl space-y-3">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div>
                <label class="block text-[10px] text-white/50 uppercase font-bold mb-1.5">Matrícula de Destino dos Vértices *</label>
                <select id="select-cad-target-matricula" class="glass-input w-full text-xs bg-[#0c1510] border-white/10 text-white rounded-lg p-2">
                  ${matriculasOptionsHtml}
                </select>
              </div>

              <div class="flex items-center gap-3 pt-4 sm:pt-0">
                <input type="checkbox" id="chk-cad-reconstruir-poligonal" checked class="rounded border-white/20 text-mint-vibrant bg-white/5 focus:ring-0 w-4 h-4 cursor-pointer" />
                <label for="chk-cad-reconstruir-poligonal" class="text-xs text-white/80 cursor-pointer select-none">
                  <strong>Reconstruir Poligonal Perimetral</strong>
                  <span class="block text-[10px] text-white/40">Gera as divisas e fecha o polígono na sequência exata da polilinha do CAD.</span>
                </label>
              </div>
            </div>
          </div>

          <!-- Tabela de Preview dos Vértices -->
          <div class="border border-white/10 rounded-xl overflow-hidden bg-black/20">
            <div class="px-4 py-2.5 bg-white/[0.03] border-b border-white/10 flex justify-between items-center">
              <span class="text-xs font-bold text-white flex items-center gap-2">
                <i data-lucide="list" class="w-3.5 h-3.5 text-mint-vibrant"></i>
                Vértices Identificados no Payload (${preview.total})
              </span>
              <span class="text-[10px] text-white/40">Coordenadas em UTM Zone 22S (SIRGAS 2000)</span>
            </div>
            
            <div class="max-h-56 overflow-y-auto custom-scrollbar">
              <table class="w-full text-left border-collapse">
                <thead class="bg-white/[0.02] border-b border-white/5 text-[9px] uppercase tracking-wider text-white/40 sticky top-0 bg-[#0c1510]">
                  <tr>
                    <th class="px-3 py-2">Vértice</th>
                    <th class="px-3 py-2">Tipo</th>
                    <th class="px-3 py-2">Poligonal</th>
                    <th class="px-3 py-2">Este (X)</th>
                    <th class="px-3 py-2">Norte (Y)</th>
                    <th class="px-3 py-2">Confrontante</th>
                    <th class="px-3 py-2">Método</th>
                  </tr>
                </thead>
                <tbody>
                  ${linhasPreviewHtml}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        <!-- Rodapé com Botões -->
        <div class="p-4 border-t border-white/10 bg-white/[0.02] flex justify-end items-center gap-3">
          <button type="button" class="btn-secondary text-xs px-4 py-2" id="btn-cancelar-cad-sync">
            Cancelar
          </button>
          <button type="button" class="btn-primary text-xs px-5 py-2 flex items-center gap-2 shadow-lg shadow-mint-vibrant/20 font-bold" id="btn-confirmar-cad-sync">
            <i data-lucide="check-circle" class="w-4 h-4"></i>
            Confirmar e Sincronizar Vértices
          </button>
        </div>

      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
  if ((window as any).lucide && typeof (window as any).lucide.createIcons === 'function') {
    (window as any).lucide.createIcons();
  }

  const modalEl = document.getElementById('modal-cad-sync-preview');
  const btnFechar = document.getElementById('btn-fechar-cad-preview');
  const btnCancelar = document.getElementById('btn-cancelar-cad-sync');
  const btnConfirmar = document.getElementById('btn-confirmar-cad-sync') as HTMLButtonElement;

  const fecharModal = () => {
    if (modalEl) modalEl.remove();
  };

  btnFechar?.addEventListener('click', fecharModal);
  btnCancelar?.addEventListener('click', fecharModal);

  btnConfirmar?.addEventListener('click', async () => {
    const selectMat = document.getElementById('select-cad-target-matricula') as HTMLSelectElement;
    const chkReconstruir = document.getElementById('chk-cad-reconstruir-poligonal') as HTMLInputElement;

    const matriculaIdEscolhida = selectMat && selectMat.value ? parseInt(selectMat.value) : (ctx.currentMatriculaId || undefined);
    const reconstruirPoligonal = chkReconstruir ? chkReconstruir.checked : true;

    btnConfirmar.disabled = true;
    btnConfirmar.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Sincronizando...`;
    if ((window as any).lucide && typeof (window as any).lucide.createIcons === 'function') {
      (window as any).lucide.createIcons();
    }

    try {
      const resp = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/pontos/sincronizar-cad`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          payload_cad: rawText,
          matricula_id: matriculaIdEscolhida,
          reconstruir_poligonal: reconstruirPoligonal
        })
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.detail || "Erro ao processar a sincronização do CAD no servidor.");
      }

      const data = await resp.json();
      fecharModal();

      showToast(data.mensagem || "Sincronização com o CAD concluída com sucesso!", "success");

      // Recarrega todos os dados do levantamento de forma reativa e instantânea
      if (typeof ctx.loadLevantamentoDetails === 'function') {
        await ctx.loadLevantamentoDetails();
      }

      // Re-renderiza a etapa atual (Tabela Geodésica, Mapa, etc.)
      if (typeof ctx.alternarEtapa === 'function') {
        ctx.alternarEtapa(ctx.etapaAtiva);
      }

      // Centraliza a visão do mapa nos pontos atualizados
      if (ctx.mapaController && ctx.pontosList && ctx.pontosList.length > 0) {
        ctx.mapaController.fitBounds(ctx.pontosList);
      }

    } catch (err: any) {
      console.error("Erro na sincronização:", err);
      alert(err.message || "Falha ao sincronizar pontos com o servidor.");
      btnConfirmar.disabled = false;
      btnConfirmar.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4"></i> Tentar Novamente`;
    }
  });
}

// ─────────────────────────────────────────────────────────────────
// Registro de Event Listeners (Ponte com a UI)
// ─────────────────────────────────────────────────────────────────

/**
 * Registra os event listeners dos botões de exportação e importação CAD/CSV.
 * Deve ser chamado uma única vez durante o setup da mesa geodésica.
 */
export function registrarEventosExportacao(ctx: MesaTrabalhoContext): void {
  document.getElementById('btn-exportar-tabela-csv')?.addEventListener('click', () => {
    exportarParaCSV(ctx);
  });

  document.getElementById('btn-exportar-cad')?.addEventListener('click', async () => {
    await exportarParaCAD(ctx);
  });

  document.getElementById('btn-importar-cad')?.addEventListener('click', async () => {
    await importarDoCADClipboard(ctx);
  });
}

