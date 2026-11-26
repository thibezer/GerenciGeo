import { API_BASE } from '../../config';
import { escapeHtml, initIcons, showToast } from '../../utils';
import type { MesaTrabalhoContext } from './mesa_trabalho_context';

type TipoVinculo = 'apenas_cadastrar' | 'proprietario' | 'confrontante';

interface CorrespondenciaAnterior {
  entidade_nome?: string;
  enviado_em?: string;
}

interface ArquivoTriagem {
  nome: string;
  caminho: string;
  extensao: string;
  tamanho_bytes: number;
  modificado_em: string;
  tipo_vinculo: TipoVinculo;
  observacao: string;
  enviado_em?: string;
  ja_enviado?: boolean;
  mesmo_nome?: boolean;
  correspondencias_anteriores?: CorrespondenciaAnterior[];
}

const MODAL_ID = 'modal-triagem-matriculas';

const LABELS_VINCULO: Record<TipoVinculo, string> = {
  apenas_cadastrar: 'Só cadastrar no sistema',
  proprietario: 'Proprietário / Cliente',
  confrontante: 'Confrontante',
};

const CORES_BADGE_VINCULO: Record<TipoVinculo, string> = {
  apenas_cadastrar: 'bg-white/10 text-white/75 border-white/15',
  proprietario: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  confrontante: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
};

function formatarTamanho(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatarDataHora(iso?: string): string {
  if (!iso) return '—';
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return iso;
    return dt.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

async function lerErroResposta(res: Response, padrao: string): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.detail === 'string' && data.detail.trim()) return data.detail;
    if (typeof data?.error === 'string' && data.error.trim()) return data.error;
  } catch {
    // ignora
  }
  return padrao;
}

export async function abrirModalTriagemMatriculas(ctx?: MesaTrabalhoContext): Promise<void> {
  let modal = document.getElementById(MODAL_ID) as (HTMLElement & { abrir?: () => void; fechar?: () => void }) | null;
  if (modal) {
    modal.remove();
  }

  modal = document.createElement('ui-modal') as HTMLElement & { abrir?: () => void; fechar?: () => void };
  modal.id = MODAL_ID;
  modal.setAttribute('titulo', 'Triagem de Matrículas (Entrada IA)');
  modal.setAttribute('tamanho', 'grande');
  modal.style.cssText =
    '--ui-modal-largura: 960px; max-width: 960px; --ui-modal-padding-x: 18px; --ui-modal-header-py: 8px; --ui-modal-body-py: 14px;';

  modal.innerHTML = `
    <div class="space-y-4 text-xs text-white/90">
      <!-- Barra informativa superior -->
      <div class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10">
        <div class="flex items-center gap-2 min-w-0">
          <i data-lucide="folder-input" class="w-4 h-4 text-mint-vibrant shrink-0"></i>
          <div class="min-w-0">
            <div class="text-[11px] font-semibold text-white/85">Envio direto para a pasta de extração da IA</div>
            <div id="triagem-pasta-caminho" class="text-[10px] font-mono text-white/45 truncate">Carregando pasta de entrada...</div>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span id="triagem-badge-total" class="px-2 py-0.5 rounded bg-mint-vibrant/15 text-mint-vibrant border border-mint-vibrant/25 font-mono text-[10px] font-bold">0 pendentes</span>
          <ui-botao id="btn-triagem-abrir-pasta" variante="secondary" tamanho="sm" title="Abrir pasta Matriculas_Entrada no Windows Explorer">
            Abrir Pasta
          </ui-botao>
          <ui-botao id="btn-triagem-atualizar" variante="ghost" tamanho="sm" title="Recarregar lista de arquivos">
            Atualizar
          </ui-botao>
        </div>
      </div>

      <!-- Grid principal: Envio (esquerda) + Fila Pendente (direita) -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <!-- Coluna de Upload + Observação -->
        <div class="lg:col-span-5 space-y-3 bg-white/[0.02] border border-white/10 rounded-xl p-3.5">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-bold uppercase tracking-wider text-white/70">1. Adicionar Matrículas</span>
            <span class="text-[10px] text-white/40">PDF, PNG, JPG, TIF</span>
          </div>

          <!-- Dropzone -->
          <label id="triagem-dropzone" class="flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 border-dashed border-white/15 hover:border-mint-vibrant/50 hover:bg-mint-vibrant/[0.04] cursor-pointer transition-colors text-center">
            <input id="triagem-input-arquivos" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff" class="hidden" />
            <div class="w-9 h-9 rounded-full bg-mint-vibrant/10 border border-mint-vibrant/25 flex items-center justify-center">
              <i data-lucide="upload-cloud" class="w-4 h-4 text-mint-vibrant"></i>
            </div>
            <div>
              <div class="text-xs font-semibold text-white/85">Arraste as certidões aqui ou clique</div>
              <div class="text-[10px] text-white/45 mt-0.5">Você pode enviar uma ou várias matrículas de uma vez</div>
            </div>
          </label>

          <!-- Arquivos selecionados antes do envio -->
          <div id="triagem-selecionados" class="hidden space-y-1.5 max-h-28 overflow-y-auto pr-1"></div>

          <!-- Vínculo / Destino -->
          <div class="space-y-1.5">
            <label class="block text-[10px] font-bold uppercase tracking-wider text-white/55">De quem é esta matrícula?</label>
            <div id="triagem-vinculo-opcoes" class="grid grid-cols-3 gap-1.5">
              <button type="button" data-vinculo="apenas_cadastrar" class="triagem-vinculo-btn px-2 py-1.5 rounded-lg border text-[10px] font-semibold transition-all bg-mint-vibrant/15 text-mint-vibrant border-mint-vibrant/40">
                Só cadastrar
              </button>
              <button type="button" data-vinculo="proprietario" class="triagem-vinculo-btn px-2 py-1.5 rounded-lg border text-[10px] font-semibold transition-all bg-white/[0.03] text-white/65 border-white/10 hover:border-white/25">
                Proprietário
              </button>
              <button type="button" data-vinculo="confrontante" class="triagem-vinculo-btn px-2 py-1.5 rounded-lg border text-[10px] font-semibold transition-all bg-white/[0.03] text-white/65 border-white/10 hover:border-white/25">
                Confrontante
              </button>
            </div>
          </div>

          <!-- Observação -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between gap-2">
              <label for="triagem-observacao" class="block text-[10px] font-bold uppercase tracking-wider text-white/55">Observação para extração</label>
              <button type="button" id="triagem-btn-limpar-obs" class="text-[10px] text-white/40 hover:text-white/75 hidden">Limpar</button>
            </div>
            <textarea
              id="triagem-observacao"
              rows="3"
              placeholder="Ex.: Confrontante lado norte (João Silva), matrícula do proprietário, ou deixe em branco se não souber para só cadastrar no sistema..."
              class="w-full rounded-lg bg-black/30 border border-white/15 focus:border-mint-vibrant/60 focus:outline-none px-2.5 py-2 text-xs text-white placeholder:text-white/30 resize-y"
            ></textarea>
          </div>

          <ui-botao id="btn-triagem-enviar" variante="primary" class="w-full" disabled>
            Enviar para Triagem
          </ui-botao>
        </div>

        <!-- Coluna da Fila de Arquivos -->
        <div class="lg:col-span-7 flex flex-col bg-white/[0.02] border border-white/10 rounded-xl p-3.5 min-h-[340px]">
          <div class="flex items-center justify-between mb-2.5">
            <span class="text-[11px] font-bold uppercase tracking-wider text-white/70">2. Fila Aguardando Extração</span>
            <span class="text-[10px] text-white/40">Edite a observação ou visualize antes da IA processar</span>
          </div>

          <div id="triagem-lista-arquivos" class="flex-1 space-y-2 max-h-[390px] overflow-y-auto pr-1">
            <div class="py-10 text-center text-white/40 text-xs">Carregando arquivos da pasta de entrada...</div>
          </div>
        </div>
      </div>
    </div>

    <div slot="rodape" class="flex flex-wrap items-center justify-between gap-2 w-full">
      <div class="text-[11px] text-white/50 flex items-center gap-1.5">
        <i data-lucide="sparkles" class="w-3.5 h-3.5 text-mint-vibrant"></i>
        <span>Depois de enviar, peça no chat: <strong class="text-white/80">"Analise as matrículas da pasta"</strong></span>
      </div>
      <ui-botao variante="secondary" tamanho="sm" dismiss-modal>Fechar</ui-botao>
    </div>
  `;

  document.body.appendChild(modal);

  // Estado local do modal
  let arquivosSelecionados: File[] = [];
  let vinculoSelecionado: TipoVinculo = 'apenas_cadastrar';
  let enviando = false;

  const dropzone = modal.querySelector('#triagem-dropzone') as HTMLLabelElement;
  const inputArquivos = modal.querySelector('#triagem-input-arquivos') as HTMLInputElement;
  const boxSelecionados = modal.querySelector('#triagem-selecionados') as HTMLDivElement;
  const obsTextarea = modal.querySelector('#triagem-observacao') as HTMLTextAreaElement;
  const btnLimparObs = modal.querySelector('#triagem-btn-limpar-obs') as HTMLButtonElement;
  const btnEnviar = modal.querySelector('#btn-triagem-enviar') as HTMLElement & { disabled: boolean; carregando?: boolean };
  const listaArquivosEl = modal.querySelector('#triagem-lista-arquivos') as HTMLDivElement;
  const pastaCaminhoEl = modal.querySelector('#triagem-pasta-caminho') as HTMLDivElement;
  const badgeTotalEl = modal.querySelector('#triagem-badge-total') as HTMLSpanElement;
  const btnAbrirPasta = modal.querySelector('#btn-triagem-abrir-pasta') as HTMLElement;
  const btnAtualizar = modal.querySelector('#btn-triagem-atualizar') as HTMLElement;
  const vinculoBtns = Array.from(modal.querySelectorAll('.triagem-vinculo-btn')) as HTMLButtonElement[];

  // Sugestão discreta caso haja propriedade ativa na mesa de trabalho (sem forçar)
  const propNome = (ctx as any)?.currentLevData?.propriedade_nome;
  if (propNome && !obsTextarea.value) {
    obsTextarea.placeholder = `Ex.: Confrontante da ${propNome}, ou deixe em branco se não souber para só cadastrar no sistema...`;
  }

  const atualizarBotaoEnviar = () => {
    const temArquivos = arquivosSelecionados.length > 0;
    if (temArquivos && !enviando) {
      btnEnviar.removeAttribute('disabled');
      btnEnviar.disabled = false;
      btnEnviar.textContent =
        arquivosSelecionados.length === 1
          ? 'Enviar 1 Matrícula para Triagem'
          : `Enviar ${arquivosSelecionados.length} Matrículas para Triagem`;
    } else {
      btnEnviar.setAttribute('disabled', '');
      btnEnviar.disabled = true;
      btnEnviar.textContent = enviando ? 'Enviando...' : 'Enviar para Triagem';
    }
  };

  const renderSelecionados = () => {
    if (arquivosSelecionados.length === 0) {
      boxSelecionados.classList.add('hidden');
      boxSelecionados.innerHTML = '';
      atualizarBotaoEnviar();
      return;
    }

    boxSelecionados.classList.remove('hidden');
    boxSelecionados.innerHTML = arquivosSelecionados
      .map(
        (file, idx) => `
      <div class="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-black/30 border border-white/10">
        <div class="flex items-center gap-2 min-w-0">
          <i data-lucide="file-text" class="w-3.5 h-3.5 text-mint-vibrant shrink-0"></i>
          <span class="truncate text-[11px] text-white/85">${escapeHtml(file.name)}</span>
          <span class="text-[10px] font-mono text-white/40 shrink-0">${formatarTamanho(file.size)}</span>
        </div>
        <button type="button" data-remove-idx="${idx}" class="text-white/40 hover:text-red-400 p-0.5 shrink-0" title="Remover da seleção">
          <i data-lucide="x" class="w-3.5 h-3.5"></i>
        </button>
      </div>`
      )
      .join('');

    boxSelecionados.querySelectorAll<HTMLButtonElement>('[data-remove-idx]').forEach((btn) => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.removeIdx);
        arquivosSelecionados.splice(idx, 1);
        renderSelecionados();
      };
    });

    initIcons();
    atualizarBotaoEnviar();
  };

  const adicionarArquivos = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const permitidas = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff'];
    let ignorados = 0;
    for (const f of Array.from(files)) {
      const ext = f.name.includes('.') ? `.${f.name.split('.').pop()!.toLowerCase()}` : '';
      if (!permitidas.includes(ext)) {
        ignorados++;
        continue;
      }
      const jaNaLista = arquivosSelecionados.some((x) => x.name === f.name && x.size === f.size);
      if (!jaNaLista) {
        arquivosSelecionados.push(f);
      }
    }
    if (ignorados > 0) {
      showToast('Alguns arquivos foram ignorados. Use PDF ou imagem (PNG, JPG, WEBP, TIF).', 'info');
    }
    renderSelecionados();
  };

  // Seleção de vínculo
  const aplicarEstadoVinculo = (novo: TipoVinculo) => {
    vinculoSelecionado = novo;
    vinculoBtns.forEach((btn) => {
      const ativo = btn.dataset.vinculo === novo;
      btn.className = ativo
        ? 'triagem-vinculo-btn px-2 py-1.5 rounded-lg border text-[10px] font-semibold transition-all bg-mint-vibrant/15 text-mint-vibrant border-mint-vibrant/40'
        : 'triagem-vinculo-btn px-2 py-1.5 rounded-lg border text-[10px] font-semibold transition-all bg-white/[0.03] text-white/65 border-white/10 hover:border-white/25';
    });
  };
  vinculoBtns.forEach((btn) => {
    btn.onclick = () => aplicarEstadoVinculo((btn.dataset.vinculo as TipoVinculo) || 'apenas_cadastrar');
  });

  obsTextarea.addEventListener('input', () => {
    btnLimparObs.classList.toggle('hidden', obsTextarea.value.trim().length === 0);
  });
  btnLimparObs.onclick = () => {
    obsTextarea.value = '';
    btnLimparObs.classList.add('hidden');
  };

  // Drag and drop
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('border-mint-vibrant', 'bg-mint-vibrant/10');
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('border-mint-vibrant', 'bg-mint-vibrant/10');
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('border-mint-vibrant', 'bg-mint-vibrant/10');
    adicionarArquivos(e.dataTransfer?.files || null);
  });
  inputArquivos.addEventListener('change', () => {
    adicionarArquivos(inputArquivos.files);
    inputArquivos.value = '';
  });

  // Carregamento da fila
  const carregarFila = async () => {
    try {
      const res = await fetch(`${API_BASE}/matriculas-triagem/entrada`);
      if (!res.ok) {
        throw new Error(await lerErroResposta(res, 'Erro ao listar pasta de entrada.'));
      }
      const data = await res.json();
      const lista: ArquivoTriagem[] = Array.isArray(data.arquivos) ? data.arquivos : [];
      pastaCaminhoEl.textContent = data.pasta_entrada || 'Matriculas_Entrada';
      badgeTotalEl.textContent = `${lista.length} ${lista.length === 1 ? 'pendente' : 'pendentes'}`;

      if (lista.length === 0) {
        listaArquivosEl.innerHTML = `
          <div class="flex flex-col items-center justify-center py-12 text-center gap-2 text-white/40">
            <i data-lucide="inbox" class="w-8 h-8 text-white/20"></i>
            <div class="text-xs font-medium text-white/60">Nenhuma matrícula pendente na fila</div>
            <div class="text-[11px] max-w-xs">Arraste PDFs ou imagens ao lado para prepará-las para extração.</div>
          </div>`;
        initIcons();
        return;
      }

      listaArquivosEl.innerHTML = lista
        .map((item) => {
          const corVinculo = CORES_BADGE_VINCULO[item.tipo_vinculo] || CORES_BADGE_VINCULO.apenas_cadastrar;
          const labelVinculo = LABELS_VINCULO[item.tipo_vinculo] || LABELS_VINCULO.apenas_cadastrar;
          const corr = item.correspondencias_anteriores?.[0];
          const avisoDuplicado = item.ja_enviado
            ? `<span class="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[9px] font-semibold" title="Arquivo idêntico já cadastrado anteriormente${corr?.entidade_nome ? `: ${escapeHtml(corr.entidade_nome)}` : ''}">Já cadastrada antes</span>`
            : item.mesmo_nome
              ? `<span class="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[9px] font-semibold">Mesmo nome no histórico</span>`
              : '';

          return `
            <div class="p-3 rounded-lg bg-black/25 border border-white/10 space-y-2" data-arquivo-nome="${escapeHtml(item.nome)}">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 space-y-1">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <i data-lucide="file-text" class="w-3.5 h-3.5 text-mint-vibrant shrink-0"></i>
                    <span class="font-semibold text-xs text-white/90 truncate max-w-[260px]" title="${escapeHtml(item.nome)}">${escapeHtml(item.nome)}</span>
                    <span class="px-1.5 py-0.5 rounded border text-[9px] font-semibold ${corVinculo}">${labelVinculo}</span>
                    ${avisoDuplicado}
                  </div>
                  <div class="text-[10px] font-mono text-white/40">
                    ${formatarTamanho(item.tamanho_bytes)} • Enviado em ${formatarDataHora(item.enviado_em || item.modificado_em)}
                  </div>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <button type="button" data-acao="visualizar" class="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/75 hover:text-white text-[10px] font-semibold flex items-center gap-1" title="Visualizar arquivo">
                    <i data-lucide="eye" class="w-3 h-3"></i>
                    <span>Abrir</span>
                  </button>
                  <button type="button" data-acao="remover" class="px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-300 text-[10px] font-semibold flex items-center gap-1" title="Remover da fila">
                    <i data-lucide="trash-2" class="w-3 h-3"></i>
                  </button>
                </div>
              </div>

              <!-- Edição rápida de vínculo e observação -->
              <div class="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/5">
                <select data-campo="vinculo" class="rounded bg-black/40 border border-white/15 px-2 py-1 text-[10px] text-white/85 focus:outline-none focus:border-mint-vibrant/50">
                  <option value="apenas_cadastrar" ${item.tipo_vinculo === 'apenas_cadastrar' ? 'selected' : ''}>Só cadastrar</option>
                  <option value="proprietario" ${item.tipo_vinculo === 'proprietario' ? 'selected' : ''}>Proprietário</option>
                  <option value="confrontante" ${item.tipo_vinculo === 'confrontante' ? 'selected' : ''}>Confrontante</option>
                </select>
                <input
                  type="text"
                  data-campo="observacao"
                  value="${escapeHtml(item.observacao || '')}"
                  placeholder="Observação (de quem / confrontante...)"
                  class="flex-1 min-w-[160px] rounded bg-black/40 border border-white/15 px-2 py-1 text-[11px] text-white placeholder:text-white/30 focus:outline-none focus:border-mint-vibrant/50"
                />
                <button type="button" data-acao="salvar-obs" class="px-2.5 py-1 rounded bg-mint-vibrant/15 hover:bg-mint-vibrant/25 text-mint-vibrant border border-mint-vibrant/25 text-[10px] font-semibold shrink-0">
                  Salvar
                </button>
              </div>
            </div>`;
        })
        .join('');

      // Eventos nos cards da fila
      listaArquivosEl.querySelectorAll<HTMLElement>('[data-arquivo-nome]').forEach((card) => {
        const nomeArq = card.dataset.arquivoNome!;
        const selVinculo = card.querySelector<HTMLSelectElement>('[data-campo="vinculo"]');
        const inpObs = card.querySelector<HTMLInputElement>('[data-campo="observacao"]');

        card.querySelector<HTMLButtonElement>('[data-acao="visualizar"]')?.addEventListener('click', () => {
          window.open(`${API_BASE}/matriculas-triagem/entrada/${encodeURIComponent(nomeArq)}/visualizar`, '_blank');
        });

        card.querySelector<HTMLButtonElement>('[data-acao="salvar-obs"]')?.addEventListener('click', async () => {
          try {
            const resObs = await fetch(
              `${API_BASE}/matriculas-triagem/entrada/${encodeURIComponent(nomeArq)}/observacao`,
              {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  tipo_vinculo: selVinculo?.value || 'apenas_cadastrar',
                  observacao: inpObs?.value || '',
                }),
              }
            );
            if (!resObs.ok) {
              throw new Error(await lerErroResposta(resObs, 'Erro ao salvar observação.'));
            }
            showToast('Observação atualizada!', 'success');
            await carregarFila();
          } catch (err: any) {
            showToast(err?.message || 'Erro ao salvar observação.', 'error');
          }
        });

        card.querySelector<HTMLButtonElement>('[data-acao="remover"]')?.addEventListener('click', async () => {
          try {
            const resDel = await fetch(`${API_BASE}/matriculas-triagem/entrada/${encodeURIComponent(nomeArq)}`, {
              method: 'DELETE',
            });
            if (!resDel.ok) {
              throw new Error(await lerErroResposta(resDel, 'Erro ao remover arquivo.'));
            }
            showToast(`"${nomeArq}" removido da fila.`, 'info');
            await carregarFila();
          } catch (err: any) {
            showToast(err?.message || 'Erro ao remover arquivo.', 'error');
          }
        });
      });

      initIcons();
    } catch (err: any) {
      listaArquivosEl.innerHTML = `<div class="py-8 text-center text-red-300 text-xs">${escapeHtml(err?.message || 'Erro ao carregar fila de triagem.')}</div>`;
    }
  };

  // Envio para o backend
  btnEnviar.addEventListener('click', async () => {
    if (enviando || arquivosSelecionados.length === 0) return;
    enviando = true;
    atualizarBotaoEnviar();
    try {
      const form = new FormData();
      for (const f of arquivosSelecionados) {
        form.append('arquivos', f);
      }
      form.append('tipo_vinculo', vinculoSelecionado);
      form.append('observacao', obsTextarea.value.trim());

      const res = await fetch(`${API_BASE}/matriculas-triagem/upload`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        throw new Error(await lerErroResposta(res, 'Falha ao enviar matrículas.'));
      }
      const data = await res.json();
      const enviados = Number(data.enviados || arquivosSelecionados.length);
      showToast(
        enviados === 1
          ? 'Matrícula enviada para triagem com sucesso!'
          : `${enviados} matrículas enviadas para triagem!`,
        'success'
      );

      arquivosSelecionados = [];
      obsTextarea.value = '';
      btnLimparObs.classList.add('hidden');
      aplicarEstadoVinculo('apenas_cadastrar');
      renderSelecionados();
      await carregarFila();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao enviar matrículas.', 'error');
    } finally {
      enviando = false;
      atualizarBotaoEnviar();
    }
  });

  btnAbrirPasta.addEventListener('click', async () => {
    try {
      const res = await fetch(`${API_BASE}/matriculas-triagem/abrir-pasta`, { method: 'POST' });
      if (!res.ok) throw new Error(await lerErroResposta(res, 'Não foi possível abrir a pasta.'));
    } catch (err: any) {
      showToast(err?.message || 'Erro ao abrir pasta.', 'error');
    }
  });

  btnAtualizar.addEventListener('click', () => {
    carregarFila();
  });

  modal.addEventListener('ui-fechar', () => {
    setTimeout(() => modal?.remove(), 200);
  });

  if (typeof modal.abrir === 'function') {
    modal.abrir();
  } else {
    modal.setAttribute('aberto', '');
  }

  initIcons();
  await carregarFila();
}
