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
// Registro de Event Listeners (Ponte com a UI)
// ─────────────────────────────────────────────────────────────────

/**
 * Registra os event listeners dos botões de exportação CSV e CAD.
 * Deve ser chamado uma única vez durante o setup da mesa geodésica.
 */
export function registrarEventosExportacao(ctx: MesaTrabalhoContext): void {
  document.getElementById('btn-exportar-tabela-csv')?.addEventListener('click', () => {
    exportarParaCSV(ctx);
  });

  document.getElementById('btn-exportar-cad')?.addEventListener('click', async () => {
    await exportarParaCAD(ctx);
  });
}
