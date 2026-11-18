import { API_BASE } from '../config';
import { customConfirm, escapeHtml, formatarDataHoraUtc, initIcons, showToast } from '../utils';

export interface ArquivoEnviadoRegistro {
  id: number;
  sha256: string;
  nome_arquivo: string;
  extensao?: string | null;
  tamanho_bytes?: number | null;
  categoria: string;
  tipo_documento?: string | null;
  entidade_tipo?: string | null;
  entidade_id?: number | null;
  entidade_nome?: string | null;
  origem_envio?: string | null;
  caminho_origem?: string | null;
  caminho_arquivado?: string | null;
  resumo_extracao?: string | null;
  enviado_em?: string | null;
}

interface VerificacaoArquivoResultado {
  ja_enviado: boolean;
  mesmo_nome: boolean;
  sha256?: string | null;
  nome_arquivo: string;
  tamanho_bytes?: number | null;
  correspondencias_hash: ArquivoEnviadoRegistro[];
  correspondencias_nome: ArquivoEnviadoRegistro[];
}

interface UIModalElement extends HTMLElement {
  abrir?: () => void;
  fechar?: () => void;
}

const MODAL_ID = 'modal-historico-arquivos-ia';

const formatarTamanho = (bytes?: number | null): string => {
  const b = Number(bytes || 0);
  if (b <= 0) return '-';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
};

export const calcularSha256ArquivoNavegador = async (file: File): Promise<string | null> => {
  try {
    if (!globalThis.crypto?.subtle) return null;
    const buffer = await file.arrayBuffer();
    const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
};

const garantirModalDom = (): UIModalElement => {
  let modal = document.getElementById(MODAL_ID) as UIModalElement | null;
  if (modal) return modal;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <ui-modal id="${MODAL_ID}" titulo="Arquivos Já Enviados (IA & Anexos)" tamanho="extra-grande" style="--ui-modal-largura: 920px; max-width: 920px; --ui-modal-padding-x: 22px;">
      <div class="space-y-3">
        <!-- Zona de Conferência Rápida (SHA-256 local sem precisar subir arquivo) -->
        <div id="hist-arq-dropzone" class="det-dropzone group cursor-pointer" title="Selecione ou arraste arquivos para conferir se já foram enviados">
          <i data-lucide="file-search" class="w-5 h-5 text-mint-vibrant shrink-0"></i>
          <div class="min-w-0 flex-1">
            <p class="text-xs font-bold text-white flex items-center gap-2">
              Conferir antes de enviar (anti-repetição)
              <span class="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-mint-vibrant/15 text-mint-vibrant border border-mint-vibrant/25">SHA-256 instantâneo</span>
            </p>
            <p class="text-[11px] text-white/50 mt-0.5">Arraste ou clique para selecionar um ou vários arquivos do computador e verificar se já foram mandados.</p>
          </div>
          <input type="file" id="hist-arq-input-check" multiple class="hidden" />
          <button type="button" id="hist-arq-btn-check" class="lp-btn-sec shrink-0" style="height:30px;padding:0 10px;font-size:11.5px;">
            <i data-lucide="folder-search" class="w-3.5 h-3.5"></i>
            Conferir arquivos
          </button>
        </div>

        <div id="hist-arq-check-resultados" class="hidden space-y-1.5 max-h-40 overflow-y-auto pr-1"></div>

        <!-- Filtros e Busca -->
        <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div class="lp-seg" id="hist-arq-seg" role="group" aria-label="Filtrar por categoria">
            <button type="button" class="lp-seg-btn is-active" data-cat="TODOS">Todos</button>
            <button type="button" class="lp-seg-btn" data-cat="CLIENTE">Clientes</button>
            <button type="button" class="lp-seg-btn" data-cat="MATRICULA">Matrículas</button>
            <button type="button" class="lp-seg-btn" data-cat="PROPRIEDADE">Propriedades</button>
          </div>
          <label class="lp-busca" style="width:clamp(200px,36vw,340px)">
            <i data-lucide="search"></i>
            <input type="text" id="hist-arq-busca" placeholder="Buscar por arquivo, cliente, matrícula..." autocomplete="off" />
          </label>
        </div>

        <!-- Tabela de Histórico -->
        <div class="rounded border border-white/10 overflow-hidden bg-black/20">
          <div class="max-h-[42vh] overflow-y-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead class="sticky top-0 bg-[#0e1712] z-10 border-b border-white/10 text-[10px] uppercase tracking-wider font-bold text-white/45">
                <tr>
                  <th class="py-2 px-3">Arquivo</th>
                  <th class="py-2 px-3">Tipo / Origem</th>
                  <th class="py-2 px-3">Vinculado a</th>
                  <th class="py-2 px-3">Enviado em</th>
                  <th class="py-2 px-3 text-right w-14">Ação</th>
                </tr>
              </thead>
              <tbody id="hist-arq-tbody" class="divide-y divide-white/5">
                <tr><td colspan="5" class="text-center py-6 text-white/40">Carregando...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="flex items-center justify-between text-[11px] text-white/40">
          <span id="hist-arq-resumo">0 arquivo(s) registrado(s)</span>
          <span>Arquivos duplicados são identificados pelo conteúdo (SHA-256) mesmo se renomeados.</span>
        </div>
      </div>
    </ui-modal>
  `;
  document.body.appendChild(wrapper.firstElementChild!);
  modal = document.getElementById(MODAL_ID) as UIModalElement;
  return modal;
};

let categoriaAtual = 'TODOS';
let buscaAtual = '';
let eventosInicializados = false;
let debounceBusca: number | null = null;

const carregarListaArquivos = async () => {
  const tbody = document.getElementById('hist-arq-tbody');
  const resumo = document.getElementById('hist-arq-resumo');
  if (!tbody) return;

  try {
    const params = new URLSearchParams();
    if (categoriaAtual && categoriaAtual !== 'TODOS') params.set('categoria', categoriaAtual);
    if (buscaAtual.trim()) params.set('busca', buscaAtual.trim());
    params.set('limite', '300');

    const res = await fetch(`${API_BASE}/arquivos-enviados?${params.toString()}`);
    if (!res.ok) throw new Error('Falha ao buscar histórico de arquivos.');
    const lista: ArquivoEnviadoRegistro[] = await res.json();

    if (resumo) resumo.textContent = `${lista.length} arquivo(s) exibido(s)`;

    if (!Array.isArray(lista) || lista.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-8 text-white/40 italic">
            Nenhum arquivo encontrado para os filtros informados.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = lista.map(item => {
      const origemBadge = item.origem_envio === 'IA_CHAT'
        ? `<span class="lp-tag lp-tag-pf">IA Chat</span>`
        : `<span class="lp-tag lp-tag-info">Upload</span>`;
      const tipoTxt = item.tipo_documento || item.categoria || 'ARQUIVO';
      const hashCurto = (item.sha256 || '').slice(0, 10);
      const dataFmt = formatarDataHoraUtc(item.enviado_em);

      return `
        <tr class="hover:bg-white/[0.02]">
          <td class="py-2 px-3 min-w-0 max-w-[260px]">
            <div class="font-semibold text-white truncate" title="${escapeHtml(item.nome_arquivo)}">${escapeHtml(item.nome_arquivo)}</div>
            <div class="text-[10px] text-white/40 font-mono truncate" title="SHA-256: ${escapeHtml(item.sha256)}">
              ${formatarTamanho(item.tamanho_bytes)}${hashCurto ? ` · #${escapeHtml(hashCurto)}` : ''}
            </div>
          </td>
          <td class="py-2 px-3">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="lp-tag lp-tag-mute">${escapeHtml(tipoTxt)}</span>
              ${origemBadge}
            </div>
            ${item.resumo_extracao ? `<div class="text-[10px] text-white/45 mt-0.5 truncate max-w-[180px]" title="${escapeHtml(item.resumo_extracao)}">${escapeHtml(item.resumo_extracao)}</div>` : ''}
          </td>
          <td class="py-2 px-3 text-white/85 max-w-[230px]">
            <div class="truncate font-medium" title="${escapeHtml(item.entidade_nome || '-')}">${escapeHtml(item.entidade_nome || '-')}</div>
          </td>
          <td class="py-2 px-3 font-mono text-[11px] text-white/60 whitespace-nowrap">${escapeHtml(dataFmt)}</td>
          <td class="py-2 px-3 text-right">
            <button type="button" class="lp-ico-btn is-danger btn-excluir-hist-arq" data-id="${item.id}" title="Remover do histórico">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
    initIcons();
  } catch {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-red-400">Erro ao carregar histórico de arquivos.</td></tr>`;
  }
};

const verificarArquivosSelecionados = async (files: FileList | File[]) => {
  const container = document.getElementById('hist-arq-check-resultados');
  if (!container || !files || files.length === 0) return;

  container.classList.remove('hidden');
  container.innerHTML = `<div class="text-[11px] text-white/60 py-1 px-2">Calculando assinatura SHA-256 de ${files.length} arquivo(s)...</div>`;

  const descritores = await Promise.all(
    Array.from(files).map(async f => ({
      nome_arquivo: f.name,
      tamanho_bytes: f.size,
      sha256: await calcularSha256ArquivoNavegador(f),
    }))
  );

  try {
    const res = await fetch(`${API_BASE}/arquivos-enviados/verificar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arquivos: descritores }),
    });
    if (!res.ok) throw new Error('Falha na verificação.');
    const data = await res.json();
    const resultados: VerificacaoArquivoResultado[] = data.resultados || [];

    container.innerHTML = resultados.map(r => {
      if (r.ja_enviado) {
        const ref = r.correspondencias_hash[0];
        return `
          <div class="flex items-center justify-between gap-2 px-3 py-2 rounded border border-emerald-500/30 bg-emerald-500/10 text-xs">
            <div class="min-w-0">
              <span class="font-bold text-emerald-300">✅ Já enviado:</span>
              <span class="text-white font-medium">${escapeHtml(r.nome_arquivo)}</span>
              <span class="text-white/65 block text-[11px] truncate">
                Vinculado a <b>${escapeHtml(ref?.entidade_nome || '-')}</b> em ${escapeHtml(formatarDataHoraUtc(ref?.enviado_em))}
                (como "${escapeHtml(ref?.nome_arquivo)}")
              </span>
            </div>
            <span class="lp-tag lp-tag-pf shrink-0">Repetido</span>
          </div>
        `;
      }
      if (r.mesmo_nome) {
        const ref = r.correspondencias_nome[0];
        return `
          <div class="flex items-center justify-between gap-2 px-3 py-2 rounded border border-amber-500/30 bg-amber-500/10 text-xs">
            <div class="min-w-0">
              <span class="font-bold text-amber-300">⚠️ Mesmo nome (conteúdo diferente):</span>
              <span class="text-white font-medium">${escapeHtml(r.nome_arquivo)}</span>
              <span class="text-white/65 block text-[11px] truncate">
                Já existe envio com este nome para <b>${escapeHtml(ref?.entidade_nome || '-')}</b> em ${escapeHtml(formatarDataHoraUtc(ref?.enviado_em))}
              </span>
            </div>
            <span class="lp-tag lp-tag-warn shrink-0">Conferir</span>
          </div>
        `;
      }
      return `
        <div class="flex items-center justify-between gap-2 px-3 py-2 rounded border border-sky-500/25 bg-sky-500/10 text-xs">
          <div class="min-w-0">
            <span class="font-bold text-sky-300">🆕 Ainda não enviado:</span>
            <span class="text-white font-medium">${escapeHtml(r.nome_arquivo)}</span>
            <span class="text-white/55 text-[11px] ml-1">(${formatarTamanho(r.tamanho_bytes)})</span>
          </div>
          <span class="lp-tag lp-tag-info shrink-0">Novo</span>
        </div>
      `;
    }).join('');
  } catch {
    container.innerHTML = `<div class="text-xs text-red-400 px-2 py-1">Erro ao consultar arquivos enviados no servidor.</div>`;
  }
};

const vincularEventosModal = () => {
  if (eventosInicializados) return;
  eventosInicializados = true;

  const seg = document.getElementById('hist-arq-seg');
  seg?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-cat]');
    if (!btn) return;
    categoriaAtual = btn.dataset.cat || 'TODOS';
    seg.querySelectorAll('.lp-seg-btn').forEach(b => b.classList.toggle('is-active', b === btn));
    carregarListaArquivos();
  });

  const inputBusca = document.getElementById('hist-arq-busca') as HTMLInputElement | null;
  inputBusca?.addEventListener('input', () => {
    buscaAtual = inputBusca.value;
    if (debounceBusca) window.clearTimeout(debounceBusca);
    debounceBusca = window.setTimeout(() => carregarListaArquivos(), 200);
  });

  const dropzone = document.getElementById('hist-arq-dropzone');
  const inputCheck = document.getElementById('hist-arq-input-check') as HTMLInputElement | null;
  const btnCheck = document.getElementById('hist-arq-btn-check');

  const abrirSeletor = (e: Event) => {
    e.stopPropagation();
    inputCheck?.click();
  };
  btnCheck?.addEventListener('click', abrirSeletor);
  dropzone?.addEventListener('click', () => inputCheck?.click());

  inputCheck?.addEventListener('change', () => {
    if (inputCheck.files && inputCheck.files.length > 0) {
      verificarArquivosSelecionados(inputCheck.files);
      inputCheck.value = '';
    }
  });

  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('border-mint-vibrant');
  });
  dropzone?.addEventListener('dragleave', () => {
    dropzone.classList.remove('border-mint-vibrant');
  });
  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('border-mint-vibrant');
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      verificarArquivosSelecionados(e.dataTransfer.files);
    }
  });

  const tbody = document.getElementById('hist-arq-tbody');
  tbody?.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.btn-excluir-hist-arq');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (!id) return;
    if (!(await customConfirm('Remover este arquivo do registro de envios?'))) return;
    try {
      const res = await fetch(`${API_BASE}/arquivos-enviados/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Registro removido do histórico.', 'success');
        carregarListaArquivos();
      } else {
        showToast('Não foi possível remover o registro.', 'error');
      }
    } catch {
      showToast('Erro de conexão ao remover registro.', 'error');
    }
  });
};

export const abrirModalHistoricoArquivosIA = (categoriaInicial: 'TODOS' | 'CLIENTE' | 'MATRICULA' | 'PROPRIEDADE' = 'TODOS') => {
  const modal = garantirModalDom();
  vincularEventosModal();

  categoriaAtual = categoriaInicial;
  const seg = document.getElementById('hist-arq-seg');
  seg?.querySelectorAll<HTMLButtonElement>('[data-cat]').forEach(b => {
    b.classList.toggle('is-active', (b.dataset.cat || 'TODOS') === categoriaInicial);
  });

  const checkContainer = document.getElementById('hist-arq-check-resultados');
  if (checkContainer) {
    checkContainer.classList.add('hidden');
    checkContainer.innerHTML = '';
  }

  if (modal.abrir) modal.abrir();
  else modal.classList.remove('hidden');

  initIcons();
  carregarListaArquivos();
};
