import L from 'leaflet';
import { API_BASE } from '../../config';
import { initIcons, showToast, escapeHtml } from '../../utils';
import type { MesaTrabalhoContext } from './mesa_trabalho_context';
import { CamadaConfrontantes } from './camada_confrontantes';
import { criarListaConfrontantes, type ResumoConfrontantes, type ListaConfrontantes } from './lista_confrontantes';
import { estadoDe, type ConfrontanteResumo } from './lista_confrontantes_tipos';
import { criarPassosCartorio } from './passos_cartorio';
import { homologadosDaMatricula } from './pontos_visiveis';
import { configurarSplitterCartorio } from './splitter_cartorio';
import {
  normalizarEstadoCivil,
  normalizarRegimeBens,
  configurarMaquinadeEstadosCivil,
  formatarCpfCnpjDinamico
} from './maquina_estado_civil';
import { erroCpf, erroCpfCnpj } from './validadores_documento';
import {
  criarRascunhoFormulario,
  preencherCampos,
  validarCampos,
  limparErros,
  observarLimpezaDeErros,
  ligarAtalhosFormulario,
  type RascunhoFormulario
} from '@thibezer/ui-components-kit/forms';
import { confirmarAcao, confirmarDescarteSeSujo, UIToast } from '@thibezer/ui-components-kit/feedback';

let soltarRascunhoAnterior: (() => void) | null = null;

/** Erros e conflitos precisam de ação do operador: ficam na tela até serem fechados (nunca um toast de 3 s). */
const avisarErroPersistente = (mensagem: string) => {
  UIToast.notificar({ tipo: 'erro', mensagem, duracao: 0, fechavel: true });
};

interface VerticeConfrontante {
  id: number;
  codigo_completo: string;
  tipo_ponto: string;
  metodo_posicionamento: string | null;
  tipo_limite: string | null;
  matricula_confrontante: string | null;
  cns_confrontante: string | null;
  confrontante_descritivo: string | null;
  confrontante_nome: string | null;
  planilha_origem: string;
  /** Campos alterados desde o que está no SIGEF: { campo: valor original no SIGEF } */
  pendentes?: Record<string, string>;
}

interface AlteracaoSigef {
  id: number;
  planilha_origem: string;
  codigo_completo: string;
  campo: string;
  valor_original: string | null;
  valor_novo: string | null;
  status: 'pendente' | 'lancado';
}

const ROTULO_CAMPO: Record<string, string> = {
  confrontante_descritivo: 'Confrontante',
  matricula_confrontante: 'Matrícula do confrontante',
  cns_confrontante: 'CNS do confrontante',
  tipo_limite: 'Tipo de limite',
  metodo_posicionamento: 'Método',
};

const PEND_CLS = 'border-amber-400/60 bg-amber-500/10';

type CampoEditavel = 'confrontante_descritivo' | 'matricula_confrontante' | 'tipo_limite' | 'metodo_posicionamento';

// Mesmos códigos oferecidos na tabela de segmentos (Org. de Perímetro); valores já presentes na planilha são somados.
const TIPOS_LIMITE_COMUNS = ['LN1', 'LA1', 'LI1', 'LI2'];
const METODOS_COMUNS = ['PG1', 'PG2', 'PG3', 'PG4', 'PG5', 'PT1', 'PT2', 'PA1', 'PA2'];

export function setupGeradorDocumentos(ctx: MesaTrabalhoContext) {

  // Planilha de vértices x confrontantes (estado local da aba Peças de Cartório)
  let vertices: VerticeConfrontante[] = [];
  const marcados = new Set<number>();
  let alteracoes: AlteracaoSigef[] = [];
  let resumoConf: ResumoConfrontantes | null = null;
  let listaConfrontantes: ListaConfrontantes | null = null;
  const listaConfAbort = new AbortController();

  // Fluxo em 4 passos + splitter mapa | painel
  const passos = criarPassosCartorio();
  configurarSplitterCartorio(() => ctx.triagemMap?.invalidateSize?.());
  // Matrícula para a qual o passo inicial já foi escolhido (trocar de matrícula reabre no passo com pendência)
  let matriculaDosPassos: unknown = undefined;
  const reiniciarPassosSeTrocouMatricula = () => {
    if (matriculaDosPassos === ctx.currentMatriculaId) return;
    matriculaDosPassos = ctx.currentMatriculaId;
    passos.reiniciarEscolha();
  };

  // Cartões recolhíveis: lembram o estado entre sessões
  document.querySelectorAll<HTMLDetailsElement>('details[data-persist]').forEach(d => {
    const chave = `gerencigeo_${d.dataset.persist}`;
    try {
      const salvo = localStorage.getItem(chave);
      if (salvo !== null) { d.open = salvo === '1'; d.dataset.estadoSalvo = '1'; }
    } catch { /* storage indisponível */ }
    // Só cliques do usuário viram preferência (o estado padrão automático não é gravado)
    d.querySelector('summary')?.addEventListener('click', () => {
      setTimeout(() => {
        d.dataset.estadoSalvo = '1';
        try { localStorage.setItem(chave, d.open ? '1' : '0'); } catch { /* ignora */ }
      }, 0);
    });
  });

  // Camada do mapa: divisas por confrontante (preto/branco alternado) + atalhos das camadas do mapa
  const camadaConf = new CamadaConfrontantes();
  const emCartorio = () => ctx.etapaAtiva === 'documentos';

  const camadaSigefAtiva = (): boolean => {
    const ctrl = ctx.mapaController?.getController?.();
    return !!ctrl?.layerManager?.getLayer?.('sigef')?.visivel;
  };

  const sincronizarBotoesMapa = () => {
    document.getElementById('btn-mapa-toggle-sigef')?.classList.toggle('ativo', camadaSigefAtiva());
  };

  let enquadrarPendente = false;
  let matriculaEnquadrada: unknown = null;

  const atualizarCamadaMapa = () => {
    if (!emCartorio() || !resumoConf) return;
    if (!camadaConf.anexar(ctx.triagemMap)) return;
    camadaConf.setDados(resumoConf.sequencia || []);
    // Enquadra ao entrar na etapa e ao trocar de matrícula (não a cada edição, para não tirar o zoom do usuário)
    if (enquadrarPendente || matriculaEnquadrada !== ctx.currentMatriculaId) {
      ctx.triagemMap?.invalidateSize?.();
      if (camadaConf.limites()) camadaConf.enquadrar();
      else window.dispatchEvent(new CustomEvent('gerencigeo:recenter'));   // sem coordenadas de divisas: centraliza nos pontos
      enquadrarPendente = false;
      matriculaEnquadrada = ctx.currentMatriculaId;
      // O kit pode reposicionar o mapa logo depois (ex.: zoom no ponto selecionado): reaplica uma vez
      setTimeout(() => { if (emCartorio() && camadaConf.limites()) camadaConf.enquadrar(); }, 700);
    }
  };

  ctx.aoMudarEtapa = (etapa: string) => {
    const noCartorio = etapa === 'documentos';
    document.querySelectorAll('.btn-mapa-cartorio').forEach(b => b.classList.toggle('hidden', !noCartorio));
    // Mapa somente leitura na etapa: sem ferramentas de edição, sem painel de camadas e sem barra rápida (camadas/localizar/ímã/seleção)
    document.getElementById('map-cad-floating-toolbar')?.setAttribute('data-etapa', etapa);
    const canvasMapa = document.getElementById('mapa-triagem');
    canvasMapa?.toggleAttribute('sem-barra-rapida', noCartorio);
    canvasMapa?.toggleAttribute('sem-painel-camadas', noCartorio);
    if (!noCartorio) {
      camadaConf.remover();
      ctx.mapaController?.setLayerVisibility?.('perimetro', true);
      return;
    }
    // Em Peças de Cartório o mapa exibe apenas os pontos (X) do perímetro oficial de referência e camadas oficiais (homologados, confrontantes e SIGEF)
    ctx.mapaController?.setLayerVisibility?.('perimetro', false);
    ctx.mapaController?.setLayerVisibility?.('vertices', true);
    ctx.atualizarPolilinhaMapaTemp?.();
    matriculaDosPassos = undefined;
    reiniciarPassosSeTrocouMatricula();
    // O mapa muda de tamanho ao entrar na etapa: espera o layout assentar antes de enquadrar
    enquadrarPendente = true;
    setTimeout(() => {
      ctx.triagemMap?.invalidateSize?.();
      sincronizarBotoesMapa();
      document.getElementById('btn-mapa-toggle-confrontantes')?.classList.add('ativo');
      camadaConf.setVisivel(true);
      atualizarCamadaMapa();
    }, 180);
  };
  const marcadasAlt = new Set<number>();

  const camposEditaveis: { campo: CampoEditavel; classe: string; lista?: string; placeholder: string }[] = [
    { campo: 'tipo_limite', classe: 'w-20', lista: 'datalist-tipo-limite-planilha', placeholder: '—' },
    { campo: 'metodo_posicionamento', classe: 'w-20', lista: 'datalist-metodo-planilha', placeholder: '—' },
    { campo: 'confrontante_descritivo', classe: 'w-full min-w-[220px]', lista: 'datalist-confrontantes-planilha', placeholder: 'Sem confrontante — preencha' },
    { campo: 'matricula_confrontante', classe: 'w-28', placeholder: '—' },
  ];

  const aspas = (v: string | null) => (v ? `«${v}»` : '(vazio)');

  const aplicarPendentesNosVertices = () => {
    const mapa = new Map<string, Record<string, string>>();
    alteracoes.filter(a => a.status === 'pendente').forEach(a => {
      const chave = `${a.planilha_origem}|${a.codigo_completo}`;
      if (!mapa.has(chave)) mapa.set(chave, {});
      mapa.get(chave)![a.campo] = a.valor_original || '';
    });
    vertices.forEach(v => { v.pendentes = mapa.get(`${v.planilha_origem}|${v.codigo_completo}`) || {}; });
  };

  const renderPainelAlteracoes = () => {
    const painel = document.getElementById('painel-alteracoes-sigef');
    const lista = document.getElementById('lista-alteracoes-sigef');
    const badge = document.getElementById('badge-alteracoes-sigef');
    if (!painel || !lista) return;

    const mostrarLancadas = (document.getElementById('chk-alt-mostrar-lancadas') as HTMLInputElement | null)?.checked;
    const pendentes = alteracoes.filter(a => a.status === 'pendente');
    const visiveis = alteracoes.filter(a => a.status === 'pendente' || mostrarLancadas);
    if (badge) badge.innerText = `${pendentes.length} pendente${pendentes.length === 1 ? '' : 's'}`;
    passos.atualizar({ alteracoesSigef: pendentes.length });
    painel.classList.toggle('hidden', visiveis.length === 0);
    if (visiveis.length === 0) { lista.innerHTML = ''; return; }

    const ordemVertice = new Map(vertices.map((v, i) => [`${v.planilha_origem}|${v.codigo_completo}`, i]));
    visiveis.sort((x, y) =>
      x.planilha_origem.localeCompare(y.planilha_origem) ||
      (ordemVertice.get(`${x.planilha_origem}|${x.codigo_completo}`) ?? 1e9) - (ordemVertice.get(`${y.planilha_origem}|${y.codigo_completo}`) ?? 1e9) ||
      x.id - y.id);

    const vazio = '<span class="text-white/25 italic">vazio</span>';
    lista.innerHTML = `
      <table class="w-full text-left border-collapse">
        <thead><tr class="text-[9px] font-bold uppercase tracking-widest text-white/30 border-b border-white/5">
          <th class="px-2 py-1 w-6"></th><th class="px-2 py-1">Planilha</th><th class="px-2 py-1">Vértice</th>
          <th class="px-2 py-1">Campo</th><th class="px-2 py-1">No SIGEF hoje</th><th class="px-2 py-1">Novo valor</th>
        </tr></thead>
        <tbody class="divide-y divide-white/5">
          ${visiveis.map(a => `
            <tr class="${a.status === 'lancado' ? 'opacity-40' : ''}">
              <td class="px-2 py-1"><input type="checkbox" class="chk-alteracao accent-emerald-400" data-id="${a.id}" ${marcadasAlt.has(a.id) ? 'checked' : ''} /></td>
              <td class="px-2 py-1 text-white/40 font-mono max-w-[140px] truncate" title="${escapeHtml(a.planilha_origem)}">${escapeHtml(a.planilha_origem)}</td>
              <td class="px-2 py-1 font-mono font-bold text-mint-vibrant whitespace-nowrap">${escapeHtml(a.codigo_completo)}</td>
              <td class="px-2 py-1 text-white/70">${ROTULO_CAMPO[a.campo] || a.campo}</td>
              <td class="px-2 py-1 text-rose-300/80">${escapeHtml(a.valor_original) || vazio}</td>
              <td class="px-2 py-1 text-emerald-300 font-semibold">${escapeHtml(a.valor_novo) || vazio}${a.status === 'lancado' ? ' <span class="text-[9px] text-white/40">(lançado)</span>' : ''}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
    const btn = document.getElementById('btn-alt-marcar-lancadas');
    if (btn) btn.innerText = mostrarLancadas ? 'Alternar lançado nas selecionadas' : 'Marcar selecionadas como lançadas';
  };

  const carregarAlteracoes = async () => {
    if (!ctx.currentLevId) { alteracoes = []; return; }
    try {
      const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/alteracoes-sigef`);
      const data = await res.json();
      alteracoes = Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('Erro ao carregar alterações do SIGEF:', err);
      alteracoes = [];
    }
    marcadasAlt.forEach(id => { if (!alteracoes.some(a => a.id === id)) marcadasAlt.delete(id); });
    aplicarPendentesNosVertices();
    renderPainelAlteracoes();
  };

  const textoAlteracoes = (sep: string) => {
    const linhas = alteracoes
      .filter(a => a.status === 'pendente')
      .map(a => [a.planilha_origem, a.codigo_completo, ROTULO_CAMPO[a.campo] || a.campo, a.valor_original || '', a.valor_novo || '']);
    linhas.unshift(['Planilha', 'Vertice', 'Campo', 'Valor no SIGEF', 'Novo valor']);
    return linhas.map(l => l.map(c => sep === ';' ? `"${c.replace(/"/g, '""')}"` : c).join(sep)).join('\n');
  };

  const garantirListaConfrontantes = (): ListaConfrontantes | null => {
    if (!listaConfrontantes) {
      listaConfrontantes = criarListaConfrontantes({
        ctx,
        signal: listaConfAbort.signal,
        camadaConf,
        abrirEdicao: (id) => abrirEdicaoConfrontante(String(id)),
        abrirNovo: () => document.getElementById('btn-novo-confrontante-cartorio')?.click(),
        preVisualizar: (id) => acionarAnuencia(String(id), 'btn-preview-anuencia'),
        gerarAnuencia: (id) => acionarAnuencia(String(id), 'btn-emitir-anuencia'),
        gerarLote: (ids) => {
          if (!ctx.currentLevId || !ctx.currentMatriculaId) return;
          const qs = ids.length > 0 ? `?confrontantes_ids=${encodeURIComponent(ids.join(','))}` : '';
          window.open(`${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/anuencia-lote-html${qs}`, '_blank');
        },
        filtrarTabelaPorConfrontante: (nome) => {
          const busca = document.getElementById('input-busca-vertices-cartorio') as HTMLInputElement | null;
          if (busca) {
            busca.value = nome;
            renderTabelaVertices();
            passos.irPara('divisas');
          }
        },
        filtrarTabelaSemConfrontante: () => {
          const chk = document.getElementById('chk-vertices-so-pendentes') as HTMLInputElement | null;
          if (chk) {
            chk.checked = true;
            renderTabelaVertices();
            passos.irPara('divisas');
          }
        },
        irParaTabelaVertices: () => passos.irPara('divisas'),
        aoCarregar: (r) => {
          resumoConf = r;
          if (!r || (r.confrontantes.length === 0 && r.sem_confrontante.qtd_divisas === 0)) {
            passos.atualizar({ anuenciasExigidas: 0, anuenciasAssinadas: 0, confrontantesSemCpf: 0 });
          } else {
            const exigidos = r.confrontantes.filter(c => !c.dispensada);
            const assinados = exigidos.filter(c => c.assinadas === c.qtd_divisas).length;
            passos.atualizar({
              anuenciasExigidas: exigidos.length,
              anuenciasAssinadas: assinados,
              confrontantesSemCpf: exigidos.filter(c => !c.cpf_cnpj).length,
            });
          }
          atualizarCamadaMapa();
        },
      });
    }
    return listaConfrontantes;
  };

  const carregarResumoConfrontantes = async () => {
    const inst = garantirListaConfrontantes();
    if (inst) await inst.carregar();
  };

  /** O formulário abre como painel sobre os passos: começa do topo e leva o foco ao primeiro campo */
  const ajustarVisibilidadeFormulario = (form: HTMLElement) => {
    form.scrollTop = 0;
    setTimeout(() => (document.getElementById('input-conf-cpf') as HTMLElement | null)?.focus?.(), 50);
  };

  /** Abre o formulário de qualificação completa preenchido com os dados do confrontante */
  const abrirEdicaoConfrontante = (confId: string) => {
    const select = document.getElementById('select-confrontante-anuencia') as HTMLSelectElement | null;
    if (!select) return;
    if (![...select.options].some(o => o.value === confId)) {
      const opt = document.createElement('option');
      opt.value = confId;
      select.appendChild(opt);
    }
    select.value = confId;
    select.dispatchEvent(new Event('change'));
    const form = document.getElementById('container-form-confrontante');
    if (form) {
      form.classList.remove('hidden');
      ajustarVisibilidadeFormulario(form);
    }
  };

  /** Aciona os handlers existentes (geração/pré-visualização) escolhendo o confrontante no select oculto. */
  const acionarAnuencia = (confId: string, botaoId: 'btn-emitir-anuencia' | 'btn-preview-anuencia') => {
    const select = document.getElementById('select-confrontante-anuencia') as HTMLSelectElement | null;
    if (!select) return;
    if (![...select.options].some(o => o.value === confId)) {
      const opt = document.createElement('option');
      opt.value = confId;
      select.appendChild(opt);
    }
    select.value = confId;
    document.getElementById(botaoId)?.click();
  };

  const vincularEventosResumoConfrontantes = () => {
    garantirListaConfrontantes();
    const btnMapaConf = document.getElementById('btn-mapa-toggle-confrontantes');
    if (btnMapaConf && btnMapaConf.dataset.eventosVinculados !== '1') {
      btnMapaConf.dataset.eventosVinculados = '1';
      btnMapaConf.addEventListener('click', () => {
        const ligar = !btnMapaConf.classList.contains('ativo');
        btnMapaConf.classList.toggle('ativo', ligar);
        camadaConf.setVisivel(ligar);
      });
    }
    const btnMapaSigef = document.getElementById('btn-mapa-toggle-sigef');
    if (btnMapaSigef && btnMapaSigef.dataset.eventosVinculados !== '1') {
      btnMapaSigef.dataset.eventosVinculados = '1';
      btnMapaSigef.addEventListener('click', () => {
        ctx.mapaController?.setLayerVisibility?.('sigef', !camadaSigefAtiva());
        sincronizarBotoesMapa();
      });
    }
  };

  const salvarVertices = async (ids: number[], campos: Partial<Record<CampoEditavel, string>>): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/banco-pontos`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, ...campos })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.detail || 'Erro ao salvar a correção na planilha.', 'error');
        return false;
      }
      return true;
    } catch (err) {
      console.error('Erro ao salvar vértices:', err);
      showToast('Falha de conexão ao salvar a correção.', 'error');
      return false;
    }
  };

  const atualizarListasAuxiliares = () => {
    const preencher = (id: string, valores: Iterable<string>) => {
      const dl = document.getElementById(id);
      if (dl) dl.innerHTML = [...new Set(valores)].filter(Boolean).map(v => `<option value="${escapeHtml(v)}"></option>`).join('');
    };
    preencher('datalist-confrontantes-planilha', vertices.map(v => (v.confrontante_descritivo || '').trim()));
    preencher('datalist-tipo-limite-planilha', [...TIPOS_LIMITE_COMUNS, ...vertices.map(v => v.tipo_limite || '')]);
    preencher('datalist-metodo-planilha', [...METODOS_COMUNS, ...vertices.map(v => v.metodo_posicionamento || '')]);
  };

  const semConfrontante = (v: VerticeConfrontante) => !(v.confrontante_descritivo || '').trim() && !(v.matricula_confrontante || '').trim();

  const atualizarBarraLote = () => {
    const barra = document.getElementById('barra-edicao-lote-vertices');
    const qtd = document.getElementById('qtd-vertices-marcados');
    if (qtd) qtd.innerText = String(marcados.size);
    barra?.classList.toggle('hidden', marcados.size === 0);
  };

  const atualizarContadores = () => {
    const countTxt = document.getElementById('txt-qtd-homologados');
    const pendTxt = document.getElementById('txt-qtd-pendentes-conf');
    const pendentes = vertices.filter(semConfrontante).length;
    if (countTxt) countTxt.innerText = `${vertices.length} Pontos`;
    if (pendTxt) {
      pendTxt.innerText = `${pendentes} sem confrontante`;
      pendTxt.classList.toggle('hidden', pendentes === 0);
    }
    passos.atualizar({ vertices: vertices.length, verticesSemConfrontante: pendentes });
  };

  const renderTabelaVertices = () => {
    const container = document.getElementById('container-vertices-homologados');
    if (!container) return;

    atualizarContadores();

    if (vertices.length === 0) {
      container.innerHTML = `<div class="text-white/20 italic py-4 text-center">Selecione uma matrícula com pontos homologados para listar seus vértices.</div>`;
      atualizarBarraLote();
      return;
    }

    const soPendentes = (document.getElementById('chk-vertices-so-pendentes') as HTMLInputElement | null)?.checked;
    const busca = ((document.getElementById('input-busca-vertices-cartorio') as HTMLInputElement | null)?.value || '').trim().toLowerCase();

    const linhas = vertices
      .map((v, i) => ({ v, ordem: i + 1 }))
      .filter(({ v }) => !soPendentes || semConfrontante(v))
      .filter(({ v }) => !busca || `${v.codigo_completo} ${v.confrontante_descritivo || ''} ${v.matricula_confrontante || ''}`.toLowerCase().includes(busca));

    const inputCls = 'bg-transparent border border-transparent hover:border-white/15 focus:border-mint-vibrant focus:bg-white/5 rounded px-1.5 py-0.5 text-[11px] text-white placeholder-amber-300/40 focus:outline-none transition-all font-mono';

    container.innerHTML = `
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="bg-[#0c1510] text-[9px] font-bold uppercase tracking-widest text-white/30 border-b border-white/5 sticky top-0 z-10">
            <th class="px-2 py-2 w-6"><input type="checkbox" id="chk-vertices-todos" class="accent-emerald-400" title="Marcar todos os visíveis" /></th>
            <th class="px-2 py-2 w-8 text-right">#</th>
            <th class="px-2 py-2">Vértice</th>
            <th class="px-2 py-2">Limite</th>
            <th class="px-2 py-2">Método</th>
            <th class="px-2 py-2">Confrontante da divisa (vértice ➔ próximo)</th>
            <th class="px-2 py-2">Matrícula conf.</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-white/5 text-white/60">
          ${linhas.length === 0 ? `<tr><td colspan="7" class="px-4 py-6 text-center text-white/30 italic">Nenhum vértice corresponde ao filtro.</td></tr>` : linhas.map(({ v, ordem }) => `
            <tr class="${semConfrontante(v) ? 'bg-amber-500/[0.04]' : ''} hover:bg-white/[0.03] transition-colors" data-vertice-id="${v.id}">
              <td class="px-2 py-1"><input type="checkbox" class="chk-vertice accent-emerald-400" data-id="${v.id}" ${marcados.has(v.id) ? 'checked' : ''} /></td>
              <td class="px-2 py-1 text-right text-white/30 font-mono">${ordem}</td>
              <td class="px-2 py-1 font-mono font-bold text-mint-vibrant whitespace-nowrap">${escapeHtml(v.codigo_completo)}</td>
              ${camposEditaveis.map(c => `
                <td class="px-1 py-1">
                  <input type="text" class="input-vertice-campo ${inputCls} ${c.classe} ${v.pendentes && c.campo in v.pendentes ? PEND_CLS : ''}" data-id="${v.id}" data-campo="${c.campo}"
                         ${v.pendentes && c.campo in v.pendentes ? `title="No SIGEF hoje: ${escapeHtml(aspas(v.pendentes[c.campo]))}"` : ''}
                         ${c.lista ? `list="${c.lista}"` : ''} placeholder="${c.placeholder}" value="${escapeHtml((v as any)[c.campo] || '')}" />
                </td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    atualizarBarraLote();
  };

  const carregarTabelaVertices = async () => {
    if (!ctx.currentLevId || !ctx.currentMatriculaId) {
      vertices = [];
      renderTabelaVertices();
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/vertices-confrontantes`);
      const data = await res.json();
      vertices = Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('Erro ao carregar vértices e confrontantes:', err);
      vertices = [];
    }
    marcados.clear();
    atualizarListasAuxiliares();
    await carregarAlteracoes();
    renderTabelaVertices();
  };

  const aplicarLocal = (ids: number[], campos: Partial<Record<CampoEditavel, string>>) => {
    vertices.forEach(v => {
      if (ids.includes(v.id)) Object.assign(v, campos);
    });
  };

  const vincularEventosTabelaVertices = () => {
    vincularEventosResumoConfrontantes();
    const container = document.getElementById('container-vertices-homologados');
    if (!container || container.dataset.eventosVinculados === '1') return;
    container.dataset.eventosVinculados = '1';

    container.addEventListener('change', async (e) => {
      const el = e.target as HTMLInputElement;

      if (el.id === 'chk-vertices-todos') {
        container.querySelectorAll<HTMLInputElement>('.chk-vertice').forEach(chk => {
          chk.checked = el.checked;
          const id = Number(chk.dataset.id);
          if (el.checked) marcados.add(id); else marcados.delete(id);
        });
        atualizarBarraLote();
        return;
      }

      if (el.classList.contains('chk-vertice')) {
        const id = Number(el.dataset.id);
        if (el.checked) marcados.add(id); else marcados.delete(id);
        atualizarBarraLote();
        return;
      }

      if (el.classList.contains('input-vertice-campo')) {
        const id = Number(el.dataset.id);
        const campo = el.dataset.campo as CampoEditavel;
        const valor = el.value.trim();
        const atual = vertices.find(v => v.id === id);
        if (!atual || (atual[campo] || '') === valor) return;

        el.disabled = true;
        const ok = await salvarVertices([id], { [campo]: valor });
        el.disabled = false;
        if (ok) {
          aplicarLocal([id], { [campo]: valor });
          await carregarAlteracoes();
          // Destaque âmbar quando difere do SIGEF; sem re-renderizar para não tirar o foco
          const difere = !!atual.pendentes && campo in atual.pendentes;
          PEND_CLS.split(' ').forEach(c => el.classList.toggle(c, difere));
          el.title = difere ? `No SIGEF hoje: ${aspas(atual.pendentes![campo])}` : '';
          if (campo === 'confrontante_descritivo' || campo === 'matricula_confrontante') {
            // Sem re-renderizar a tabela para não tirar o foco de quem está navegando com Tab
            const linha = el.closest('tr');
            linha?.classList.toggle('bg-amber-500/[0.04]', semConfrontante(atual));
            atualizarContadores();
            atualizarListasAuxiliares();
            ctx.carregarConfrontantesAtivosSelect();
          }
        } else {
          el.value = atual[campo] || '';
        }
      }
    });

    document.getElementById('btn-lote-aplicar')?.addEventListener('click', async () => {
      const conf = (document.getElementById('input-lote-confrontante') as HTMLInputElement).value.trim();
      const mat = (document.getElementById('input-lote-matricula') as HTMLInputElement).value.trim();
      const campos: Partial<Record<CampoEditavel, string>> = {};
      if (conf) campos.confrontante_descritivo = conf;
      if (mat) campos.matricula_confrontante = mat;
      if (!Object.keys(campos).length) {
        showToast('Informe o confrontante e/ou a matrícula para aplicar.', 'error');
        return;
      }
      const ids = [...marcados];
      if (await salvarVertices(ids, campos)) {
        showToast(`${ids.length} vértice(s) atualizado(s).`, 'success');
        (document.getElementById('input-lote-confrontante') as HTMLInputElement).value = '';
        (document.getElementById('input-lote-matricula') as HTMLInputElement).value = '';
        await ctx.carregarConfrontantesAtivosSelect();
        await carregarTabelaVertices();
      }
    });
    document.getElementById('btn-lote-limpar')?.addEventListener('click', () => {
      marcados.clear();
      renderTabelaVertices();
    });
    document.getElementById('chk-vertices-so-pendentes')?.addEventListener('change', renderTabelaVertices);

    // Painel "Alterações a lançar no SIGEF"
    const painel = document.getElementById('painel-alteracoes-sigef');
    painel?.addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.classList.contains('chk-alteracao')) {
        const id = Number(el.dataset.id);
        if (el.checked) marcadasAlt.add(id); else marcadasAlt.delete(id);
      }
    });
    document.getElementById('chk-alt-mostrar-lancadas')?.addEventListener('change', renderPainelAlteracoes);
    document.getElementById('btn-alt-marcar-lancadas')?.addEventListener('click', async () => {
      if (marcadasAlt.size === 0) {
        showToast('Marque as alterações que você já refez no SIGEF.', 'info');
        return;
      }
      // Alterna: se a seleção é de itens já lançados, reabre; senão marca como lançados
      const selecionadas = alteracoes.filter(a => marcadasAlt.has(a.id));
      const lancado = selecionadas.some(a => a.status === 'pendente');
      try {
        const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/alteracoes-sigef/marcar-lancado`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [...marcadasAlt], lancado })
        });
        if (!res.ok) throw new Error();
        marcadasAlt.clear();
        await carregarAlteracoes();
        renderTabelaVertices();
      } catch {
        showToast('Não foi possível atualizar o status das alterações.', 'error');
      }
    });
    document.getElementById('btn-alt-copiar')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(textoAlteracoes('\t'));
        showToast('Lista copiada (cole numa planilha).', 'success');
      } catch {
        showToast('Não foi possível copiar a lista.', 'error');
      }
    });
    document.getElementById('btn-alt-csv')?.addEventListener('click', () => {
      const blob = new Blob(['\ufeff' + textoAlteracoes(';')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `alteracoes_sigef_levantamento_${ctx.currentLevId}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
    document.getElementById('input-busca-vertices-cartorio')?.addEventListener('input', renderTabelaVertices);
  };

  // 1. Carrega os dados de homologação do SIGEF (poligonal importada)
  ctx.carregarHomologacaoDados = async (_profissionalId: number) => {
    reiniciarPassosSeTrocouMatricula();
    if (ctx.currentLevantamento) {
      passos.atualizar({
        propriedadeVinculada: !!ctx.currentLevantamento.propriedade_id,
        profissionalVinculado: !!ctx.currentLevantamento.profissional_id,
      });
    }
    renderPlanilhasHomologadas();
    vincularEventosTabelaVertices();
    if (!ctx.currentLevId) return;
    try {
      // 1. Carrega todos os pontos homologados de todas as planilhas do levantamento para exibir no mapa
      const resTodos = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/pontos-homologados`);
      const todosPontos = await resTodos.json();
      
      // 2. Carrega apenas os pontos da matrícula ativa para o grid de baixo, contador e peças
      let pontosDoProjeto: any[] = [];
      if (ctx.currentMatriculaId) {
        const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/pontos-homologados`);
        pontosDoProjeto = await res.json();
      }
      
      const container = document.getElementById('container-vertices-homologados');
      const countTxt = document.getElementById('txt-qtd-homologados');
      
      if (Array.isArray(todosPontos)) {
        ctx.pontosHomologadosList = todosPontos;
        
        if (countTxt) {
          countTxt.innerText = `${pontosDoProjeto.length} Pontos`;
        }
        
        if (todosPontos.length > 0) {
          ctx.poligonalHomologadaVisivel = true;
          ctx.mapaController.plotPoligonalHomologada(homologadosDaMatricula(ctx));
          
          const btnToggleMapa = document.getElementById('btn-toggle-mapa-banco');
          const icon = document.getElementById('icon-toggle-mapa-banco');
          const txt = document.getElementById('txt-toggle-mapa-banco');
          if (btnToggleMapa) {
            btnToggleMapa.classList.remove('bg-amber-500/10');
            btnToggleMapa.classList.add('bg-amber-500/20');
          }
          if (txt) txt.innerText = "Ocultar Poligonal";
          if (icon) icon.setAttribute('data-lucide', 'eye-off');
        } else {
          ctx.poligonalHomologadaVisivel = false;
          ctx.mapaController.plotPoligonalHomologada([]);
          
          const btnToggleMapa = document.getElementById('btn-toggle-mapa-banco');
          const icon = document.getElementById('icon-toggle-mapa-banco');
          const txt = document.getElementById('txt-toggle-mapa-banco');
          if (btnToggleMapa) {
            btnToggleMapa.classList.remove('bg-amber-500/20');
            btnToggleMapa.classList.add('bg-amber-500/10');
          }
          if (txt) txt.innerText = "Exibir Poligonal";
          if (icon) icon.setAttribute('data-lucide', 'eye');
        }
        initIcons();
        
        const containerPecas = document.getElementById('container-pecas-cartorio');
        if (containerPecas) {
          containerPecas.classList.remove('hidden');
        }

        const pontosMat = ctx.pontosList;
        const validCoords = pontosMat.filter(p => p.lat && p.lon && p.lat !== 0 && p.lon !== 0);
        if (validCoords.length === 0 && ctx.triagemMap) {
          const validHomologadosCoords = pontosDoProjeto.filter((p: any) => p.lat && p.lon && p.lat !== 0 && p.lon !== 0).map((p: any) => L.latLng(p.lat, p.lon));
          if (validHomologadosCoords.length > 0) {
            const bounds = L.latLngBounds(validHomologadosCoords);
            ctx.triagemMap.fitBounds(bounds, { padding: [40, 40] });
          }
        }
        
        if (container) {
          await carregarTabelaVertices();
        }
      }
    } catch (err) {
      console.error("Erro ao carregar dados de homologação:", err);
    }

    const containerAuditoria = document.getElementById('container-auditoria-banco');
    if (containerAuditoria && !containerAuditoria.classList.contains('hidden')) {
      renderAuditoriaBancoPontos();
    }
  };

  // 2. Carrega confrontantes ativos no select da anuência
  ctx.carregarConfrontantesAtivosSelect = async () => {
    if (!ctx.currentLevId || !ctx.currentMatriculaId) return;
    reiniciarPassosSeTrocouMatricula();
    try {
      const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/confrontantes-ativos`);
      const confs = await res.json();
      
      const select = document.getElementById('select-confrontante-anuencia') as HTMLSelectElement;
      if (select) {
        select.innerHTML = `
          <option value="" class="bg-[#0c1510]">Anuência Confrontante...</option>
          <option value="lote" class="bg-[#0c1510] text-mint-vibrant font-bold">✨ Gerar Todas em Lote (PDF Único)</option>
        `;
        if (Array.isArray(confs)) {
          confs.forEach((c: any) => {
            const opt = document.createElement('option');
            opt.value = String(c.id);
            opt.className = 'bg-[#0c1510]';
            const rotuloImovel = [c.lote ? `Lote: ${c.lote}` : '', c.matricula_imovel ? `Matrícula: ${c.matricula_imovel}` : ''].filter(Boolean).join(' - ');
            opt.textContent = rotuloImovel ? `${c.nome} (${rotuloImovel})` : c.nome;
            select.appendChild(opt);
          });
        }
      }
    } catch (err) {
      console.error("Erro ao carregar confrontantes ativos da matricula:", err);
    }
    await carregarResumoConfrontantes();
  };

  // 3. Renderiza a tabela de planilhas homologadas (SIGEF)
  const renderPlanilhasHomologadas = async () => {
    const container = document.getElementById('container-planilhas-homologadas');
    if (!container || !ctx.currentLevId) return;

    try {
      const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/planilhas-homologadas`);
      const planilhas = await res.json();

      const lista = Array.isArray(planilhas) ? planilhas : [];
      passos.atualizar({
        planilhas: lista.length,
        pontosPlanilhas: lista.reduce((acc: number, p: any) => acc + (p.qtd_pontos || 0), 0),
      });

      if (!Array.isArray(planilhas) || planilhas.length === 0) {
        container.innerHTML = `<div class="text-white/20 italic py-2 text-center">Nenhuma planilha cadastrada.</div>`;
        return;
      }

      let html = `
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="text-[9px] font-bold uppercase tracking-widest text-white/30 border-b border-white/5">
              <th class="py-1.5 px-2">Arquivo / Planilha</th>
              <th class="py-1.5 px-2 text-center">Vértices</th>
              <th class="py-1.5 px-2">Matrícula Associada</th>
              <th class="py-1.5 px-2 text-center">Ações</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5">
      `;

      planilhas.forEach((p: any) => {
        const selectId = `select-assoc-mat-${btoa(p.planilha_origem).replace(/=/g, '')}`;
        html += `
          <tr class="hover:bg-white/[0.02] transition-colors">
            <td class="py-2 px-2 font-mono text-white/80 max-w-[150px] truncate" title="${p.planilha_origem}">${p.planilha_origem}</td>
            <td class="py-2 px-2 text-center font-mono text-mint-vibrant font-bold">${p.qtd_pontos}</td>
            <td class="py-2 px-2">
              <select class="select-assoc-matricula bg-white/5 border border-white/10 hover:border-mint-vibrant/30 rounded px-1.5 py-0.5 text-[11px] text-white focus:outline-none transition-all w-full max-w-[140px]" data-planilha="${p.planilha_origem}" id="${selectId}">
                <option value="" class="bg-[#0c1510]">Nenhuma (Pendente)</option>
                ${ctx.matriculasList.map(m => `
                  <option value="${m.id}" class="bg-[#0c1510]" ${p.matricula_id === m.id ? 'selected' : ''}>Matrícula ${m.numero_matricula}</option>
                `).join('')}
              </select>
            </td>
            <td class="py-2 px-2 text-center">
              <button class="btn-deletar-planilha text-red-400 hover:text-red-300 hover:bg-red-500/10 p-1 rounded transition-colors" data-planilha="${p.planilha_origem}" title="Excluir planilha e todos os seus pontos">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </td>
          </tr>
        `;
      });

      html += `
          </tbody>
        </table>
      `;

      container.innerHTML = html;
      initIcons();

      container.querySelectorAll('.select-assoc-matricula').forEach((select: any) => {
        select.addEventListener('change', async () => {
          const planilha = select.getAttribute('data-planilha');
          const matIdVal = select.value;
          const matId = matIdVal ? parseInt(matIdVal) : null;

          try {
            const resAssoc = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/planilhas-homologadas/associar-matricula`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                planilha_origem: planilha,
                matricula_id: matId
              })
            });
            if (resAssoc.ok) {
              await ctx.loadLevantamentoDetails();
            } else {
              const errData = await resAssoc.json();
              alert(errData.detail || "Erro ao associar matrícula.");
            }
          } catch (err) {
            console.error("Erro ao associar matrícula:", err);
          }
        });
      });

      container.querySelectorAll('.btn-deletar-planilha').forEach((btn: any) => {
        btn.addEventListener('click', async () => {
          const planilha = btn.getAttribute('data-planilha');
          if (!confirm(`Deseja realmente excluir a planilha "${planilha}" e todos os seus vértices homologados deste levantamento? Esta ação é irreversível.`)) {
            return;
          }

          try {
            const resDel = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/planilhas-homologadas?planilha_origem=${encodeURIComponent(planilha)}`, {
              method: 'DELETE'
            });
            if (resDel.ok) {
              alert("Planilha e pontos excluídos com sucesso!");
              await ctx.loadLevantamentoDetails();
            } else {
              const errData = await resDel.json();
              alert(errData.detail || "Erro ao excluir planilha.");
            }
          } catch (err) {
            console.error("Erro ao excluir planilha:", err);
          }
        });
      });

    } catch (err) {
      console.error("Erro ao renderizar planilhas homologadas:", err);
      container.innerHTML = `<div class="text-red-400 italic py-2 text-center">Erro ao carregar lista de planilhas.</div>`;
    }
  };

  // 4. Renderiza a auditoria do banco de pontos (duplicatas)
  const renderAuditoriaBancoPontos = async () => {
    const container = document.getElementById('lista-grupos-auditoria');
    const totalPtsEl = document.getElementById('auditoria-total-pontos');
    const totalGruposEl = document.getElementById('auditoria-total-grupos');
    const totalDupEl = document.getElementById('auditoria-total-duplicados');
    
    if (!container || !ctx.currentLevId) return;

    try {
      const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/banco-pontos/auditoria`);
      const data = await res.json();

      if (totalPtsEl) totalPtsEl.innerText = String(data.total_pontos || 0);
      if (totalGruposEl) totalGruposEl.innerText = String(data.total_grupos || 0);
      if (totalDupEl) totalDupEl.innerText = String(data.total_duplicatas || 0);

      if (!data.grupos || data.grupos.length === 0) {
        container.innerHTML = `<div class="text-white/20 italic py-4 text-center">Nenhum ponto no banco para auditar.</div>`;
        return;
      }

      let html = '';
      data.grupos.forEach((g: any) => {
        const isDuplicadoGrupo = g.tem_duplicata;
        
        html += `
          <div class="bg-white/[0.02] border border-white/5 rounded-lg p-3 space-y-2">
            <div class="flex justify-between items-center border-b border-white/5 pb-2">
              <div class="flex items-center gap-2">
                <span class="font-bold text-xs text-white max-w-[200px] truncate" title="${g.planilha_origem}">${g.planilha_origem}</span>
                <span class="text-[9px] font-mono bg-white/5 px-1.5 py-0.5 rounded text-white/40">${g.total} Pontos</span>
                ${isDuplicadoGrupo ? `<span class="text-[8px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/25 px-1.5 py-0.5 rounded font-bold uppercase">Contém Duplicatas</span>` : ''}
              </div>
              <button class="btn-deletar-planilha-auditoria text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2 py-1 rounded text-[10px] flex items-center gap-1 transition-all active:scale-95" data-planilha="${g.planilha_origem}">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                Excluir Planilha
              </button>
            </div>
            
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse text-[10px] font-mono">
                <thead>
                  <tr class="text-[8px] font-bold uppercase tracking-wider text-white/20 border-b border-white/5">
                    <th class="py-1 px-1">Código</th>
                    <th class="py-1 px-1">Tipo</th>
                    <th class="py-1 px-1">Coordenadas (N, E, H)</th>
                    <th class="py-1 px-1">Método / Limite</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-white/5">
                  ${g.pontos.map((p: any) => `
                    <tr class="${p.is_duplicado ? 'bg-amber-500/5 hover:bg-amber-500/10' : 'hover:bg-white/[0.01]'} transition-colors">
                      <td class="py-1 px-1 font-bold ${p.is_duplicado ? 'text-amber-400' : 'text-mint-vibrant'}">
                        ${p.codigo_completo}
                        ${p.is_duplicado ? '<span class="text-[8px] text-amber-500 font-bold block">(Duplicado)</span>' : ''}
                      </td>
                      <td class="py-1 px-1 text-white/60">${p.tipo_ponto}</td>
                      <td class="py-1 px-1 text-white/40">
                        ${p.norte ? p.norte.toFixed(3) : '-'}, ${p.este ? p.este.toFixed(3) : '-'}, ${p.altitude ? p.altitude.toFixed(2) : '-'}
                      </td>
                      <td class="py-1 px-1 text-white/40">
                        ${p.metodo_posicionamento || '-'} / ${p.tipo_limite || '-'}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      });

      container.innerHTML = html;
      initIcons();

      container.querySelectorAll('.btn-deletar-planilha-auditoria').forEach((btn: any) => {
        btn.addEventListener('click', async () => {
          const planilha = btn.getAttribute('data-planilha');
          if (planilha.startsWith("Sem arquivo")) {
            alert("Não é possível excluir pontos criados manualmente por este atalho.");
            return;
          }
          if (!confirm(`Deseja realmente excluir a planilha "${planilha}" e todos os seus vértices homologados deste levantamento? Esta ação é irreversível.`)) {
            return;
          }

          try {
            const resDel = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/planilhas-homologadas?planilha_origem=${encodeURIComponent(planilha)}`, {
              method: 'DELETE'
            });
            if (resDel.ok) {
              alert("Planilha e pontos excluídos com sucesso!");
              await ctx.loadLevantamentoDetails();
            } else {
              const errData = await resDel.json();
              alert(errData.detail || "Erro ao excluir planilha.");
            }
          } catch (err) {
            console.error("Erro ao excluir planilha da auditoria:", err);
          }
        });
      });

    } catch (err) {
      console.error("Erro ao renderizar auditoria do banco de pontos:", err);
      container.innerHTML = `<div class="text-red-400 italic py-2 text-center">Erro ao carregar auditoria.</div>`;
    }
  };

  /** O upload grava direto no confrontante: sem id (cadastro novo ainda não salvo) o anexo fica desabilitado. */
  const habilitarAnexoMatricula = (habilitado: boolean) => {
    const input = document.getElementById('file-matricula-conf') as HTMLInputElement | null;
    const rotulo = document.querySelector<HTMLElement>('label[for="file-matricula-conf"]');
    if (input) input.disabled = !habilitado;
    if (rotulo) {
      rotulo.setAttribute('aria-disabled', String(!habilitado));
      rotulo.classList.toggle('opacity-40', !habilitado);
      rotulo.classList.toggle('pointer-events-none', !habilitado);
      rotulo.title = habilitado ? '' : 'Salve o cadastro para anexar a matrícula.';
    }
  };

  const renderizarStatusAnexoMatricula = (selectedConf: any) => {
    const statusEl = document.getElementById('status-matricula-anexo');
    const btnVer = document.getElementById('btn-ver-matricula-conf');
    const btnRemover = document.getElementById('btn-remover-matricula-conf');

    if (!statusEl) return;
    habilitarAnexoMatricula(Boolean(selectedConf?.id));

    if (selectedConf && selectedConf.caminho_matricula_pdf) {
      const pathStr = selectedConf.caminho_matricula_pdf;
      const parts = pathStr.split(/[\\/]/);
      const fileName = parts[parts.length - 1];

      statusEl.innerHTML = `<span class="text-mint-vibrant font-medium flex items-center gap-1.5"><i data-lucide="file-text" class="w-3.5 h-3.5"></i> ${fileName}</span>`;
      
      if (btnVer) {
        btnVer.classList.remove('hidden');
        btnVer.onclick = () => {
          window.open(`${API_BASE}/confrontantes/${selectedConf.id}/visualizar-matricula`, '_blank');
        };
      }
      
      if (btnRemover) {
        btnRemover.classList.remove('hidden');
        btnRemover.onclick = async () => {
          const quem = selectedConf.nome ? ` de ${selectedConf.nome}` : '';
          const confirmado = await confirmarAcao({
            titulo: 'Remover matrícula',
            mensagem: `O arquivo da matrícula${quem} será apagado e não poderá ser recuperado.`,
            rotuloConfirmar: 'Remover matrícula',
            rotuloCancelar: 'Manter arquivo',
            destrutivo: true
          });
          if (!confirmado) return;

          try {
            const res = await fetch(`${API_BASE}/confrontantes/${selectedConf.id}/matricula`, {
              method: 'DELETE'
            });
            if (res.ok) {
              showToast("Matrícula removida.", "success");
              selectedConf.caminho_matricula_pdf = null;
              renderizarStatusAnexoMatricula(selectedConf);
              await ctx.loadLevantamentoDetails();
            } else {
              const errData = await res.json().catch(() => ({}));
              avisarErroPersistente(errData.detail || "Erro ao remover matrícula.");
            }
          } catch (err) {
            console.error("Erro ao remover matrícula:", err);
            avisarErroPersistente("Erro de rede ao remover matrícula.");
          }
        };
      }
    } else {
      statusEl.innerHTML = `<span class="text-white/50">${selectedConf?.id ? 'Nenhum arquivo anexado.' : 'Salve o cadastro para poder anexar a matrícula.'}</span>`;
      if (btnVer) btnVer.classList.add('hidden');
      if (btnRemover) btnRemover.classList.add('hidden');
    }
    initIcons();
  };

  // 5. Inicialização principal dos eventos do gerador de documentos para cartório
  const inicializarEventosCartorio = () => {
    const validarPreRequisitosPecas = async (): Promise<boolean> => {
      if (!ctx.currentMatriculaId) {
        if (ctx.matriculasList && ctx.matriculasList.length > 0) {
          ctx.switchMatriculaTab(ctx.matriculasList[0].id);
        } else {
          showToast("Selecione uma matrícula ativa para gerar as peças de cartório.", "info");
          return false;
        }
      }
      if (!ctx.currentLevId) {
        showToast("Levantamento não selecionado.", "error");
        return false;
      }
      if (!ctx.currentLevantamento && ctx.currentLevId) {
        try {
          const resLev = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}`);
          if (resLev.ok) {
            ctx.currentLevantamento = await resLev.json();
          }
        } catch (e) {
          console.error("Erro ao recarregar levantamento:", e);
        }
      }
      if (ctx.currentLevantamento && (!ctx.currentLevantamento.propriedade_id || !ctx.currentLevantamento.profissional_id)) {
        return confirm("Atenção: A Propriedade ou o Profissional Principal não estão vinculados a este levantamento. As peças de cartório poderão conter campos em branco. Deseja emitir mesmo assim?");
      }
      return true;
    };

    const btnToggleMapa = document.getElementById('btn-toggle-mapa-banco');
    if (btnToggleMapa) {
      btnToggleMapa.onclick = () => {
        if (!ctx.pontosHomologadosList || ctx.pontosHomologadosList.length === 0) {
          alert("Nenhum ponto homologado importado para exibir no mapa.");
          return;
        }
        
        ctx.poligonalHomologadaVisivel = !ctx.poligonalHomologadaVisivel;
        const icon = document.getElementById('icon-toggle-mapa-banco');
        const txt = document.getElementById('txt-toggle-mapa-banco');

        if (ctx.poligonalHomologadaVisivel) {
          ctx.mapaController.plotPoligonalHomologada(homologadosDaMatricula(ctx));
          if (txt) txt.innerText = "Ocultar Poligonal";
          if (icon) icon.setAttribute('data-lucide', 'eye-off');
          btnToggleMapa.classList.replace('bg-amber-500/10', 'bg-amber-500/20');
        } else {
          ctx.mapaController.plotPoligonalHomologada([]);
          if (txt) txt.innerText = "Exibir Poligonal";
          if (icon) icon.setAttribute('data-lucide', 'eye');
          btnToggleMapa.classList.replace('bg-amber-500/20', 'bg-amber-500/10');
        }
        initIcons();
      };
    }
    
    const btnReq = document.getElementById('btn-emitir-req-cartorio');
    if (btnReq) {
      btnReq.onclick = async () => {
        if (!(await validarPreRequisitosPecas())) return;
        
        let trt = "";
        let data = "";
        
        if (ctx.currentLevantamento && ctx.currentLevantamento.numero_trt && ctx.currentLevantamento.numero_trt.trim()) {
          trt = ctx.currentLevantamento.numero_trt;
          data = ctx.currentLevantamento.data_trt || "";
        } else {
          const trtVal = prompt("Informe o número do TRT/ART:");
          if (trtVal === null) return;
          const dataVal = prompt("Informe a data de quitação do TRT/ART (AAAA-MM-DD):", new Date().toISOString().substring(0, 10));
          if (dataVal === null) return;
          trt = trtVal;
          data = dataVal;
          
          if (ctx.currentLevantamento) {
            const payload = {
              propriedade_id: ctx.currentLevantamento.propriedade_id,
              profissional_id: ctx.currentLevantamento.profissional_id,
              data_inicio: ctx.currentLevantamento.data_inicio,
              status: ctx.currentLevantamento.status || "EM_ANDAMENTO",
              numero_trt: trt,
              data_trt: data
            };
            try {
              const resPut = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              });
              const resData = await resPut.json();
              if (!resData.error) {
                ctx.currentLevantamento.numero_trt = trt;
                ctx.currentLevantamento.data_trt = data;
              }
            } catch (err) {
              console.error("Erro ao salvar TRT no levantamento:", err);
            }
          }
        }
        
        const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/requerimento-cartorio-html?numero_trt=${encodeURIComponent(trt)}&data_trt=${encodeURIComponent(data)}`;
        window.open(url, '_blank');
      };
    }
    
    const btnResp = document.getElementById('btn-emitir-decl-resp');
    if (btnResp) {
      btnResp.onclick = async () => {
        if (!(await validarPreRequisitosPecas())) return;
        const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/declaracao-responsabilidade-html`;
        window.open(url, '_blank');
      };
    }
    
    const btnLaudo = document.getElementById('btn-emitir-laudo-tec');
    if (btnLaudo) {
      btnLaudo.onclick = async () => {
        if (!(await validarPreRequisitosPecas())) return;
        
        let trt = "";
        let data = "";
        
        if (ctx.currentLevantamento && ctx.currentLevantamento.numero_trt && ctx.currentLevantamento.numero_trt.trim()) {
          trt = ctx.currentLevantamento.numero_trt;
          data = ctx.currentLevantamento.data_trt || "";
        } else {
          const trtVal = prompt("Informe o número do TRT/ART:");
          if (trtVal === null) return;
          const dataVal = prompt("Informe a data de quitação do TRT/ART (AAAA-MM-DD):", new Date().toISOString().substring(0, 10));
          if (dataVal === null) return;
          trt = trtVal;
          data = dataVal;
          
          if (ctx.currentLevantamento) {
            const payload = {
              propriedade_id: ctx.currentLevantamento.propriedade_id,
              profissional_id: ctx.currentLevantamento.profissional_id,
              data_inicio: ctx.currentLevantamento.data_inicio,
              status: ctx.currentLevantamento.status || "EM_ANDAMENTO",
              numero_trt: trt,
              data_trt: data
            };
            try {
              const resPut = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              });
              const resData = await resPut.json();
              if (!resData.error) {
                ctx.currentLevantamento.numero_trt = trt;
                ctx.currentLevantamento.data_trt = data;
              }
            } catch (err) {
              console.error("Erro ao salvar TRT no levantamento:", err);
            }
          }
        }
        
        const equip = prompt("Informe o Equipamento GNSS Utilizado:", "Receptor GNSS Hi-Target V30 / RTK de Dupla Frequência (L1/L2)");
        if (equip === null) return;
        
        const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/laudo-tecnico-html?numero_trt=${encodeURIComponent(trt)}&data_trt=${encodeURIComponent(data)}&equipamento=${encodeURIComponent(equip)}`;
        window.open(url, '_blank');
      };
    }
    
    const btnTermoSigef = document.getElementById('btn-emitir-termo-sigef');
    if (btnTermoSigef) {
      btnTermoSigef.onclick = async () => {
        if (!(await validarPreRequisitosPecas())) return;
        
        let trt = "";
        let data = "";
        
        if (ctx.currentLevantamento && ctx.currentLevantamento.numero_trt && ctx.currentLevantamento.numero_trt.trim()) {
          trt = ctx.currentLevantamento.numero_trt;
          data = ctx.currentLevantamento.data_trt || "";
        } else {
          const trtVal = prompt("Informe o número do TRT/ART:");
          if (trtVal === null) return;
          const dataVal = prompt("Informe a data de quitação do TRT/ART (AAAA-MM-DD):", new Date().toISOString().substring(0, 10));
          if (dataVal === null) return;
          trt = trtVal;
          data = dataVal;
          
          if (ctx.currentLevantamento) {
            const payload = {
              propriedade_id: ctx.currentLevantamento.propriedade_id,
              profissional_id: ctx.currentLevantamento.profissional_id,
              data_inicio: ctx.currentLevantamento.data_inicio,
              status: ctx.currentLevantamento.status || "EM_ANDAMENTO",
              numero_trt: trt,
              data_trt: data
            };
            try {
              const resPut = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              });
              const resData = await resPut.json();
              if (!resData.error) {
                ctx.currentLevantamento.numero_trt = trt;
                ctx.currentLevantamento.data_trt = data;
              }
            } catch (err) {
              console.error("Erro ao salvar TRT no levantamento:", err);
            }
          }
        }
        
        const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/termo-responsabilidade-sigef-html?numero_trt=${encodeURIComponent(trt)}&data_trt=${encodeURIComponent(data)}`;
        window.open(url, '_blank');
      };
    }
    
    const btnManualProprietario = document.getElementById('btn-emitir-manual-proprietario');
    if (btnManualProprietario) {
      btnManualProprietario.onclick = async () => {
        if (!(await validarPreRequisitosPecas())) return;
        const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/manual-proprietario-html`;
        window.open(url, '_blank');
      };
    }
    
    const btnAnuenciaDesmembramento = document.getElementById('btn-emitir-anuencia-desmembramento');
    if (btnAnuenciaDesmembramento) {
      btnAnuenciaDesmembramento.onclick = async () => {
        if (!(await validarPreRequisitosPecas())) return;
        const cnsVal = prompt("Informe o Código CNS do Cartório de Registro de Imóveis (opcional):", "");
        if (cnsVal === null) return;
        const qtdVal = prompt("Informe a quantidade de novas parcelas resultantes do desmembramento:", "3");
        if (qtdVal === null) return;
        
        let url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/declaracao-anuencia-desmembramento-html?qtd_parcelas=${encodeURIComponent(qtdVal || "3")}`;
        if (cnsVal.trim()) {
          url += `&codigo_cns=${encodeURIComponent(cnsVal.trim())}`;
        }
        window.open(url, '_blank');
      };
    }

    const btnDispensaVia = document.getElementById('btn-emitir-dispensa-via');
    if (btnDispensaVia) {
      btnDispensaVia.onclick = async () => {
        if (!(await validarPreRequisitosPecas())) return;
        // TRT/ART: o servidor usa a salva no levantamento (lacuna se não houver)
        const faixaVal = prompt("Largura da faixa de domínio da estrada, em metros (opcional; ex.: 15):", "");
        if (faixaVal === null) return;
        const naoEdifVal = prompt("Largura da área non aedificandi, em metros (opcional; ex.: 15):", "");
        if (naoEdifVal === null) return;
        const params = new URLSearchParams();
        if (faixaVal.trim()) params.set('faixa_dominio_m', faixaVal.trim());
        if (naoEdifVal.trim()) params.set('faixa_nao_edificante_m', naoEdifVal.trim());
        const qs = params.toString();
        const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/declaracao-dispensa-via-html${qs ? `?${qs}` : ''}`;
        try {
          const resp = await fetch(url);
          if (!resp.ok) {
            const erro = await resp.json().catch(() => null);
            showToast(erro?.detail || 'Não foi possível gerar a dispensa de anuência de estrada.', 'info');
            return;
          }
        } catch {
          showToast('Falha de comunicação ao gerar a dispensa de anuência de estrada.', 'info');
          return;
        }
        window.open(url, '_blank');
      };
    }

    const btnAverbacaoCasamento = document.getElementById('btn-emitir-averbacao-casamento');
    if (btnAverbacaoCasamento) {
      btnAverbacaoCasamento.onclick = async () => {
        if (!(await validarPreRequisitosPecas())) return;
        const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/requerimento-averbacao-casamento-html`;
        window.open(url, '_blank');
      };
    }


    const btnAnuencia = document.getElementById('btn-emitir-anuencia');
    if (btnAnuencia) {
      btnAnuencia.onclick = async () => {
        if (!(await validarPreRequisitosPecas())) return;
        const select = document.getElementById('select-confrontante-anuencia') as HTMLSelectElement;
        const confId = select ? select.value : '';
        if (!confId) {
          showToast("Selecione um confrontante da lista ou a opção de Lote para emitir a anuência.", "info");
          return;
        }
        
        let url = "";
        if (confId === "lote") {
          url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/anuencia-lote-html`;
        } else {
          url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/confrontantes/${confId}/anuencia-html`;
        }
        window.open(url, '_blank');
      };
    }

    // =========================================================================
    // PRÉ-VISUALIZAÇÃO DA DIVISA DE ANUÊNCIA (MAPA + CROQUI + DADOS TÉCNICOS)
    // =========================================================================
    let previewAnuenciaMap: L.Map | null = null;
    let currentPreviewConfId: string | number | null = null;
    let tileLayerSatelite: L.TileLayer | null = null;
    let tileLayerDark: L.TileLayer | null = null;

    const modalPreview = document.getElementById('modal-preview-divisa-anuencia') as HTMLElement;
    const loaderMapaPreview = document.getElementById('loader-mapa-preview-anuencia') as HTMLElement;

    const fecharModalPreview = () => {
      if (modalPreview) modalPreview.classList.add('hidden');
      if (previewAnuenciaMap) {
        previewAnuenciaMap.remove();
        previewAnuenciaMap = null;
      }
      currentPreviewConfId = null;
    };

    const btnFecharPreview = document.getElementById('btn-fechar-modal-preview-anuencia');
    const btnCancelarPreview = document.getElementById('btn-preview-cancelar');
    if (btnFecharPreview) btnFecharPreview.onclick = fecharModalPreview;
    if (btnCancelarPreview) btnCancelarPreview.onclick = fecharModalPreview;

    const btnGerarOficialPreview = document.getElementById('btn-preview-gerar-anuencia');
    if (btnGerarOficialPreview) {
      btnGerarOficialPreview.onclick = () => {
        if (!currentPreviewConfId || !ctx.currentLevId || !ctx.currentMatriculaId) return;
        const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/confrontantes/${currentPreviewConfId}/anuencia-html`;
        window.open(url, '_blank');
      };
    }

    const btnFocarCad = document.getElementById('btn-preview-focar-cad');
    if (btnFocarCad) {
      btnFocarCad.onclick = () => {
        fecharModalPreview();
        const tabGeodesica = document.querySelector('[data-tab="mesa_geodesica"]') as HTMLElement;
        if (tabGeodesica) tabGeodesica.click();
        showToast("Visualizando perímetro no Canvas CAD.", "info");
      };
    }

    const abrirPreviewDivisaAnuencia = async (confrontanteId: string | number) => {
      if (!ctx.currentLevId || !ctx.currentMatriculaId) {
        showToast("Selecione um levantamento e matrícula válidos.", "info");
        return;
      }
      if (!confrontanteId || confrontanteId === "lote") {
        showToast("Selecione um confrontante individual para visualizar o pedaço da propriedade.", "info");
        return;
      }

      currentPreviewConfId = confrontanteId;
      if (!modalPreview) return;
      modalPreview.classList.remove('hidden');
      if (loaderMapaPreview) loaderMapaPreview.classList.remove('hidden');

      const badgeConf = document.getElementById('preview-anuencia-badge-conf');
      const txtSubtitulo = document.getElementById('preview-anuencia-subtitulo');
      const txtExtensao = document.getElementById('preview-anuencia-extensao');
      const txtCaminhamento = document.getElementById('preview-anuencia-caminhamento');
      const txtQtdVertices = document.getElementById('preview-anuencia-qtd-vertices');
      const txtQtdSegmentos = document.getElementById('preview-anuencia-qtd-segmentos');
      const txtNomeConf = document.getElementById('preview-anuencia-nome-conf');
      const txtCpfConf = document.getElementById('preview-anuencia-cpf-conf');
      const txtMatConf = document.getElementById('preview-anuencia-mat-conf');
      const txtImovelReq = document.getElementById('preview-anuencia-imovel-req');
      const tbodySegs = document.getElementById('preview-anuencia-tbody-segmentos');
      const statusGeo = document.getElementById('preview-anuencia-status-geo');

      if (badgeConf) badgeConf.innerText = "CARREGANDO...";
      if (tbodySegs) {
        tbodySegs.innerHTML = `<tr><td colspan="3" class="py-4 text-center text-white/40 italic">Buscando dados da divisa...</td></tr>`;
      }

      try {
        const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/confrontantes/${confrontanteId}/preview-divisa`;
        const res = await fetch(url);
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: "Falha ao obter geometria." }));
          throw new Error(err.detail || "Falha ao obter dados do trecho da divisa.");
        }
        const data = await res.json();

        if (badgeConf) badgeConf.innerText = data.confrontante.nome || "CONFRONTANTE";
        if (txtSubtitulo) {
          txtSubtitulo.innerText = `Confrontação com ${data.imovel.nome} (${data.imovel.matricula ? `Matrícula ${data.imovel.matricula}` : 'Área do Projeto'})`;
        }
        if (txtNomeConf) txtNomeConf.innerText = data.confrontante.nome || "-";
        if (txtCpfConf) txtCpfConf.innerText = data.confrontante.cpf_cnpj || "Não informado";
        if (txtMatConf) {
          const parts = [
            data.confrontante.lote ? `Lote ${data.confrontante.lote}` : '',
            data.confrontante.matricula_imovel && data.confrontante.matricula_imovel !== 'Não informada' ? `Mat. ${data.confrontante.matricula_imovel}` : ''
          ].filter(Boolean);
          txtMatConf.innerText = parts.length > 0 ? parts.join(' - ') : (data.confrontante.matricula_imovel || "Não informada");
        }
        if (txtImovelReq) {
          txtImovelReq.innerText = `${data.imovel.nome} - Matrícula ${data.imovel.matricula || 'S/N'}`;
        }

        const metricas = data.metricas || {};
        if (txtExtensao) txtExtensao.innerText = metricas.extensao_total_str || "0.00 m";
        if (txtCaminhamento) {
          txtCaminhamento.innerText = (metricas.vertice_inicial && metricas.vertice_final && metricas.vertice_inicial !== "-") 
            ? `${metricas.vertice_inicial} ➔ ${metricas.vertice_final}` 
            : "Não encadeado";
        }
        if (txtQtdVertices) txtQtdVertices.innerText = `${metricas.qtd_vertices || 0} vértices`;
        if (txtQtdSegmentos) txtQtdSegmentos.innerText = `${metricas.qtd_segmentos || 0} segmentos`;

        if (statusGeo) {
          if ((metricas.qtd_segmentos || 0) > 0) {
            statusGeo.innerText = "TRECHO VÁLIDO";
            statusGeo.className = "text-[9px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold";
          } else {
            statusGeo.innerText = "SEM SEGMENTOS";
            statusGeo.className = "text-[9px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold";
          }
        }

        // Tabela de segmentos
        if (tbodySegs) {
          if (Array.isArray(data.segmentos) && data.segmentos.length > 0) {
            tbodySegs.innerHTML = data.segmentos.map((s: any) => `
              <tr class="border-b border-white/5 hover:bg-white/[0.03] transition-colors font-mono">
                <td class="py-1.5 px-1.5 font-bold text-white">${s.de} <span class="text-mint-vibrant">➔</span> ${s.para}</td>
                <td class="py-1.5 px-1.5 text-right text-white/80">${s.azimute}</td>
                <td class="py-1.5 px-1.5 text-right font-bold text-mint-vibrant">${s.distancia_str}</td>
              </tr>
            `).join('');
          } else {
            tbodySegs.innerHTML = `
              <tr>
                <td colspan="3" class="py-4 text-center text-amber-400/80 italic">
                  Nenhum segmento da matrícula foi vinculado a este confrontante na Etapa 2 de Definição de Limites.
                </td>
              </tr>
            `;
          }
        }

        // Mapa Leaflet
        const mapContainer = document.getElementById('mapa-preview-anuencia-divisa');
        if (mapContainer) {
          if (previewAnuenciaMap) {
            previewAnuenciaMap.remove();
            previewAnuenciaMap = null;
          }

          previewAnuenciaMap = L.map(mapContainer, {
            attributionControl: false,
            zoomControl: true,
            maxZoom: 22
          });

          tileLayerSatelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 20
          });

          tileLayerDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 20,
            subdomains: 'abcd'
          });

          tileLayerSatelite.addTo(previewAnuenciaMap);

          const btnSat = document.getElementById('btn-preview-tile-satelite');
          const btnDark = document.getElementById('btn-preview-tile-escuro');
          if (btnSat && btnDark) {
            btnSat.onclick = () => {
              if (tileLayerDark && previewAnuenciaMap?.hasLayer(tileLayerDark)) previewAnuenciaMap.removeLayer(tileLayerDark);
              if (tileLayerSatelite && previewAnuenciaMap && !previewAnuenciaMap.hasLayer(tileLayerSatelite)) tileLayerSatelite.addTo(previewAnuenciaMap);
              btnSat.className = "px-2 py-1 text-[10px] font-bold rounded bg-mint-vibrant text-slate-900 transition-all shadow-sm";
              btnDark.className = "px-2 py-1 text-[10px] font-bold rounded text-white/70 hover:text-white transition-all";
            };
            btnDark.onclick = () => {
              if (tileLayerSatelite && previewAnuenciaMap?.hasLayer(tileLayerSatelite)) previewAnuenciaMap.removeLayer(tileLayerSatelite);
              if (tileLayerDark && previewAnuenciaMap && !previewAnuenciaMap.hasLayer(tileLayerDark)) tileLayerDark.addTo(previewAnuenciaMap);
              btnDark.className = "px-2 py-1 text-[10px] font-bold rounded bg-mint-vibrant text-slate-900 transition-all shadow-sm";
              btnSat.className = "px-2 py-1 text-[10px] font-bold rounded text-white/70 hover:text-white transition-all";
            };
          }

          const boundsGroup = L.featureGroup();

          // Desenha polígono geral
          if (Array.isArray(data.poligono_imovel) && data.poligono_imovel.length >= 3) {
            const polyImovel = L.polygon(data.poligono_imovel, {
              color: '#94a3b8',
              weight: 2,
              dashArray: '5, 5',
              fillColor: '#00f5a0',
              fillOpacity: 0.04
            }).addTo(previewAnuenciaMap);
            polyImovel.bindTooltip("Limite Geral do Imóvel", { sticky: true });
            boundsGroup.addLayer(polyImovel);
          }

          // Desenha divisa lindeira em destaque
          if (Array.isArray(data.lindeira_coords) && data.lindeira_coords.length > 0) {
            const polylineLindeira = L.polyline(data.lindeira_coords, {
              color: '#00f5a0',
              weight: 6,
              opacity: 0.95
            }).addTo(previewAnuenciaMap);

            polylineLindeira.bindTooltip(`Divisa: ${data.confrontante.nome} (${metricas.extensao_total_str || ''})`, {
              sticky: true,
              className: 'bg-[#0c1510] text-mint-vibrant font-bold font-mono text-[10px] border border-mint-vibrant/30 rounded px-2 py-1 shadow-xl'
            });
            boundsGroup.addLayer(polylineLindeira);
          }

          // Marcadores circulares nos vértices
          if (Array.isArray(data.lindeira_pontos)) {
            data.lindeira_pontos.forEach((p: any) => {
              if (p.coords && p.coords.length === 2) {
                const marker = L.circleMarker(p.coords, {
                  radius: p.is_extremo ? 6 : 4,
                  color: '#00f5a0',
                  fillColor: p.is_extremo ? '#ffffff' : '#0c1510',
                  fillOpacity: 1,
                  weight: 2
                }).addTo(previewAnuenciaMap!);

                marker.bindTooltip(`Vértice ${p.nome}`, {
                  permanent: p.is_extremo,
                  direction: 'top',
                  className: 'bg-[#0c1510] text-white font-bold font-mono text-[9px] border border-white/20 rounded px-1.5 py-0.5'
                });
                boundsGroup.addLayer(marker);
              }
            });
          }

          setTimeout(() => {
            if (previewAnuenciaMap) {
              previewAnuenciaMap.invalidateSize();
              if (boundsGroup.getLayers().length > 0) {
                previewAnuenciaMap.fitBounds(boundsGroup.getBounds(), { padding: [40, 40], maxZoom: 19 });
              }
            }
            if (loaderMapaPreview) loaderMapaPreview.classList.add('hidden');
          }, 250);
        }
      } catch (err: any) {
        console.error("Erro ao carregar pré-visualização da divisa:", err);
        showToast(err.message || "Erro ao carregar pré-visualização da divisa.", "error");
        if (loaderMapaPreview) loaderMapaPreview.classList.add('hidden');
      }

      initIcons();
    };

    (window as any).abrirPreviewDivisaAnuenciaGlobal = abrirPreviewDivisaAnuencia;

    const btnPreviewAnuencia = document.getElementById('btn-preview-anuencia');
    if (btnPreviewAnuencia) {
      btnPreviewAnuencia.onclick = () => {
        const select = document.getElementById('select-confrontante-anuencia') as HTMLSelectElement;
        const confId = select ? select.value : '';
        if (!confId || confId === 'lote') {
          showToast("Selecione um confrontante da lista para pré-visualizar a divisa.", "info");
          return;
        }
        abrirPreviewDivisaAnuencia(confId);
      };
    }

    const btnPreviewDivisaForm = document.getElementById('btn-preview-divisa-form');
    if (btnPreviewDivisaForm) {
      btnPreviewDivisaForm.onclick = () => {
        const inputConf = document.getElementById('input-conf-id') as HTMLInputElement;
        const containerF = document.getElementById('container-form-confrontante') as HTMLElement;
        const confId = inputConf ? inputConf.value : (containerF ? containerF.dataset.confrontanteId : '');
        if (!confId) {
          showToast("Selecione ou salve o confrontante primeiro para pré-visualizar sua divisa.", "info");
          return;
        }
        abrirPreviewDivisaAnuencia(confId);
      };
    }

    const selectAnuencia = document.getElementById('select-confrontante-anuencia') as HTMLSelectElement;
    const containerForm = document.getElementById('container-form-confrontante') as HTMLElement;
    const inputConfId = document.getElementById('input-conf-id') as HTMLInputElement;
    const txtConfIdEdicao = document.getElementById('txt-conf-id-edicao') as HTMLElement;
    const badgeConfStatus = document.getElementById('badge-conf-status') as HTMLElement;
    const formConfrontante = document.getElementById('form-edicao-confrontante') as HTMLFormElement;
    const btnNovoConf = document.getElementById('btn-novo-confrontante-cartorio') as HTMLElement;
    const btnFecharCard = document.getElementById('btn-fechar-card-confrontante') as HTMLElement;
    const btnCancelarConf = document.getElementById('btn-cancelar-confrontante-qualificacao') as HTMLElement;
    const btnSalvarConf = document.getElementById('btn-salvar-confrontante-qualificacao') as HTMLElement;
    const inputCpf = document.getElementById('input-conf-cpf') as any;
    const inputCpfConjuge = document.getElementById('input-conf-conjuge-cpf') as any;
    const fileInputMatricula = document.getElementById('file-matricula-conf') as HTMLInputElement;
    const statusBuscaCpf = document.getElementById('status-busca-cpf') as HTMLElement;
    const containerCoproprietarios = document.getElementById('lista-coproprietarios-container');
    const btnAddCoprop = document.getElementById('btn-adicionar-coproprietario');

    let coproprietariosAtuais: any[] = [];

    const renderizarCardsCoproprietarios = () => {
      if (!containerCoproprietarios) return;
      if (coproprietariosAtuais.length === 0) {
        containerCoproprietarios.innerHTML = `
          <div class="py-3 px-4 rounded-technical border border-dashed border-white/10 text-center text-[11px] text-white/40">
             Nenhum coproprietário adicional cadastrado. <span class="text-white/60">Apenas o titular acima assinará a anuência (conforme Art. 213, § 10 da Lei 6.015/73).</span>
          </div>
        `;
        return;
      }

      containerCoproprietarios.innerHTML = coproprietariosAtuais.map((cp, idx) => {
        const estCiv = (cp.estado_civil || 'solteiro').toLowerCase();
        const casado = estCiv.includes('casad') || estCiv.includes('estav') || estCiv.includes('estáv') || estCiv === 'uniao_estavel';
        const ehSepTotal = normalizarRegimeBens(cp.regime_bens) === 'separacao_total';
        const conjugeAssina = !(cp.conjuge_assina === false || cp.conjuge_assina === 0);
        const cpfFmt = cp.cpf_cnpj ? formatarCpfCnpjDinamico(cp.cpf_cnpj) : '';
        const cpfConjFmt = cp.cpf_conjuge ? formatarCpfCnpjDinamico(cp.cpf_conjuge) : '';
        
        return `
          <div class="card-coproprietario p-3.5 bg-white/[0.015] border border-white/10 rounded-technical space-y-3 relative group" data-idx="${idx}">
             <div class="flex items-center justify-between border-b border-white/5 pb-2">
                <div class="flex items-center gap-2">
                   <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-white/5 border border-white/10 text-mint-vibrant">
                      Coproprietário #${idx + 1}
                   </span>
                   <span class="text-[10px] text-white/40">Condômino da matrícula lindeira</span>
                   <label class="flex items-center gap-1.5 ml-2 text-[11px] text-white/80 cursor-pointer">
                      <input type="checkbox" class="chk-coprop-assina accent-emerald-400 w-3.5 h-3.5" data-idx="${idx}" ${cp.assina === false || cp.assina === 0 ? '' : 'checked'}>
                      Assina
                   </label>
                </div>
                <button type="button" class="btn-remover-coprop text-red-400 hover:text-red-300 hover:bg-red-500/10 p-1.5 rounded transition-all cursor-pointer" data-idx="${idx}" title="Remover coproprietário">
                   <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
             </div>
             
             <!-- Linha 1: CPF, Nome, RG -->
             <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-end">
                <div class="col-span-1">
                   <div class="flex justify-between items-center mb-1">
                      <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40">CPF / CNPJ</label>
                      <span class="status-coprop-cpf text-[10px] text-mint-vibrant font-medium hidden" data-idx="${idx}"></span>
                   </div>
                   <ui-campo-texto type="text" class="input-coprop-cpf w-full" data-field="cpf_cnpj" data-idx="${idx}" placeholder="000.000.000-00" value="${escapeHtml(cpfFmt)}"></ui-campo-texto>
                </div>
                <div class="col-span-1 sm:col-span-2 lg:col-span-2">
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Nome Completo *</label>
                   <ui-campo-texto type="text" class="input-coprop-nome w-full" data-field="nome" data-idx="${idx}" placeholder="Nome do coproprietário" value="${escapeHtml(cp.nome || '')}" required></ui-campo-texto>
                </div>
                <div class="col-span-1">
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">RG / Órgão</label>
                   <ui-campo-texto type="text" class="input-coprop-rg w-full" data-field="rg" data-idx="${idx}" placeholder="RG" value="${escapeHtml(cp.rg || '')}"></ui-campo-texto>
                </div>
             </div>

             <!-- Linha 2: Gênero, Nacionalidade, Profissão, Estado Civil -->
             <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-end">
                <div>
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Gênero</label>
                   <ui-lista-flutuante class="select-coprop-genero w-full" data-field="genero" data-idx="${idx}">
                      <option value="M" ${cp.genero === 'M' || !cp.genero ? 'selected' : ''}>Homem</option>
                      <option value="F" ${cp.genero === 'F' ? 'selected' : ''}>Mulher</option>
                   </ui-lista-flutuante>
                </div>
                <div>
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Nacionalidade</label>
                   <ui-campo-texto type="text" class="input-coprop-nacionalidade w-full" data-field="nacionalidade" data-idx="${idx}" placeholder="brasileiro(a)" value="${escapeHtml(cp.nacionalidade || 'brasileiro(a)')}"></ui-campo-texto>
                </div>
                <div>
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Profissão</label>
                   <ui-campo-texto type="text" class="input-coprop-profissao w-full" data-field="profissao" data-idx="${idx}" placeholder="Profissão" value="${escapeHtml(cp.profissao || '')}"></ui-campo-texto>
                </div>
                <div>
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Estado Civil</label>
                   <ui-lista-flutuante class="select-coprop-estado-civil w-full" data-field="estado_civil" data-idx="${idx}">
                      <option value="solteiro" ${estCiv === 'solteiro' ? 'selected' : ''}>Solteiro(a)</option>
                      <option value="casado" ${estCiv === 'casado' ? 'selected' : ''}>Casado(a)</option>
                      <option value="uniao_estavel" ${estCiv === 'uniao_estavel' ? 'selected' : ''}>União Estável</option>
                      <option value="divorciado" ${estCiv === 'divorciado' ? 'selected' : ''}>Divorciado(a)</option>
                      <option value="viuvo" ${estCiv === 'viuvo' ? 'selected' : ''}>Viúvo(a)</option>
                   </ui-lista-flutuante>
                </div>
             </div>

             <!-- Linha 3: Regime de Bens e Endereço -->
             <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-end">
                <div class="col-span-1">
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Regime de Bens</label>
                   <ui-lista-flutuante class="select-coprop-regime w-full" data-field="regime_bens" data-idx="${idx}" ${!casado ? 'disabled' : ''}>
                      <option value="" ${!cp.regime_bens ? 'selected' : ''}>Não se aplica</option>
                      <option value="comunhao_parcial" ${cp.regime_bens === 'comunhao_parcial' ? 'selected' : ''}>Comunhão Parcial</option>
                      <option value="comunhao_universal" ${cp.regime_bens === 'comunhao_universal' ? 'selected' : ''}>Comunhão Universal</option>
                      <option value="separacao_total" ${cp.regime_bens === 'separacao_total' ? 'selected' : ''}>Separação Total</option>
                      <option value="participacao_final" ${cp.regime_bens === 'participacao_final' ? 'selected' : ''}>Participação Final nos Aquestos</option>
                   </ui-lista-flutuante>
                </div>
                <div class="col-span-1 sm:col-span-2 lg:col-span-3">
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Endereço de Domicílio</label>
                   <ui-campo-texto type="text" class="input-coprop-endereco w-full" data-field="endereco_completo" data-idx="${idx}" placeholder="Deixe em branco para usar o mesmo do titular" value="${escapeHtml(cp.endereco_completo || '')}"></ui-campo-texto>
                </div>
             </div>

             <!-- Bloco Cônjuge do Coproprietário -->
             <div class="box-coprop-conjuge p-3 bg-white/[0.02] border border-white/5 rounded-technical space-y-2.5 ${casado ? '' : 'hidden'}" data-idx="${idx}">
                <div class="flex items-center gap-1.5 border-b border-white/5 pb-1.5">
                   <i data-lucide="users" class="w-3 h-3 text-mint-vibrant"></i>
                   <span class="text-[10px] font-bold uppercase tracking-wider text-mint-vibrant">Cônjuge do Coproprietário</span>
                </div>
                <label class="box-coprop-conjuge-assina ${casado && ehSepTotal ? '' : 'hidden'} flex items-center gap-2 px-3 py-1.5 rounded-technical bg-mint-vibrant/5 border border-mint-vibrant/20 text-[10px] text-white/80 cursor-pointer">
                   <input type="checkbox" class="chk-coprop-conjuge-assina accent-emerald-400 w-3.5 h-3.5" data-idx="${idx}" ${conjugeAssina ? 'checked' : ''}>
                   <span><strong>Incluir assinatura do cônjuge</strong> na anuência <span class="text-white/40">(separação total de bens)</span></span>
                </label>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                   <div class="col-span-1 sm:col-span-2 lg:col-span-2">
                      <label class="block text-[10px] font-medium tracking-wider uppercase text-white/40 mb-1">Nome do Cônjuge</label>
                      <ui-campo-texto type="text" class="w-full" data-field="nome_conjuge" data-idx="${idx}" placeholder="Nome completo" value="${escapeHtml(cp.nome_conjuge || '')}"></ui-campo-texto>
                   </div>
                   <div class="col-span-1">
                      <label class="block text-[10px] font-medium tracking-wider uppercase text-white/40 mb-1">CPF do Cônjuge</label>
                      <ui-campo-texto type="text" class="input-coprop-cpf-conjuge w-full" data-field="cpf_conjuge" data-idx="${idx}" placeholder="000.000.000-00" value="${escapeHtml(cpfConjFmt)}"></ui-campo-texto>
                   </div>
                   <div class="col-span-1">
                      <label class="block text-[10px] font-medium tracking-wider uppercase text-white/40 mb-1">RG do Cônjuge</label>
                      <ui-campo-texto type="text" class="w-full" data-field="rg_conjuge" data-idx="${idx}" placeholder="RG" value="${escapeHtml(cp.rg_conjuge || '')}"></ui-campo-texto>
                   </div>
                   <div class="col-span-1">
                      <label class="block text-[10px] font-medium tracking-wider uppercase text-white/40 mb-1">Gênero</label>
                      <ui-lista-flutuante class="w-full" data-field="genero_conjuge" data-idx="${idx}">
                         <option value="F" ${cp.genero_conjuge === 'F' || !cp.genero_conjuge ? 'selected' : ''}>Mulher</option>
                         <option value="M" ${cp.genero_conjuge === 'M' ? 'selected' : ''}>Homem</option>
                      </ui-lista-flutuante>
                   </div>
                   <div class="col-span-1">
                      <label class="block text-[10px] font-medium tracking-wider uppercase text-white/40 mb-1">Nacionalidade</label>
                      <ui-campo-texto type="text" class="w-full" data-field="nacionalidade_conjuge" data-idx="${idx}" placeholder="brasileiro(a)" value="${escapeHtml(cp.nacionalidade_conjuge || 'brasileiro(a)')}"></ui-campo-texto>
                   </div>
                   <div class="col-span-1 sm:col-span-2 lg:col-span-2">
                      <label class="block text-[10px] font-medium tracking-wider uppercase text-white/40 mb-1">Profissão do Cônjuge</label>
                      <ui-campo-texto type="text" class="w-full" data-field="profissao_conjuge" data-idx="${idx}" placeholder="Profissão" value="${escapeHtml(cp.profissao_conjuge || '')}"></ui-campo-texto>
                   </div>
                </div>
             </div>
          </div>
        `;
      }).join('');

      initIcons();
      vincularEventosCardsCoproprietarios();
    };

    const vincularEventosCardsCoproprietarios = () => {
      if (!containerCoproprietarios) return;

      containerCoproprietarios.querySelectorAll('.btn-remover-coprop').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = Number((e.currentTarget as HTMLElement).dataset.idx);
          if (!isNaN(idx) && idx >= 0 && idx < coproprietariosAtuais.length) {
            coproprietariosAtuais.splice(idx, 1);
            renderizarCardsCoproprietarios();
          }
        });
      });

      containerCoproprietarios.querySelectorAll('[data-field]').forEach(input => {
        const handler = (e: any) => {
          const idx = Number(input.getAttribute('data-idx'));
          const field = input.getAttribute('data-field');
          if (isNaN(idx) || !field || !coproprietariosAtuais[idx]) return;
          coproprietariosAtuais[idx][field] = e.target.value;
          
          if (field === 'estado_civil' || field === 'regime_bens') {
            if (field === 'estado_civil') {
              coproprietariosAtuais[idx].estado_civil = normalizarEstadoCivil(e.target.value);
            } else {
              coproprietariosAtuais[idx].regime_bens = normalizarRegimeBens(e.target.value);
            }
            const val = normalizarEstadoCivil(coproprietariosAtuais[idx].estado_civil);
            const casado = val.includes('casad') || val.includes('estav') || val.includes('estáv') || val === 'uniao_estavel';
            const card = containerCoproprietarios.querySelector(`.card-coproprietario[data-idx="${idx}"]`);
            const boxConj = card?.querySelector('.box-coprop-conjuge');
            const selectReg = card?.querySelector('.select-coprop-regime') as any;
            const boxConjAssina = card?.querySelector('.box-coprop-conjuge-assina');
            const chkConjAssina = card?.querySelector('.chk-coprop-conjuge-assina') as HTMLInputElement | null;
            if (boxConj) {
              boxConj.classList.toggle('hidden', !casado);
            }
            if (selectReg) {
              if (casado) selectReg.removeAttribute('disabled');
              else {
                selectReg.setAttribute('disabled', '');
                selectReg.value = '';
                coproprietariosAtuais[idx].regime_bens = '';
              }
            }
            const ehSepTotal = casado && normalizarRegimeBens(coproprietariosAtuais[idx].regime_bens) === 'separacao_total';
            if (boxConjAssina) {
              boxConjAssina.classList.toggle('hidden', !ehSepTotal);
            }
            if (!ehSepTotal) {
              coproprietariosAtuais[idx].conjuge_assina = true;
              if (chkConjAssina) chkConjAssina.checked = true;
            }
          }
        };

        input.addEventListener('input', handler);
        input.addEventListener('change', handler);
        input.addEventListener('ui-selecionar', handler);
      });

      containerCoproprietarios.querySelectorAll('.chk-coprop-assina').forEach(chk => {
        chk.addEventListener('change', () => {
          const i = Number(chk.getAttribute('data-idx'));
          if (coproprietariosAtuais[i]) coproprietariosAtuais[i].assina = (chk as HTMLInputElement).checked;
        });
      });

      containerCoproprietarios.querySelectorAll('.chk-coprop-conjuge-assina').forEach(chk => {
        chk.addEventListener('change', () => {
          const i = Number(chk.getAttribute('data-idx'));
          if (coproprietariosAtuais[i]) coproprietariosAtuais[i].conjuge_assina = (chk as HTMLInputElement).checked;
        });
      });

      containerCoproprietarios.querySelectorAll('.input-coprop-cpf').forEach(input => {
        const idx = Number(input.getAttribute('data-idx'));
        const statusEl = containerCoproprietarios.querySelector(`.status-coprop-cpf[data-idx="${idx}"]`) as HTMLElement;

        const buscarCpf = async (val: string) => {
          if (!val) return;
          const limpo = val.replace(/\D/g, '');
          if (limpo.length !== 11 && limpo.length !== 14) return;
          const cpAtual = coproprietariosAtuais[idx];
          if (!cpAtual || cpAtual._ultimoCpfBuscado === limpo) return;
          cpAtual._ultimoCpfBuscado = limpo;

          if (statusEl) {
            statusEl.innerText = 'Buscando...';
            statusEl.classList.remove('hidden');
          }
          try {
            const res = await fetch(`${API_BASE}/confrontantes/buscar-por-cpf?cpf=${encodeURIComponent(limpo)}`);
            if (res.ok) {
              const data = await res.json();
              if (data && data.nome && coproprietariosAtuais[idx]) {
                coproprietariosAtuais[idx].nome = data.nome || '';
                coproprietariosAtuais[idx].rg = data.rg || '';
                coproprietariosAtuais[idx].genero = data.genero || 'M';
                coproprietariosAtuais[idx].nacionalidade = data.nacionalidade || 'brasileiro(a)';
                coproprietariosAtuais[idx].profissao = data.profissao || '';
                coproprietariosAtuais[idx].estado_civil = normalizarEstadoCivil(data.estado_civil);
                coproprietariosAtuais[idx].regime_bens = normalizarRegimeBens(data.regime_bens);
                coproprietariosAtuais[idx].nome_conjuge = data.nome_conjuge || '';
                coproprietariosAtuais[idx].cpf_conjuge = data.cpf_conjuge || '';
                coproprietariosAtuais[idx].rg_conjuge = data.rg_conjuge || '';
                coproprietariosAtuais[idx].genero_conjuge = data.genero_conjuge || 'F';
                coproprietariosAtuais[idx].nacionalidade_conjuge = data.nacionalidade_conjuge || 'brasileiro(a)';
                coproprietariosAtuais[idx].profissao_conjuge = data.profissao_conjuge || '';
                coproprietariosAtuais[idx].endereco_completo = data.endereco_completo || '';
                renderizarCardsCoproprietarios();
                showToast("✨ Dados do coproprietário preenchidos automaticamente!", "success");
              }
            }
          } catch (e) {
            if (coproprietariosAtuais[idx]) coproprietariosAtuais[idx]._ultimoCpfBuscado = '';
            console.error(e);
          } finally {
            if (statusEl) statusEl.classList.add('hidden');
          }
        };

        input.addEventListener('input', (e: any) => {
          e.target.value = formatarCpfCnpjDinamico(e.target.value);
          const limpo = e.target.value.replace(/\D/g, '');
          if (limpo.length === 11 || limpo.length === 14) {
            buscarCpf(e.target.value);
          }
        });
        input.addEventListener('blur', (e: any) => {
          buscarCpf(e.target.value);
        });
      });
    };

    if (btnAddCoprop) {
      btnAddCoprop.onclick = () => {
        coproprietariosAtuais.push({
          nome: '',
          cpf_cnpj: '',
          rg: '',
          genero: 'M',
          nacionalidade: 'brasileiro(a)',
          profissao: '',
          estado_civil: 'solteiro',
          regime_bens: '',
          nome_conjuge: '',
          cpf_conjuge: '',
          rg_conjuge: '',
          genero_conjuge: 'F',
          nacionalidade_conjuge: 'brasileiro(a)',
          profissao_conjuge: '',
          endereco_completo: '',
          assina: true,
          conjuge_assina: true
        });
        renderizarCardsCoproprietarios();
        setTimeout(() => {
          const ultimoNome = containerCoproprietarios?.querySelector(`.card-coproprietario[data-idx="${coproprietariosAtuais.length - 1}"] .input-coprop-nome`) as any;
          ultimoNome?.focus?.();
        }, 50);
      };
    }

    // ── Bloco Anexo: Usufruto / Doação da Nua Propriedade ───────────────────────────
    const containerUsufruto = document.getElementById('lista-usufruto-container');
    const badgeUsufrutoQtd = document.getElementById('badge-usufruto-qtd');
    const btnAddUsufruto = document.getElementById('btn-adicionar-usufruto');
    const btnGerarDrlUsufruto = document.getElementById('btn-gerar-drl-usufruto') as HTMLButtonElement | null;
    let usufrutoEnvolvidosAtuais: any[] = [];
    let usufrutoCarregado = true; // false quando a leitura do servidor falhou
    // O salvamento principal é definido mais abaixo; o botão da DRL o chama por esta referência.
    const salvarQualificacaoRef: { fn?: (opts?: { manterAberto?: boolean }) => Promise<string | null> } = {};

    const atualizarBadgeUsufruto = () => {
      if (badgeUsufrutoQtd) {
        const n = usufrutoEnvolvidosAtuais.length;
        badgeUsufrutoQtd.textContent = `${n} ${n === 1 ? 'envolvido' : 'envolvidos'}`;
        badgeUsufrutoQtd.className = n > 0
          ? 'text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-300 border border-amber-400/20'
          : 'text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-white/40 border border-white/10';
      }
    };

    // Recolhido por padrão (recurso avançado); abre sozinho só se o confrontante já tem envolvidos
    const boxUsufruto = document.getElementById('box-usufruto-anexo') as HTMLDetailsElement | null;
    const definirUsufrutoAberto = (aberto: boolean) => { if (boxUsufruto) boxUsufruto.open = aberto; };

    const renderizarCardsUsufruto = () => {
      atualizarBadgeUsufruto();
      if (!containerUsufruto) return;
      if (usufrutoEnvolvidosAtuais.length === 0) {
        containerUsufruto.innerHTML = `
          <div class="py-3 px-4 rounded-technical border border-dashed border-amber-400/20 text-center text-[11px] text-white/40">
             Nenhum envolvido de usufruto/doação cadastrado. <span class="text-white/60">Clique em "Adicionar Envolvido" para incluir usufrutuários e donatários (nu-proprietários).</span>
          </div>
        `;
        return;
      }

      containerUsufruto.innerHTML = usufrutoEnvolvidosAtuais.map((env, idx) => {
        const papel = (env.papel || 'DONATARIO').toUpperCase();
        const estCiv = normalizarEstadoCivil(env.estado_civil || 'solteiro');
        const regBens = normalizarRegimeBens(env.regime_bens || '');
        const generoVal = (env.genero || 'M').toUpperCase() === 'F' ? 'F' : 'M';
        const generoConjVal = (env.genero_conjuge || 'F').toUpperCase() === 'M' ? 'M' : 'F';
        const casado = estCiv.includes('casad') || estCiv.includes('estav') || estCiv.includes('estáv') || estCiv === 'uniao_estavel';
        const conjugeAssina = !(env.conjuge_assina === false || env.conjuge_assina === 0);
        const cpfFmt = env.cpf_cnpj ? formatarCpfCnpjDinamico(env.cpf_cnpj) : '';
        const cpfConjFmt = env.cpf_conjuge ? formatarCpfCnpjDinamico(env.cpf_conjuge) : '';
        return `
          <div class="card-usufruto p-3.5 bg-white/[0.015] border border-amber-400/20 rounded-technical space-y-3" data-idx="${idx}">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-400/10 border border-amber-400/20 text-amber-300">
                  Envolvido #${idx + 1}
                </span>
                <select class="select-usufruto-papel bg-[#0c1510] border border-white/15 rounded px-2 py-1 text-[11px] text-white" data-field="papel" data-idx="${idx}">
                  <option value="USUFRUTUARIO" ${papel === 'USUFRUTUARIO' ? 'selected' : ''}>Usufrutuário(a)</option>
                  <option value="DONATARIO" ${papel === 'DONATARIO' ? 'selected' : ''}>Donatário(a) / Nu-proprietário(a)</option>
                  <option value="NU_PROPRIETARIO" ${papel === 'NU_PROPRIETARIO' ? 'selected' : ''}>Nu-proprietário(a)</option>
                  <option value="COPROPRIETARIO" ${papel === 'COPROPRIETARIO' ? 'selected' : ''}>Coproprietário(a)</option>
                  <option value="PROPRIETARIO" ${papel === 'PROPRIETARIO' ? 'selected' : ''}>Proprietário(a)</option>
                  <option value="POSSUIDOR" ${papel === 'POSSUIDOR' ? 'selected' : ''}>Possuidor(a)</option>
                </select>
                <label class="flex items-center gap-1.5 ml-1 text-[11px] text-white/80 cursor-pointer">
                  <input type="checkbox" class="chk-usufruto-assina accent-amber-400 w-3.5 h-3.5" data-idx="${idx}" ${env.assina === false || env.assina === 0 ? '' : 'checked'}>
                  Assina
                </label>
              </div>
              <button type="button" class="btn-remover-usufruto text-red-400 hover:text-red-300 hover:bg-red-500/10 p-1.5 rounded transition-all cursor-pointer" data-idx="${idx}" title="Remover envolvido">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-end">
              <div>
                <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">CPF / CNPJ</label>
                <ui-campo-texto type="text" class="input-usufruto-cpf w-full" data-field="cpf_cnpj" data-idx="${idx}" placeholder="000.000.000-00" value="${escapeHtml(cpfFmt)}"></ui-campo-texto>
              </div>
              <div class="sm:col-span-2">
                <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Nome Completo *</label>
                <ui-campo-texto type="text" class="input-usufruto-nome w-full" data-field="nome" data-idx="${idx}" placeholder="Nome completo" value="${escapeHtml(env.nome || '')}" required></ui-campo-texto>
              </div>
              <div class="grid grid-cols-3 gap-1.5">
                <div class="col-span-2">
                  <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">RG</label>
                  <ui-campo-texto type="text" class="w-full" data-field="rg" data-idx="${idx}" placeholder="RG" value="${escapeHtml(env.rg || '')}"></ui-campo-texto>
                </div>
                <div>
                  <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Órgão/UF</label>
                  <ui-campo-texto type="text" class="w-full" data-field="rg_orgao" data-idx="${idx}" placeholder="SSP/PR" value="${escapeHtml([env.rg_orgao, env.rg_uf].filter(Boolean).join('/'))}"></ui-campo-texto>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-end">
              <div>
                <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Gênero</label>
                <ui-lista-flutuante class="w-full" data-field="genero" data-idx="${idx}" value="${generoVal}">
                  <option value="M" ${generoVal === 'M' ? 'selected' : ''}>Homem</option>
                  <option value="F" ${generoVal === 'F' ? 'selected' : ''}>Mulher</option>
                </ui-lista-flutuante>
              </div>
              <div>
                <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Nacionalidade</label>
                <ui-campo-texto type="text" class="w-full" data-field="nacionalidade" data-idx="${idx}" placeholder="brasileiro(a)" value="${escapeHtml(env.nacionalidade || 'brasileiro(a)')}"></ui-campo-texto>
              </div>
              <div>
                <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Profissão</label>
                <ui-campo-texto type="text" class="w-full" data-field="profissao" data-idx="${idx}" placeholder="Profissão" value="${escapeHtml(env.profissao || '')}"></ui-campo-texto>
              </div>
              <div>
                <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Estado Civil</label>
                <ui-lista-flutuante class="w-full" data-field="estado_civil" data-idx="${idx}" value="${escapeHtml(estCiv)}">
                  <option value="solteiro" ${estCiv === 'solteiro' ? 'selected' : ''}>Solteiro(a)</option>
                  <option value="casado" ${estCiv === 'casado' ? 'selected' : ''}>Casado(a)</option>
                  <option value="uniao_estavel" ${estCiv === 'uniao_estavel' ? 'selected' : ''}>União Estável</option>
                  <option value="divorciado" ${estCiv === 'divorciado' ? 'selected' : ''}>Divorciado(a)</option>
                  <option value="viuvo" ${estCiv === 'viuvo' ? 'selected' : ''}>Viúvo(a)</option>
                </ui-lista-flutuante>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-end">
              <div>
                <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Regime de Bens</label>
                <ui-lista-flutuante class="select-usufruto-regime w-full" data-field="regime_bens" data-idx="${idx}" value="${escapeHtml(regBens)}" ${!casado ? 'disabled' : ''}>
                  <option value="" ${!regBens ? 'selected' : ''}>Não se aplica</option>
                  <option value="comunhao_parcial" ${regBens === 'comunhao_parcial' ? 'selected' : ''}>Comunhão Parcial</option>
                  <option value="comunhao_universal" ${regBens === 'comunhao_universal' ? 'selected' : ''}>Comunhão Universal</option>
                  <option value="separacao_total" ${regBens === 'separacao_total' ? 'selected' : ''}>Separação Total</option>
                  <option value="participacao_final" ${regBens === 'participacao_final' ? 'selected' : ''}>Participação Final nos Aquestos</option>
                </ui-lista-flutuante>
              </div>
              <div class="sm:col-span-2 lg:col-span-3">
                <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Endereço de Domicílio</label>
                <ui-campo-texto type="text" class="w-full" data-field="endereco_completo" data-idx="${idx}" placeholder="Deixe em branco para usar o do confrontante" value="${escapeHtml(env.endereco_completo || '')}"></ui-campo-texto>
              </div>
            </div>

            <div class="box-usufruto-conjuge p-3 bg-white/[0.02] border border-white/5 rounded-technical space-y-2.5 ${casado ? '' : 'hidden'}" data-idx="${idx}">
              <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-1.5">
                <span class="text-[10px] font-bold uppercase tracking-wider text-amber-300">Cônjuge / Companheiro(a)</span>
                <label class="flex items-center gap-1.5 text-[10px] text-white/80 cursor-pointer">
                  <input type="checkbox" class="chk-usufruto-conjuge-assina accent-amber-400 w-3.5 h-3.5" data-idx="${idx}" ${conjugeAssina ? 'checked' : ''}>
                  <span><strong>Incluir assinatura do cônjuge</strong> (desmarque se dispensado por incomunicabilidade/separação)</span>
                </label>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                <div class="sm:col-span-2">
                  <label class="block text-[10px] font-medium tracking-wider uppercase text-white/40 mb-1">Nome do Cônjuge</label>
                  <ui-campo-texto type="text" class="w-full" data-field="nome_conjuge" data-idx="${idx}" placeholder="Nome completo" value="${escapeHtml(env.nome_conjuge || '')}"></ui-campo-texto>
                </div>
                <div>
                  <label class="block text-[10px] font-medium tracking-wider uppercase text-white/40 mb-1">CPF do Cônjuge</label>
                  <ui-campo-texto type="text" class="input-usufruto-cpf-conjuge w-full" data-field="cpf_conjuge" data-idx="${idx}" placeholder="000.000.000-00" value="${escapeHtml(cpfConjFmt)}"></ui-campo-texto>
                </div>
                <div>
                  <label class="block text-[10px] font-medium tracking-wider uppercase text-white/40 mb-1">RG do Cônjuge</label>
                  <ui-campo-texto type="text" class="w-full" data-field="rg_conjuge" data-idx="${idx}" placeholder="RG / Órgão" value="${escapeHtml(env.rg_conjuge || '')}"></ui-campo-texto>
                </div>
                <div>
                  <label class="block text-[10px] font-medium tracking-wider uppercase text-white/40 mb-1">Gênero</label>
                  <ui-lista-flutuante class="w-full" data-field="genero_conjuge" data-idx="${idx}" value="${generoConjVal}">
                    <option value="F" ${generoConjVal === 'F' ? 'selected' : ''}>Mulher</option>
                    <option value="M" ${generoConjVal === 'M' ? 'selected' : ''}>Homem</option>
                  </ui-lista-flutuante>
                </div>
                <div>
                  <label class="block text-[10px] font-medium tracking-wider uppercase text-white/40 mb-1">Nacionalidade</label>
                  <ui-campo-texto type="text" class="w-full" data-field="nacionalidade_conjuge" data-idx="${idx}" placeholder="brasileiro(a)" value="${escapeHtml(env.nacionalidade_conjuge || 'brasileiro(a)')}"></ui-campo-texto>
                </div>
                <div class="sm:col-span-2">
                  <label class="block text-[10px] font-medium tracking-wider uppercase text-white/40 mb-1">Profissão do Cônjuge</label>
                  <ui-campo-texto type="text" class="w-full" data-field="profissao_conjuge" data-idx="${idx}" placeholder="Profissão" value="${escapeHtml(env.profissao_conjuge || '')}"></ui-campo-texto>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');

      initIcons();
      usufrutoEnvolvidosAtuais.forEach((env, idx) => {
        const card = containerUsufruto.querySelector(`.card-usufruto[data-idx="${idx}"]`);
        if (!card) return;
        const setSelect = (field: string, val: string) => {
          const el = card.querySelector(`ui-lista-flutuante[data-field="${field}"]`) as any;
          if (el) el.value = val;
        };
        setSelect('genero', (env.genero || 'M').toUpperCase() === 'F' ? 'F' : 'M');
        setSelect('estado_civil', normalizarEstadoCivil(env.estado_civil || 'solteiro'));
        setSelect('regime_bens', normalizarRegimeBens(env.regime_bens || ''));
        setSelect('genero_conjuge', (env.genero_conjuge || 'F').toUpperCase() === 'M' ? 'M' : 'F');
      });
      containerUsufruto.querySelectorAll('.btn-remover-usufruto').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = Number((e.currentTarget as HTMLElement).dataset.idx);
          if (!isNaN(idx) && idx >= 0 && idx < usufrutoEnvolvidosAtuais.length) {
            usufrutoEnvolvidosAtuais.splice(idx, 1);
            renderizarCardsUsufruto();
          }
        });
      });
      containerUsufruto.querySelectorAll('[data-field]').forEach(input => {
        const handler = (e: any) => {
          const idx = Number(input.getAttribute('data-idx'));
          const field = input.getAttribute('data-field');
          if (isNaN(idx) || !field || !usufrutoEnvolvidosAtuais[idx]) return;
          if (field === 'rg_orgao') {
            const partes = String(e.target.value || '').split('/').map((p: string) => p.trim());
            usufrutoEnvolvidosAtuais[idx].rg_orgao = partes[0] || '';
            usufrutoEnvolvidosAtuais[idx].rg_uf = partes[1] || '';
            return;
          }
          usufrutoEnvolvidosAtuais[idx][field] = e.target.value;
          if (field === 'estado_civil' || field === 'regime_bens') {
            if (field === 'estado_civil') {
              usufrutoEnvolvidosAtuais[idx].estado_civil = normalizarEstadoCivil(e.target.value);
            } else {
              usufrutoEnvolvidosAtuais[idx].regime_bens = normalizarRegimeBens(e.target.value);
            }
            const val = normalizarEstadoCivil(usufrutoEnvolvidosAtuais[idx].estado_civil);
            const casado = val.includes('casad') || val.includes('estav') || val.includes('estáv') || val === 'uniao_estavel';
            const card = containerUsufruto.querySelector(`.card-usufruto[data-idx="${idx}"]`);
            card?.querySelector('.box-usufruto-conjuge')?.classList.toggle('hidden', !casado);
            const selectReg = card?.querySelector('.select-usufruto-regime') as any;
            if (selectReg) {
              if (casado) selectReg.removeAttribute('disabled');
              else {
                selectReg.setAttribute('disabled', '');
                selectReg.value = '';
                usufrutoEnvolvidosAtuais[idx].regime_bens = '';
              }
            }
          }
        };
        input.addEventListener('input', handler);
        input.addEventListener('change', handler);
        input.addEventListener('ui-selecionar', handler);
      });
      containerUsufruto.querySelectorAll('.chk-usufruto-assina').forEach(chk => {
        chk.addEventListener('change', () => {
          const i = Number(chk.getAttribute('data-idx'));
          if (usufrutoEnvolvidosAtuais[i]) usufrutoEnvolvidosAtuais[i].assina = (chk as HTMLInputElement).checked;
        });
      });
      containerUsufruto.querySelectorAll('.chk-usufruto-conjuge-assina').forEach(chk => {
        chk.addEventListener('change', () => {
          const i = Number(chk.getAttribute('data-idx'));
          if (usufrutoEnvolvidosAtuais[i]) usufrutoEnvolvidosAtuais[i].conjuge_assina = (chk as HTMLInputElement).checked;
        });
      });
      containerUsufruto.querySelectorAll('.input-usufruto-cpf').forEach(input => {
        const idx = Number(input.getAttribute('data-idx'));
        const buscarCpf = async (val: string) => {
          const limpo = (val || '').replace(/\D/g, '');
          if (limpo.length !== 11 && limpo.length !== 14) return;
          const envAtual = usufrutoEnvolvidosAtuais[idx];
          if (!envAtual || envAtual._ultimoCpfBuscado === limpo) return;
          envAtual._ultimoCpfBuscado = limpo;
          try {
            const res = await fetch(`${API_BASE}/confrontantes/buscar-por-cpf?cpf=${encodeURIComponent(limpo)}`);
            if (res.ok) {
              const data = await res.json();
              if (data && data.nome && usufrutoEnvolvidosAtuais[idx]) {
                Object.assign(usufrutoEnvolvidosAtuais[idx], {
                  nome: data.nome || '',
                  rg: data.rg || '',
                  genero: data.genero || 'M',
                  nacionalidade: data.nacionalidade || 'brasileiro(a)',
                  profissao: data.profissao || '',
                  estado_civil: normalizarEstadoCivil(data.estado_civil),
                  regime_bens: normalizarRegimeBens(data.regime_bens),
                  nome_conjuge: data.nome_conjuge || '',
                  cpf_conjuge: data.cpf_conjuge || '',
                  rg_conjuge: data.rg_conjuge || '',
                  genero_conjuge: data.genero_conjuge || 'F',
                  nacionalidade_conjuge: data.nacionalidade_conjuge || 'brasileiro(a)',
                  profissao_conjuge: data.profissao_conjuge || '',
                  endereco_completo: data.endereco_completo || '',
                });
                renderizarCardsUsufruto();
                showToast("✨ Dados do envolvido preenchidos pelo CPF!", "success");
              }
            }
          } catch (err) {
            if (usufrutoEnvolvidosAtuais[idx]) usufrutoEnvolvidosAtuais[idx]._ultimoCpfBuscado = '';
            console.error(err);
          }
        };
        input.addEventListener('input', (e: any) => {
          e.target.value = formatarCpfCnpjDinamico(e.target.value);
          const limpo = e.target.value.replace(/\D/g, '');
          if (limpo.length === 11 || limpo.length === 14) buscarCpf(e.target.value);
        });
        input.addEventListener('blur', (e: any) => buscarCpf(e.target.value));
      });
    };

    const carregarEnvolvidosUsufruto = async (confId: number | string) => {
      usufrutoCarregado = true;
      if (!confId) {
        usufrutoEnvolvidosAtuais = [];
        renderizarCardsUsufruto();
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/confrontantes/${confId}/usufruto-envolvidos`);
        if (res.ok) {
          const data = await res.json();
          usufrutoEnvolvidosAtuais = Array.isArray(data?.envolvidos)
            ? data.envolvidos.map((e: any) => ({ ...e, _ultimoCpfBuscado: (e.cpf_cnpj || '').replace(/\D/g, '') }))
            : [];
        } else {
          usufrutoEnvolvidosAtuais = [];
          usufrutoCarregado = false;
        }
      } catch {
        usufrutoEnvolvidosAtuais = [];
        usufrutoCarregado = false;
      }
      renderizarCardsUsufruto();
      definirUsufrutoAberto(usufrutoEnvolvidosAtuais.length > 0);
    };

    if (btnAddUsufruto) {
      btnAddUsufruto.onclick = () => {
        usufrutoEnvolvidosAtuais.push({
          papel: usufrutoEnvolvidosAtuais.length === 0 ? 'USUFRUTUARIO' : 'DONATARIO',
          nome: '',
          cpf_cnpj: '',
          rg: '',
          rg_orgao: '',
          rg_uf: '',
          genero: 'M',
          nacionalidade: 'brasileiro(a)',
          profissao: '',
          estado_civil: 'solteiro',
          regime_bens: '',
          endereco_completo: '',
          nome_conjuge: '',
          cpf_conjuge: '',
          rg_conjuge: '',
          genero_conjuge: 'F',
          nacionalidade_conjuge: 'brasileiro(a)',
          profissao_conjuge: '',
          assina: true,
          conjuge_assina: true,
        });
        renderizarCardsUsufruto();
      };
    }

    // Salvos junto com "Salvar Qualificação". null = lista não carregada (não enviar, para não apagar dados).
    const montarPayloadUsufruto = () => {
      if (!usufrutoCarregado) return null;
      return usufrutoEnvolvidosAtuais
            .map((e, idx) => ({
              papel: e.papel || 'DONATARIO',
              nome: (e.nome || '').trim(),
              cpf_cnpj: (e.cpf_cnpj || '').trim() || null,
              rg: (e.rg || '').trim() || null,
              rg_orgao: (e.rg_orgao || '').trim() || null,
              rg_uf: (e.rg_uf || '').trim() || null,
              genero: e.genero || 'M',
              nacionalidade: (e.nacionalidade || '').trim() || 'brasileiro(a)',
              profissao: (e.profissao || '').trim() || null,
              estado_civil: e.estado_civil || 'solteiro',
              regime_bens: e.regime_bens || null,
              endereco_completo: (e.endereco_completo || '').trim() || null,
              nome_conjuge: (e.nome_conjuge || '').trim() || null,
              cpf_conjuge: (e.cpf_conjuge || '').trim() || null,
              rg_conjuge: (e.rg_conjuge || '').trim() || null,
              rg_orgao_conjuge: (e.rg_orgao_conjuge || '').trim() || null,
              rg_uf_conjuge: (e.rg_uf_conjuge || '').trim() || null,
              observacao: (e.observacao || '').trim() || null,
              genero_conjuge: e.genero_conjuge || 'F',
              nacionalidade_conjuge: (e.nacionalidade_conjuge || '').trim() || 'brasileiro(a)',
              profissao_conjuge: (e.profissao_conjuge || '').trim() || null,
              assina: !(e.assina === false || e.assina === 0),
              conjuge_assina: !(e.conjuge_assina === false || e.conjuge_assina === 0),
              ordem: idx,
            }))
            .filter(e => e.nome.length > 0);
    };

    if (btnGerarDrlUsufruto) {
      btnGerarDrlUsufruto.onclick = async () => {
        if (!ctx.currentLevId || !ctx.currentMatriculaId) {
          showToast("Selecione um levantamento e uma matrícula válidos.", "info");
          return;
        }
        // Abre a aba já (gesto do clique) para o navegador não bloquear o pop-up após o salvamento assíncrono.
        const janela = window.open('', '_blank');
        const confId = await salvarQualificacaoRef.fn?.({ manterAberto: true });
        if (!confId) {
          janela?.close();
          return;
        }
        const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/confrontantes/${confId}/anuencia-usufruto-html`;
        if (janela) janela.location.href = url; else window.open(url, '_blank');
      };
    }

    let ultimoCpfBuscado = '';
    /** Detecta alterações não salvas (campos + listas dinâmicas); criado junto do salvamento, mais abaixo. */
    let rascunho: RascunhoFormulario | null = null;
    const formularioAberto = () => Boolean(containerForm) && !containerForm.classList.contains('hidden');
    /** Pergunta antes de descartar alterações não salvas; sem alterações, segue direto. */
    const podeDescartarFormulario = async (): Promise<boolean> => {
      if (!rascunho || !formularioAberto()) return true;
      return confirmarDescarteSeSujo(rascunho);
    };

    const abrirFormularioNovoConfrontante = async () => {
      if (!containerForm) return;
      if (!(await podeDescartarFormulario())) return;
      ultimoCpfBuscado = '';
      containerForm.classList.remove('hidden');
      if (inputConfId) inputConfId.value = '';
      containerForm.dataset.confrontanteId = '';
      if (txtConfIdEdicao) txtConfIdEdicao.innerText = 'NOVO';
      if (badgeConfStatus) {
        badgeConfStatus.innerText = 'NOVO CADASTRO';
        badgeConfStatus.className = 'text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20';
      }

      // Limpar todos os campos e aplicar defaults
      (document.getElementById('input-conf-nome') as any).value = '';
      if (inputCpf) inputCpf.value = '';
      (document.getElementById('conf-genero') as any).value = 'M';
      (document.getElementById('input-conf-rg') as any).value = '';
      (document.getElementById('input-conf-nacionalidade') as any).value = 'brasileiro(a)';
      (document.getElementById('input-conf-profissao') as any).value = '';
      (document.getElementById('conf-estado-civil') as any).value = 'solteiro';
      (document.getElementById('conf-regime-bens') as any).value = '';
      (document.getElementById('input-conf-conjuge-nome') as any).value = '';
      if (inputCpfConjuge) inputCpfConjuge.value = '';
      (document.getElementById('input-conf-conjuge-rg') as any).value = '';
      (document.getElementById('conf-conjuge-genero') as any).value = 'F';
      (document.getElementById('input-conf-conjuge-nacionalidade') as any).value = 'brasileiro(a)';
      (document.getElementById('input-conf-conjuge-profissao') as any).value = '';
      (document.getElementById('input-conf-endereco') as any).value = '';
      (document.getElementById('input-conf-lote') as any).value = '';
      (document.getElementById('input-conf-matricula-imovel') as any).value = '';

      preencherRepresentantes(null);
      const chkTitNovo = document.getElementById('chk-titular-assina') as HTMLInputElement | null;
      if (chkTitNovo) chkTitNovo.checked = true;
      const chkConjNovo = document.getElementById('chk-conjuge-assina') as HTMLInputElement | null;
      if (chkConjNovo) chkConjNovo.checked = true;
      configurarMaquinadeEstadosCivil(containerForm);
      aplicarTipoPessoa();
      coproprietariosAtuais = [];
      renderizarCardsCoproprietarios();
      usufrutoEnvolvidosAtuais = [];
      usufrutoCarregado = true;
      renderizarCardsUsufruto();
      definirUsufrutoAberto(false);
      renderizarStatusAnexoMatricula(null);
      initIcons();
      limparErros(containerForm);
      rascunho?.marcarLimpo();

      setTimeout(() => {
        ajustarVisibilidadeFormulario(containerForm);
        (document.getElementById('input-conf-nome') as any)?.focus?.();
      }, 100);
    };

    const fecharFormularioConfrontante = () => {
      if (containerForm) containerForm.classList.add('hidden');
      if (inputConfId) inputConfId.value = '';
      if (containerForm) containerForm.dataset.confrontanteId = '';
      if (selectAnuencia) selectAnuencia.value = '';
      if (containerForm) limparErros(containerForm);
      rascunho?.marcarLimpo();
    };

    /** Cancelar / X: confirma só quando há alterações não salvas. */
    const fecharComConfirmacao = async () => {
      if (await podeDescartarFormulario()) fecharFormularioConfrontante();
    };

    if (btnNovoConf) {
      btnNovoConf.onclick = abrirFormularioNovoConfrontante;
    }
    if (btnFecharCard) {
      btnFecharCard.onclick = fecharComConfirmacao;
    }
    if (btnCancelarConf) {
      btnCancelarConf.onclick = fecharComConfirmacao;
    }

    if (selectAnuencia) {
      selectAnuencia.addEventListener('change', async () => {
        const confIdVal = selectAnuencia.value;
        if (!confIdVal || confIdVal === "lote" || !ctx.currentLevId) {
          if (containerForm) containerForm.classList.add('hidden');
          return;
        }

        // Trocar de confrontante com alterações não salvas: confirma; se recusar, volta ao que estava aberto.
        const abertoAgora = containerForm?.dataset.confrontanteId || '';
        if (formularioAberto() && !(await podeDescartarFormulario())) {
          selectAnuencia.value = abertoAgora;
          return;
        }

        try {
          const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/confrontantes`);
          const confs = await res.json();
          const selectedConf = confs.find((c: any) => String(c.id) === confIdVal);
          
          if (selectedConf && containerForm) {
            containerForm.classList.remove('hidden');
            if (inputConfId) inputConfId.value = String(selectedConf.id);
            containerForm.dataset.confrontanteId = String(selectedConf.id);
            if (txtConfIdEdicao) txtConfIdEdicao.innerText = `ID: ${selectedConf.id}`;
            if (badgeConfStatus) {
              badgeConfStatus.innerText = 'EDIÇÃO';
              badgeConfStatus.className = 'text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/20';
            }
            
            (document.getElementById('input-conf-nome') as any).value = selectedConf.nome || '';
            if (inputCpf) inputCpf.value = selectedConf.cpf_cnpj ? formatarCpfCnpjDinamico(selectedConf.cpf_cnpj) : '';
            ultimoCpfBuscado = (selectedConf.cpf_cnpj || '').replace(/\D/g, '');
            (document.getElementById('conf-genero') as any).value = selectedConf.genero || 'M';
            (document.getElementById('input-conf-rg') as any).value = selectedConf.rg || '';
            (document.getElementById('input-conf-nacionalidade') as any).value = selectedConf.nacionalidade || 'brasileiro(a)';
            (document.getElementById('input-conf-profissao') as any).value = selectedConf.profissao || '';
            (document.getElementById('conf-estado-civil') as any).value = normalizarEstadoCivil(selectedConf.estado_civil);
            (document.getElementById('conf-regime-bens') as any).value = normalizarRegimeBens(selectedConf.regime_bens);
            (document.getElementById('input-conf-conjuge-nome') as any).value = selectedConf.nome_conjuge || '';
            if (inputCpfConjuge) inputCpfConjuge.value = selectedConf.cpf_conjuge ? formatarCpfCnpjDinamico(selectedConf.cpf_conjuge) : '';
            (document.getElementById('input-conf-conjuge-rg') as any).value = selectedConf.rg_conjuge || '';
            (document.getElementById('conf-conjuge-genero') as any).value = selectedConf.genero_conjuge || 'F';
            (document.getElementById('input-conf-conjuge-nacionalidade') as any).value = selectedConf.nacionalidade_conjuge || 'brasileiro(a)';
            (document.getElementById('input-conf-conjuge-profissao') as any).value = selectedConf.profissao_conjuge || '';
            (document.getElementById('input-conf-endereco') as any).value = selectedConf.endereco_completo || '';
            (document.getElementById('input-conf-lote') as any).value = selectedConf.lote || '';
            (document.getElementById('input-conf-matricula-imovel') as any).value = selectedConf.matricula_imovel || '';
            
            configurarMaquinadeEstadosCivil(containerForm);
            preencherRepresentantes(selectedConf.representantes ?? selectedConf.representante);
            const chkTit = document.getElementById('chk-titular-assina') as HTMLInputElement | null;
            if (chkTit) chkTit.checked = selectedConf.titular_assina !== 0;
            const chkConj = document.getElementById('chk-conjuge-assina') as HTMLInputElement | null;
            if (chkConj) chkConj.checked = selectedConf.conjuge_assina !== 0;
            coproprietariosAtuais = (selectedConf.coproprietarios && Array.isArray(selectedConf.coproprietarios)) 
              ? JSON.parse(JSON.stringify(selectedConf.coproprietarios)).map((cp: any) => ({
                  ...cp,
                  _ultimoCpfBuscado: (cp.cpf_cnpj || '').replace(/\D/g, '')
                }))
              : [];
            renderizarCardsCoproprietarios();
            await carregarEnvolvidosUsufruto(selectedConf.id);
            renderizarStatusAnexoMatricula(selectedConf);
            initIcons();
            aplicarTipoPessoa();
            ajustarVisibilidadeFormulario(containerForm);
            limparErros(containerForm);
            rascunho?.marcarLimpo();
          }
        } catch (err) {
          console.error("Erro ao carregar qualificacoes do confrontante:", err);
          avisarErroPersistente("Erro ao carregar dados do confrontante.");
        }
      });
    }

    /** CNPJ (14 dígitos) = pessoa jurídica: oculta campos de pessoa física e ajusta rótulos. */
    const aplicarTipoPessoa = () => {
      if (!containerForm) return;
      const digitos = (inputCpf?.value || '').replace(/\D/g, '');
      const pj = digitos.length > 11;
      const ocultar = (id: string) => {
        const wrapper = document.getElementById(id)?.parentElement;
        wrapper?.classList.toggle('hidden', pj);
      };
      ['conf-genero', 'input-conf-nacionalidade', 'input-conf-profissao', 'conf-estado-civil', 'conf-regime-bens'].forEach(ocultar);
      const boxConjuge = document.getElementById('box-conjuge');
      document.getElementById('box-representante')?.classList.toggle('hidden', !pj);
      if (pj) {
        boxConjuge?.classList.add('hidden');
      } else {
        configurarMaquinadeEstadosCivil(containerForm);
      }
      const labelRg = document.getElementById('input-conf-rg')?.parentElement?.querySelector('label');
      if (labelRg) labelRg.textContent = pj ? 'Inscrição Estadual' : 'RG / Inscrição Estadual';
      const inputRg = document.getElementById('input-conf-rg') as any;
      if (inputRg && 'placeholder' in inputRg) inputRg.placeholder = pj ? 'Inscrição Estadual (opcional)' : 'RG ou I.E.';
      const inputNome = document.getElementById('input-conf-nome') as any;
      if (inputNome && 'placeholder' in inputNome) inputNome.placeholder = pj ? 'Razão social' : 'Nome completo do titular confrontante';
    };

    const listaRepresentantes = document.getElementById('lista-representantes');
    let representantesAtuais: Record<string, string>[] = [];
    const repVazio = (): Record<string, string> => ({ genero: 'M', nacionalidade: 'brasileiro(a)', estado_civil: 'solteiro' });

    const renderizarRepresentantes = () => {
      if (!listaRepresentantes) return;
      const opt = (v: string, t: string, atual: string) => `<option value="${v}" ${atual === v ? 'selected' : ''}>${t}</option>`;
      listaRepresentantes.innerHTML = representantesAtuais.map((r, idx) => {
        const campo = (rotulo: string, f: string, ph: string, cls = 'col-span-1') => `
          <div class="${cls}"><label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">${rotulo}</label>
            <ui-campo-texto type="text" class="w-full" data-field="${f}" data-idx="${idx}" placeholder="${ph}" value="${escapeHtml(r[f] || '')}"></ui-campo-texto></div>`;
        return `
          <div class="card-representante p-3 bg-white/[0.015] border border-white/10 rounded-technical space-y-3" data-idx="${idx}">
            <div class="flex items-center justify-between border-b border-white/5 pb-2">
              <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-white/5 border border-white/10 text-mint-vibrant">Representante #${idx + 1}</span>
              <button type="button" class="btn-remover-rep text-red-400 hover:text-red-300 hover:bg-red-500/10 p-1.5 rounded transition-all cursor-pointer" data-idx="${idx}" title="Remover representante">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-end">
              ${campo('CPF', 'cpf_cnpj', '000.000.000-00')}
              ${campo('Nome Completo', 'nome', 'Nome do representante', 'col-span-1 sm:col-span-2 lg:col-span-2')}
              ${campo('RG / Órgão', 'rg', 'RG')}
              <div><label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Gênero</label>
                <ui-lista-flutuante class="w-full" data-field="genero" data-idx="${idx}">${opt('M', 'Homem', r.genero || 'M')}${opt('F', 'Mulher', r.genero || 'M')}</ui-lista-flutuante></div>
              ${campo('Nacionalidade', 'nacionalidade', 'brasileiro(a)', '')}
              ${campo('Profissão', 'profissao', 'Profissão', '')}
              <div><label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Estado Civil</label>
                <ui-lista-flutuante class="w-full" data-field="estado_civil" data-idx="${idx}">${[['solteiro', 'Solteiro(a)'], ['casado', 'Casado(a)'], ['uniao_estavel', 'União Estável'], ['divorciado', 'Divorciado(a)'], ['viuvo', 'Viúvo(a)']].map(([v, t]) => opt(v, t, r.estado_civil || 'solteiro')).join('')}</ui-lista-flutuante></div>
              ${campo('Endereço do Representante', 'endereco_completo', 'Deixe em branco para usar o endereço da empresa', 'col-span-1 sm:col-span-2 lg:col-span-4')}
            </div>
          </div>`;
      }).join('');

      listaRepresentantes.querySelectorAll('.btn-remover-rep').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = Number((e.currentTarget as HTMLElement).dataset.idx);
          representantesAtuais.splice(idx, 1);
          if (representantesAtuais.length === 0) representantesAtuais.push(repVazio());
          renderizarRepresentantes();
        });
      });
      listaRepresentantes.querySelectorAll('[data-field]').forEach(input => {
        const handler = (e: any) => {
          const idx = Number(input.getAttribute('data-idx'));
          const field = input.getAttribute('data-field');
          if (!field || !representantesAtuais[idx]) return;
          let valor = e.target.value;
          if (field === 'cpf_cnpj' && e.type === 'input') {
            const fmt = formatarCpfCnpjDinamico(valor);
            if (fmt !== valor) { e.target.value = fmt; valor = fmt; }
          }
          representantesAtuais[idx][field] = valor;
        };
        input.addEventListener('input', handler);
        input.addEventListener('change', handler);
        input.addEventListener('ui-selecionar', handler);
      });
      initIcons();
    };

    /** Só envia representantes quando o titular é PJ; descarta os sem nome. */
    function lerRepresentantes(): Record<string, string>[] {
      const pj = (inputCpf?.value || '').replace(/\D/g, '').length > 11;
      if (!pj) return [];
      return representantesAtuais
        .map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, (v || '').trim()])) as Record<string, string>)
        .filter(r => r.nome);
    }
    /** Aceita lista (novo) ou objeto único (legado). Mantém ao menos um cartão para preencher. */
    const preencherRepresentantes = (reps: any) => {
      const lista = Array.isArray(reps) ? reps : (reps ? [reps] : []);
      representantesAtuais = lista.map((r: any) => ({
        ...repVazio(),
        ...r,
        cpf_cnpj: r?.cpf_cnpj ? formatarCpfCnpjDinamico(r.cpf_cnpj) : '',
      }));
      if (representantesAtuais.length === 0) representantesAtuais.push(repVazio());
      renderizarRepresentantes();
    };
    document.getElementById('btn-add-representante')?.addEventListener('click', () => {
      representantesAtuais.push(repVazio());
      renderizarRepresentantes();
    });

    const buscarPreenchimentoCpf = async (cpfVal: string) => {
      if (!cpfVal) return;
      const cpfLimpo = cpfVal.replace(/\D/g, '');
      if (cpfLimpo.length !== 11 && cpfLimpo.length !== 14) return;
      if (cpfLimpo === ultimoCpfBuscado) return;
      ultimoCpfBuscado = cpfLimpo;
      
      if (statusBuscaCpf) {
        statusBuscaCpf.innerText = 'Buscando cadastro...';
        statusBuscaCpf.classList.remove('hidden');
      }

      try {
        const res = await fetch(`${API_BASE}/confrontantes/buscar-por-cpf?cpf=${encodeURIComponent(cpfLimpo)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.nome) {
            // Só preenche o que está vazio (ou ainda no padrão do formulário): o que o operador digitou nunca é sobrescrito.
            const PADROES: Record<string, string> = {
              'conf-genero': 'M',
              'input-conf-nacionalidade': 'brasileiro(a)',
              'conf-estado-civil': 'solteiro',
              'conf-conjuge-genero': 'F',
              'input-conf-conjuge-nacionalidade': 'brasileiro(a)',
            };
            const resultado = preencherCampos(containerForm, {
              'input-conf-nome': data.nome,
              'conf-genero': data.genero,
              'input-conf-rg': data.rg,
              'input-conf-nacionalidade': data.nacionalidade,
              'input-conf-profissao': data.profissao,
              'conf-estado-civil': data.estado_civil ? normalizarEstadoCivil(data.estado_civil) : '',
              'conf-regime-bens': data.regime_bens ? normalizarRegimeBens(data.regime_bens) : '',
              'input-conf-conjuge-nome': data.nome_conjuge,
              'input-conf-conjuge-cpf': data.cpf_conjuge ? formatarCpfCnpjDinamico(data.cpf_conjuge) : '',
              'input-conf-conjuge-rg': data.rg_conjuge,
              'conf-conjuge-genero': data.genero_conjuge,
              'input-conf-conjuge-nacionalidade': data.nacionalidade_conjuge,
              'input-conf-conjuge-profissao': data.profissao_conjuge,
              'input-conf-endereco': data.endereco_completo,
              'input-conf-matricula-imovel': data.matricula_imovel,
            }, {
              vazioSe: (chave, atual) => atual.trim() === '' || PADROES[chave] === atual,
            });

            const reaplicarRegras = () => {
              if (containerForm) configurarMaquinadeEstadosCivil(containerForm);
              aplicarTipoPessoa();
            };
            reaplicarRegras();

            const qtd = resultado.aplicados.length;
            if (qtd > 0) {
              UIToast.notificar({
                tipo: 'sucesso',
                mensagem: `Cadastro encontrado pelo CPF/CNPJ: ${qtd} ${qtd === 1 ? 'campo preenchido' : 'campos preenchidos'}.`,
                duracao: 8000,
                acao: { rotulo: 'Desfazer', onClick: () => { resultado.desfazer(); reaplicarRegras(); } },
              });
            }
            if (resultado.conflitos.length > 0) {
              const c = resultado.conflitos.length;
              UIToast.notificar({
                tipo: 'info',
                mensagem: `${c} ${c === 1 ? 'campo já preenchido foi mantido' : 'campos já preenchidos foram mantidos'} (diferem do cadastro encontrado).`,
                duracao: 10000,
                acao: { rotulo: `Substituir ${c}`, onClick: () => { resultado.substituirConflitos(); reaplicarRegras(); } },
              });
            }
          }
        }
      } catch (err) {
        ultimoCpfBuscado = '';
        console.error("Erro ao buscar confrontante por CPF:", err);
      } finally {
        if (statusBuscaCpf) statusBuscaCpf.classList.add('hidden');
      }
    };

    if (inputCpf) {
      inputCpf.addEventListener('input', () => {
        inputCpf.value = formatarCpfCnpjDinamico(inputCpf.value);
        aplicarTipoPessoa();
        const limpo = inputCpf.value.replace(/\D/g, '');
        if (limpo.length === 11 || limpo.length === 14) {
          buscarPreenchimentoCpf(inputCpf.value);
        }
      });
      inputCpf.addEventListener('blur', () => {
        buscarPreenchimentoCpf(inputCpf.value);
      });
    }

    if (inputCpfConjuge) {
      inputCpfConjuge.addEventListener('input', () => {
        inputCpfConjuge.value = formatarCpfCnpjDinamico(inputCpfConjuge.value);
      });
    }

    // Alterações não salvas = campos + listas dinâmicas (representantes, coproprietários, usufruto).
    // A inicialização pode rodar de novo (troca de matrícula/aba): solta os ouvintes da anterior para não duplicar.
    soltarRascunhoAnterior?.();
    if (containerForm) {
      const badgeNaoSalvo = document.getElementById('badge-conf-nao-salvo');
      rascunho = criarRascunhoFormulario(containerForm, {
        estadoExterno: () => [representantesAtuais, coproprietariosAtuais, usufrutoEnvolvidosAtuais],
        aoMudar: (sujo) => badgeNaoSalvo?.classList.toggle('hidden', !sujo),
      });
      const rascunhoAtual = rascunho;
      const pararLimpezaErros = observarLimpezaDeErros(containerForm);
      // Ctrl/Cmd+S salva (inclusive dentro dos campos); Esc fecha, pedindo confirmação se houver alterações.
      const pararAtalhos = ligarAtalhosFormulario(containerForm, {
        salvar: () => { void salvarQualificacaoRef.fn?.(); },
        cancelar: () => { void fecharComConfirmacao(); },
      });
      soltarRascunhoAnterior = () => { rascunhoAtual.destruir(); pararLimpezaErros(); pararAtalhos(); };
    }

    let salvandoQualificacao = false;
    // Retorna o id do confrontante salvo (ou null se não salvou). `manterAberto` mantém o formulário na tela.
    const executarSalvarQualificacao = async (opts: { manterAberto?: boolean } = {}): Promise<string | null> => {
      if (salvandoQualificacao) return null;

      let confIdVal = inputConfId?.value?.trim() || containerForm?.dataset?.confrontanteId || (selectAnuencia ? selectAnuencia.value : '');
      if (confIdVal === 'lote' || confIdVal === 'novo') confIdVal = '';
      
      if (!ctx.currentLevId) {
        showToast("Nenhum levantamento ativo selecionado.", "info");
        return null;
      }

      const inputNome = document.getElementById('input-conf-nome') as any;
      const nome = (inputNome?.value || '').trim();

      // Validação inline: o erro fica no campo (aria-invalid + mensagem) e o foco vai ao primeiro inválido.
      const validacao = containerForm
        ? validarCampos(containerForm, {
            'input-conf-nome': (v) => (v.trim() ? null : 'Informe o nome completo ou a razão social.'),
            'input-conf-cpf': (v) => erroCpfCnpj(v, 'CPF/CNPJ'),
            'input-conf-conjuge-cpf': (v) => erroCpf(v, 'CPF do cônjuge'),
          }, { ignorar: (campo) => campo.closest('.hidden') !== null })
        : { valido: Boolean(nome), erros: [] };
      if (!validacao.valido) {
        const n = validacao.erros.length;
        showToast(`Corrija ${n === 1 ? 'o campo destacado' : `os ${n} campos destacados`} para salvar.`, 'error', 6000);
        return null;
      }

      salvandoQualificacao = true;
      let idSalvo: string | null = null;

      const payload = {
        nome: nome,
        cpf_cnpj: (document.getElementById('input-conf-cpf') as any)?.value?.trim() || null,
        genero: (document.getElementById('conf-genero') as any)?.value || 'M',
        rg: (document.getElementById('input-conf-rg') as any)?.value?.trim() || null,
        nacionalidade: (document.getElementById('input-conf-nacionalidade') as any)?.value?.trim() || 'brasileiro(a)',
        profissao: (document.getElementById('input-conf-profissao') as any)?.value?.trim() || null,
        estado_civil: (document.getElementById('conf-estado-civil') as any)?.value || null,
        regime_bens: (document.getElementById('conf-regime-bens') as any)?.value || null,
        nome_conjuge: (document.getElementById('input-conf-conjuge-nome') as any)?.value?.trim() || null,
        cpf_conjuge: (document.getElementById('input-conf-conjuge-cpf') as any)?.value?.trim() || null,
        rg_conjuge: (document.getElementById('input-conf-conjuge-rg') as any)?.value?.trim() || null,
        genero_conjuge: (document.getElementById('conf-conjuge-genero') as any)?.value || null,
        nacionalidade_conjuge: (document.getElementById('input-conf-conjuge-nacionalidade') as any)?.value?.trim() || null,
        profissao_conjuge: (document.getElementById('input-conf-conjuge-profissao') as any)?.value?.trim() || null,
        endereco_completo: (document.getElementById('input-conf-endereco') as any)?.value?.trim() || null,
        lote: (document.getElementById('input-conf-lote') as any)?.value?.trim() || null,
        matricula_imovel: (document.getElementById('input-conf-matricula-imovel') as any)?.value?.trim() || null,
        tipo_relacao: null,
        titular_assina: (document.getElementById('chk-titular-assina') as HTMLInputElement | null)?.checked !== false,
        conjuge_assina: (document.getElementById('chk-conjuge-assina') as HTMLInputElement | null)?.checked !== false,
        representantes: lerRepresentantes(),
        coproprietarios: coproprietariosAtuais
          .map(cp => ({
            nome: (cp.nome || '').trim(),
            cpf_cnpj: (cp.cpf_cnpj || '').trim() || null,
            rg: (cp.rg || '').trim() || null,
            genero: cp.genero || 'M',
            nacionalidade: (cp.nacionalidade || '').trim() || 'brasileiro(a)',
            profissao: (cp.profissao || '').trim() || null,
            estado_civil: cp.estado_civil || 'solteiro',
            regime_bens: cp.regime_bens || null,
            nome_conjuge: (cp.nome_conjuge || '').trim() || null,
            cpf_conjuge: (cp.cpf_conjuge || '').trim() || null,
            rg_conjuge: (cp.rg_conjuge || '').trim() || null,
            genero_conjuge: cp.genero_conjuge || 'F',
            nacionalidade_conjuge: (cp.nacionalidade_conjuge || '').trim() || 'brasileiro(a)',
            profissao_conjuge: (cp.profissao_conjuge || '').trim() || null,
            endereco_completo: (cp.endereco_completo || '').trim() || null,
            assina: !(cp.assina === false || cp.assina === 0),
            conjuge_assina: !(cp.conjuge_assina === false || cp.conjuge_assina === 0)
          }))
          .filter(cp => cp.nome.length > 0),
        usufruto_envolvidos: montarPayloadUsufruto(),
      };

      if (btnSalvarConf) {
        btnSalvarConf.setAttribute('carregando', '');
        btnSalvarConf.setAttribute('disabled', '');
      }

      try {
        const url = confIdVal 
          ? `${API_BASE}/confrontantes/${confIdVal}` 
          : `${API_BASE}/levantamentos/${ctx.currentLevId}/confrontantes`;
        const method = confIdVal ? 'PUT' : 'POST';

        const res = await fetch(url, {
          method: method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok) {
          showToast(confIdVal ? "Qualificação do confrontante salva com sucesso!" : "Novo confrontante cadastrado com sucesso!", "success");
          
          idSalvo = String(confIdVal || data?.id || data?.confrontante_id || '') || null;
          rascunho?.marcarLimpo();

          await ctx.carregarConfrontantesAtivosSelect();
          await ctx.loadLevantamentoDetails();

          if (opts.manterAberto) {
            if (idSalvo) {
              if (inputConfId) inputConfId.value = idSalvo;
              if (containerForm) containerForm.dataset.confrontanteId = idSalvo;
              if (txtConfIdEdicao) txtConfIdEdicao.innerText = idSalvo;
              habilitarAnexoMatricula(true);
              if (!confIdVal) renderizarStatusAnexoMatricula({ id: idSalvo });
            }
          } else {
            fecharFormularioConfrontante();
          }
        } else {
          let errorMsg = "Erro ao salvar qualificações do confrontante.";
          if (data.detail) {
            if (Array.isArray(data.detail)) {
              errorMsg = data.detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ');
            } else {
              errorMsg = String(data.detail);
            }
          } else if (data.error) {
            errorMsg = String(data.error);
          } else if (data.message) {
            errorMsg = String(data.message);
          }
          avisarErroPersistente(errorMsg);
        }
      } catch (err) {
        console.error("Erro ao salvar qualificações:", err);
        avisarErroPersistente("Erro de rede ao salvar qualificações do confrontante. Nada foi perdido: o formulário continua preenchido.");
      } finally {
        salvandoQualificacao = false;
        if (btnSalvarConf) {
          btnSalvarConf.removeAttribute('carregando');
          btnSalvarConf.removeAttribute('disabled');
        }
        initIcons();
      }
      return idSalvo;
    };

    salvarQualificacaoRef.fn = executarSalvarQualificacao;

    if (btnSalvarConf) {
      btnSalvarConf.onclick = () => {
        executarSalvarQualificacao();
      };
    }

    /** Próximo confrontante com cadastro incompleto (sem CPF/CNPJ), na ordem do perímetro, dando a volta na lista. */
    const proximoIncompleto = (idAtual: string): ConfrontanteResumo | null => {
      const lista = (resumoConf?.confrontantes ?? [])
        .map((c, i) => ({ c, i }))
        .sort((a, b) => (a.c.ordem_perimetro ?? Number.MAX_SAFE_INTEGER) - (b.c.ordem_perimetro ?? Number.MAX_SAFE_INTEGER) || a.i - b.i)
        .map(({ c }) => c);
      const pos = lista.findIndex(c => String(c.id) === idAtual);
      const incompletos = lista.filter(c => estadoDe(c) === 'incompleto' && String(c.id) !== idAtual);
      return incompletos.find(c => lista.indexOf(c) > pos) ?? incompletos[0] ?? null;
    };

    const btnSalvarProximo = document.getElementById('btn-salvar-proximo-confrontante');
    if (btnSalvarProximo) {
      btnSalvarProximo.onclick = async () => {
        const idSalvo = await executarSalvarQualificacao({ manterAberto: true });
        if (!idSalvo) return;
        await carregarResumoConfrontantes();
        const proximo = proximoIncompleto(idSalvo);
        if (proximo) {
          abrirEdicaoConfrontante(String(proximo.id));
        } else {
          fecharFormularioConfrontante();
          showToast('Todos os confrontantes têm cadastro completo.', 'success');
        }
      };
    }

    if (formConfrontante) {
      formConfrontante.onsubmit = (e) => {
        e.preventDefault();
        executarSalvarQualificacao();
      };
    }

    if (fileInputMatricula) {
      fileInputMatricula.onchange = async (e: any) => {
        let confId = inputConfId?.value?.trim() || containerForm?.dataset?.confrontanteId || (selectAnuencia ? selectAnuencia.value : '');
        if (!confId) {
          showToast("Nenhum confrontante selecionado para anexar matrícula.", "info");
          return;
        }

        if (e.target.files && e.target.files.length > 0) {
          const file = e.target.files[0];
          const formData = new FormData();
          formData.append('file', file);

          try {
            const res = await fetch(`${API_BASE}/confrontantes/${confId}/upload-matricula`, {
              method: 'POST',
              body: formData
            });

            const data = await res.json().catch(() => ({}));
            if (res.ok) {
              showToast("Matrícula anexada com sucesso!", "success");
              
              // Buscar o confrontante atualizado e renderizar
              const resConf = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/confrontantes`);
              const confs = await resConf.json();
              const updatedConf = confs.find((c: any) => String(c.id) === confId);
              if (updatedConf) {
                renderizarStatusAnexoMatricula(updatedConf);
              }
              
              await ctx.loadLevantamentoDetails();
            } else {
              showToast(data.detail || data.error || "Erro ao fazer upload da matrícula.", "error");
            }
          } catch (err) {
            console.error("Erro no upload da matrícula:", err);
            showToast("Erro de rede ao fazer upload da matrícula.", "error");
          } finally {
            fileInputMatricula.value = '';
          }
        }
      };
    }
  };

  // 6. Ingestion dropzone para a planilha homologada do SIGEF (Múltiplos Arquivos e Abas com Mapeamento)
  const inicializarHomologacaoIncra = () => {
    const dropzone = document.getElementById('homologacao-dropzone');
    const fileInput = document.getElementById('homologacao-file-input') as HTMLInputElement;
    const btnProcessar = document.getElementById('btn-processar-homologacao') as HTMLButtonElement;
    const containerMapeamento = document.getElementById('container-mapeamento-abas-homologacao');
    const listaAbasMapeamento = document.getElementById('lista-abas-mapeamento');
    
    let selectedFiles: File[] = [];
    
    if (!dropzone || !fileInput || !btnProcessar || !containerMapeamento || !listaAbasMapeamento) return;
    
    const updateButtonState = () => {
      if (selectedFiles.length > 0) {
        btnProcessar.disabled = false;
        btnProcessar.classList.remove('opacity-55', 'cursor-not-allowed');
        btnProcessar.classList.add('btn-primary');
      } else {
        btnProcessar.disabled = true;
        btnProcessar.classList.add('opacity-55', 'cursor-not-allowed');
        btnProcessar.classList.remove('btn-primary');
        containerMapeamento.classList.add('hidden');
        listaAbasMapeamento.innerHTML = '';
      }
    };
    
    dropzone.onclick = () => fileInput.click();
    
    const analisarArquivos = async (files: File[]) => {
      if (!ctx.currentLevId) return;
      
      selectedFiles = files;
      const textElement = dropzone.querySelector('p.text-xs') as HTMLElement;
      if (textElement) {
        textElement.innerText = selectedFiles.length === 1 
          ? `Arquivo: ${selectedFiles[0].name}` 
          : `${selectedFiles.length} arquivos selecionados`;
      }
      
      // Mostrar carregamento no mapeamento
      containerMapeamento.classList.remove('hidden');
      listaAbasMapeamento.innerHTML = `
        <div class="flex items-center justify-center gap-2 py-4 text-white/50 text-xs">
          <i data-lucide="refresh-cw" class="w-4 h-4 animate-spin text-mint-vibrant"></i>
          Analisando estruturas dos arquivos...
        </div>
      `;
      initIcons();
      
      try {
        // Chamar /analisar-planilha-abas para cada arquivo em paralelo
        const promessas = selectedFiles.map(async (file) => {
          const formData = new FormData();
          formData.append('file', file);
          
          const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/analisar-planilha-abas`;
          const res = await fetch(url, {
            method: 'POST',
            body: formData
          });
          
          if (!res.ok) {
            throw new Error(`Falha ao analisar ${file.name}`);
          }
          return await res.json();
        });
        
        const resultados = await Promise.all(promessas);
        
        // Renderizar a interface de mapeamento
        listaAbasMapeamento.innerHTML = '';
        
        let abasEncontradas = 0;
        
        resultados.forEach((resData) => {
          if (resData.sucesso && resData.abas && resData.abas.length > 0) {
            const filename = resData.filename;
            
            // Criar um bloco para o arquivo
            const fileBlock = document.createElement('div');
            fileBlock.className = 'space-y-2 border-b border-white/5 pb-2 last:border-b-0 last:pb-0';
            
            const fileTitle = document.createElement('div');
            fileTitle.className = 'text-xs font-bold text-white/70 flex items-center gap-1.5 pt-1';
            fileTitle.innerHTML = `<i data-lucide="file" class="w-3.5 h-3.5 text-white/40"></i> ${filename}`;
            fileBlock.appendChild(fileTitle);
            
            resData.abas.forEach((aba: any) => {
              abasEncontradas++;
              const mapKey = `${filename}#${aba.nome}`;
              
              const abaRow = document.createElement('div');
              abaRow.className = 'flex flex-col sm:flex-row sm:items-center justify-between gap-2 pl-4';
              
              const labelDiv = document.createElement('div');
              labelDiv.className = 'flex items-center gap-2 text-xs text-white/50';
              labelDiv.innerHTML = `
                <span class="font-semibold text-white/80">${escapeHtml(aba.nome)}</span>
                <span class="text-[10px] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-white/40 font-mono">${aba.qtd_pontos} pts</span>
              `;
              
              const select = document.createElement('select');
              select.className = 'selecao-matricula-aba bg-white/5 border border-white/10 hover:border-white/20 text-white rounded px-2 py-1 text-xs outline-none transition-colors w-full sm:w-[220px]';
              select.setAttribute('data-map-key', mapKey);
              
              let selectHtml = `<option value="">-- Não importar --</option>`;
              
              // Função local de normalização para comparação inteligente
              const normalizarMatriculaJS = (val: string) => {
                if (!val) return "";
                let texto = val.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                texto = texto.replace(/^(matricula|mat\.|mat|nº|n\.|m\-|\bm\b|reg\.|reg)\s*/g, "");
                texto = texto.replace(/[^a-z0-9]/g, "");
                texto = texto.replace(/^0+/, "");
                return texto || "0";
              };
              
              // Detectar se a aba ou o nome do arquivo menciona mais de uma matrícula
              const matsEncontradas = ctx.matriculasList.filter((m: any) => {
                const matriculaNorm = normalizarMatriculaJS(String(m.numero_matricula));
                const abaNorm = normalizarMatriculaJS(aba.nome);
                const filenameNorm = normalizarMatriculaJS(filename);
                return matriculaNorm && (abaNorm.includes(matriculaNorm) || filenameNorm.includes(matriculaNorm));
              });

              const temUnificadaDetectada = matsEncontradas.length > 1;

              if (temUnificadaDetectada) {
                const idsUnificados = matsEncontradas.map((m: any) => m.id).join(',');
                const numsUnificados = matsEncontradas.map((m: any) => m.numero_matricula).join(' e ');
                selectHtml += `<option value="${idsUnificados}" selected class="text-mint-vibrant font-bold">✨ Gleba Unificada: Matrículas ${numsUnificados}</option>`;
              }

              // Se houver vínculos de desenho compartilhado pré-existentes, adicionar também como opção
              const matsFilhas = ctx.matriculasList.filter((m: any) => m.matricula_origem_desenho_id);
              matsFilhas.forEach((filho: any) => {
                const pai = ctx.matriculasList.find((m: any) => m.id === filho.matricula_origem_desenho_id);
                if (pai && (!temUnificadaDetectada || !matsEncontradas.some((x: any) => x.id === pai.id && matsEncontradas.some((y: any) => y.id === filho.id)))) {
                  selectHtml += `<option value="${pai.id},${filho.id}" class="text-mint-vibrant">🔗 Gleba Conjunta: Matrículas ${pai.numero_matricula} e ${filho.numero_matricula}</option>`;
                }
              });

              ctx.matriculasList.forEach((m: any) => {
                const matriculaNorm = normalizarMatriculaJS(String(m.numero_matricula));
                const abaNorm = normalizarMatriculaJS(aba.nome);
                const filenameNorm = normalizarMatriculaJS(filename);
                
                const devePreSelecionar = !temUnificadaDetectada && (
                  (matriculaNorm && abaNorm && abaNorm.includes(matriculaNorm)) ||
                  (matriculaNorm && filenameNorm && filenameNorm.includes(matriculaNorm)) ||
                  (ctx.matriculasList.length === 1)
                );
                
                selectHtml += `<option value="${m.id}" ${devePreSelecionar ? 'selected' : ''}>Matrícula ${m.numero_matricula}</option>`;
              });
              
              select.innerHTML = selectHtml;
              
              abaRow.appendChild(labelDiv);
              abaRow.appendChild(select);
              fileBlock.appendChild(abaRow);
            });
            
            listaAbasMapeamento.appendChild(fileBlock);
          }
        });
        
        if (abasEncontradas === 0) {
          listaAbasMapeamento.innerHTML = `
            <div class="text-amber-400/80 text-xs py-2 italic text-center">
              Nenhum vértice correspondente ao padrão geodésico regulamentar foi identificado nos arquivos selecionados.
            </div>
          `;
        }
        
        initIcons();
        updateButtonState();
        
        // Mudar o texto do botão para refletir que faremos o processamento das glebas mapeadas
        btnProcessar.innerHTML = `<i data-lucide="upload" class="w-4 h-4"></i> Confirmar e Importar Glebas`;
        initIcons();
      } catch (err: any) {
        console.error("Erro ao analisar arquivos:", err);
        listaAbasMapeamento.innerHTML = `
          <div class="text-red-400 text-xs py-2 italic text-center">
            Erro ao inspecionar os arquivos: ${err.message || err}
          </div>
        `;
        selectedFiles = [];
        updateButtonState();
      }
    };
    
    fileInput.addEventListener('change', (e: any) => {
      if (e.target.files && e.target.files.length > 0) {
        analisarArquivos(Array.from(e.target.files));
      }
    });
    
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('border-mint-vibrant', 'bg-mint-vibrant/[0.02]');
    });
    
    dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-mint-vibrant', 'bg-mint-vibrant/[0.02]');
    });
    
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-mint-vibrant', 'bg-mint-vibrant/[0.02]');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        analisarArquivos(Array.from(e.dataTransfer.files));
      }
    });
    
    btnProcessar.addEventListener('click', async () => {
      if (selectedFiles.length === 0 || !ctx.currentLevId) return;
      
      // Coletar mapeamento do DOM
      const mapeamento: Record<string, number> = {};
      const selects = listaAbasMapeamento.querySelectorAll('.selecao-matricula-aba') as NodeListOf<HTMLSelectElement>;
      
      let temPeloMenosUmMapeado = false;
      selects.forEach(select => {
        const key = select.getAttribute('data-map-key');
        const val = select.value;
        if (key) {
          mapeamento[key] = val ? parseInt(val) : null as any;
          if (val) {
            temPeloMenosUmMapeado = true;
          }
        }
      });
      
      if (!temPeloMenosUmMapeado) {
        alert("Por favor, selecione pelo menos uma matrícula para importar alguma das abas/arquivos.");
        return;
      }
      
      btnProcessar.disabled = true;
      btnProcessar.innerHTML = `<i data-lucide="refresh-cw" class="w-4 h-4 animate-spin"></i> Processando Lote...`;
      initIcons();
      
      const formData = new FormData();
      selectedFiles.forEach(file => {
        formData.append('files', file);
      });
      
      try {
        const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/importar-pontos-aprovados-lote?mapeamento=${encodeURIComponent(JSON.stringify(mapeamento))}`;
        const res = await fetch(url, {
          method: 'POST',
          body: formData
        });
        
        const data = await res.json();
        if (res.ok && data.sucesso) {
          alert(data.mensagem || "Pontos em lote importados com sucesso!");
          
          selectedFiles = [];
          fileInput.value = '';
          const textElement = dropzone.querySelector('p.text-xs') as HTMLElement;
          if (textElement) {
            textElement.innerText = `Lançar TXT/CSV/ODS Homologado`;
          }
          containerMapeamento.classList.add('hidden');
          listaAbasMapeamento.innerHTML = '';
          
          ctx.loadLevantamentoDetails();
        } else {
          alert(data.detail || data.error || "Erro ao processar lote de arquivos.");
        }
      } catch (err) {
        console.error("Erro no upload em lote:", err);
        alert("Erro de conexão com o servidor API.");
      } finally {
        btnProcessar.innerHTML = `<i data-lucide="upload" class="w-4 h-4"></i> Importar Pontos no Banco`;
        updateButtonState();
        initIcons();
      }
    });
  };

  // 7. Auditoria de duplicatas do banco de pontos
  const inicializarAuditoriaBancoPontos = () => {
    const btnToggle = document.getElementById('btn-toggle-auditoria-banco');
    const container = document.getElementById('container-auditoria-banco');
    const iconChevron = document.getElementById('icon-chevron-auditoria');

    if (!btnToggle || !container) return;

    btnToggle.onclick = () => {
      const isHidden = container.classList.contains('hidden');
      if (isHidden) {
        container.classList.remove('hidden');
        if (iconChevron) iconChevron.classList.add('rotate-180');
        renderAuditoriaBancoPontos();
      } else {
        container.classList.add('hidden');
        if (iconChevron) iconChevron.classList.remove('rotate-180');
      }
    };
  };

  // 8. Reatribui a inicialização de eventos com guarda contra dupla vinculação
  let eventosCartorioInicializados = false;
  ctx.inicializarEventosCartorio = () => {
    if (eventosCartorioInicializados) return;
    eventosCartorioInicializados = true;
    inicializarEventosCartorio();
    inicializarHomologacaoIncra();
    inicializarAuditoriaBancoPontos();
  };
  ctx.inicializarEventosCartorio();
}


// Normalizadores e Máquina de Estados Civil reexportados do submódulo dedicado
export {
  normalizarEstadoCivil,
  normalizarRegimeBens,
  configurarMaquinadeEstadosCivil,
  formatarCpfCnpjDinamico
} from './maquina_estado_civil';
