import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { initIcons, showToast, escapeHtml, customConfirm } from '../utils';
import {
  filtrarPorSegmentoPend,
  contarSegmentosPend,
  filtrarPendencias,
  ordenarPendencias,
  renderLinhasPendencias,
  type Pendencia,
  type SegmentoPend,
  type CampoOrdemPend,
  type DirecaoOrdem
} from './pendencias/pendencias_helpers';

let atalhoBuscaPend: ((e: KeyboardEvent) => void) | null = null;

export const pendenciasRoute: RouteDef = {
  render: () => `
    <div class="gap-2 animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col h-full min-h-0 flex-1">
      <!-- Barra superior (padrão de listagem): título + segmentos + busca -->
      <div class="lp-bar">
        <div class="lp-bar-left">
          <h2 class="lp-titulo" title="Gerencie tarefas críticas e prazos de georreferenciamento">Pendências</h2>
          <div class="lp-seg" id="seg-pendencias" role="group" aria-label="Filtrar tarefas">
            <button type="button" class="lp-seg-btn is-active" data-seg="abertas" aria-pressed="true">Abertas <span class="lp-seg-n" id="seg-n-abertas">0</span></button>
            <button type="button" class="lp-seg-btn" data-seg="alta" data-tom="warn" aria-pressed="false" title="Abertas com prioridade alta">Alta prioridade <span class="lp-seg-n" id="seg-n-alta">0</span></button>
            <button type="button" class="lp-seg-btn" data-seg="concluidas" aria-pressed="false">Concluídas <span class="lp-seg-n" id="seg-n-concluidas">0</span></button>
            <button type="button" class="lp-seg-btn" data-seg="todas" aria-pressed="false">Todas <span class="lp-seg-n" id="seg-n-todas">0</span></button>
          </div>
        </div>
        <div class="lp-bar-right">
          <label class="lp-busca" id="busca-wrap" style="width:clamp(170px,18vw,320px)">
            <i data-lucide="search"></i>
            <input type="text" id="busca-pendencia" placeholder="Buscar tarefa" autocomplete="off" aria-label="Buscar tarefa" />
            <span class="lp-busca-fim">
              <button type="button" class="lp-busca-limpar" id="busca-limpar" aria-label="Limpar busca"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
              <kbd class="lp-kbd" title="Atalho: pressione / para buscar">/</kbd>
            </span>
          </label>
        </div>
      </div>

      <div class="lp-card">
        <!-- Nova tarefa: sempre à mão, sem abrir modal -->
        <form id="form-pendencia" class="lp-card-barra" style="align-items:flex-end">
          <label class="lp-campo" style="flex:2 1 220px">
            <span>Nova tarefa *</span>
            <input type="text" name="titulo" required placeholder="Título da tarefa" autocomplete="off" />
          </label>
          <label class="lp-campo" style="flex:3 1 260px">
            <span>Descrição</span>
            <input type="text" name="descricao" placeholder="Detalhes (opcional)" autocomplete="off" />
          </label>
          <label class="lp-campo" style="flex:0 0 150px">
            <span>Prioridade</span>
            <select name="prioridade">
              <option value="BAIXA">Baixa</option>
              <option value="MEDIA" selected>Média</option>
              <option value="ALTA">Alta</option>
            </select>
          </label>
          <button type="submit" class="lp-btn-primario" id="btn-criar-pendencia">
            <i data-lucide="plus" class="w-4 h-4"></i>
            Adicionar
          </button>
        </form>

        <div class="lp-wrap overflow-x-auto overflow-y-auto flex-1 min-h-0">
          <table class="lp-tabela is-static">
            <thead>
              <tr>
                <th class="lp-col-check" style="width:52px"><span class="sr-only">Concluir</span></th>
                <th class="lp-ordenavel" data-ordem="titulo" tabindex="0">Tarefa<span class="lp-sort-ico"></span></th>
                <th class="lp-ordenavel lp-oculta-sm" data-ordem="prioridade" aria-sort="descending" tabindex="0">Prioridade<span class="lp-sort-ico"></span></th>
                <th class="lp-ordenavel lp-oculta-md" data-ordem="data" tabindex="0">Criada em<span class="lp-sort-ico"></span></th>
                <th class="lp-col-acoes" style="width:64px"><span class="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody id="lista-pendencias"></tbody>
          </table>
          <div id="pendencias-status" class="hidden" role="status" aria-live="polite"></div>
        </div>

        <div class="lp-rodape">
          <span id="pendencias-info">Carregando tarefas...</span>
        </div>
      </div>
    </div>
  `,
  setup: () => {
    initIcons();
    let todas: Pendencia[] = [];
    let segmentoAtual: SegmentoPend = 'abertas';
    let termo = '';
    let campoOrdem: CampoOrdemPend = 'prioridade';
    let direcaoOrdem: DirecaoOrdem = 'desc';

    const corpo = document.getElementById('lista-pendencias');
    const status = document.getElementById('pendencias-status');
    const info = document.getElementById('pendencias-info');
    const buscaInput = document.getElementById('busca-pendencia') as HTMLInputElement | null;
    const buscaWrap = document.getElementById('busca-wrap');

    const getVisiveis = (): Pendencia[] =>
      ordenarPendencias(filtrarPendencias(filtrarPorSegmentoPend(todas, segmentoAtual), termo), campoOrdem, direcaoOrdem);

    const estadoVazio = (semTarefas: boolean) => {
      if (!status) return;
      status.classList.remove('hidden');
      status.innerHTML = semTarefas
        ? `<div class="lp-estado"><div class="lp-estado-ico"><i data-lucide="check-circle-2"></i></div><div class="lp-estado-titulo">Nenhuma tarefa cadastrada</div><div class="lp-estado-txt">Use o campo acima para adicionar a primeira.</div></div>`
        : `<div class="lp-estado"><div class="lp-estado-ico"><i data-lucide="search"></i></div><div class="lp-estado-titulo">Nenhuma tarefa encontrada</div><div class="lp-estado-txt">Nada corresponde à busca ou ao filtro aplicado.</div><button type="button" class="lp-btn-sec" data-estado-acao="limpar">Limpar busca e filtros</button></div>`;
    };

    const render = () => {
      if (!corpo) return;
      const contagem = contarSegmentosPend(todas);
      (Object.keys(contagem) as SegmentoPend[]).forEach(seg => {
        const n = document.getElementById(`seg-n-${seg}`);
        if (n) { n.innerText = String(contagem[seg]); n.classList.toggle('is-zero', contagem[seg] === 0); }
      });
      document.querySelectorAll<HTMLElement>('#seg-pendencias [data-seg]').forEach(btn => {
        const ativo = btn.dataset.seg === segmentoAtual;
        btn.classList.toggle('is-active', ativo);
        btn.setAttribute('aria-pressed', String(ativo));
      });
      document.querySelectorAll<HTMLElement>('.lp-tabela th[data-ordem]').forEach(th => {
        if (th.dataset.ordem === campoOrdem) th.setAttribute('aria-sort', direcaoOrdem === 'asc' ? 'ascending' : 'descending');
        else th.removeAttribute('aria-sort');
      });

      const visiveis = getVisiveis();
      if (visiveis.length === 0) {
        corpo.innerHTML = '';
        estadoVazio(todas.length === 0);
      } else {
        status?.classList.add('hidden');
        corpo.innerHTML = renderLinhasPendencias(visiveis);
      }
      if (info) info.innerText = `Mostrando ${visiveis.length} de ${todas.length} tarefa(s)`;
      initIcons();
    };

    const mostrarErro = (mensagem: string) => {
      if (!status || !corpo) return;
      corpo.innerHTML = '';
      status.classList.remove('hidden');
      status.innerHTML = `<div class="lp-estado"><div class="lp-estado-ico"><i data-lucide="alert-triangle"></i></div><div class="lp-estado-titulo">Erro ao carregar pendências</div><div class="lp-estado-txt">${escapeHtml(mensagem)}</div><button type="button" class="lp-btn-sec" id="btn-recarregar-pend">Tentar novamente</button></div>`;
      document.getElementById('btn-recarregar-pend')?.addEventListener('click', loadPendencias);
      initIcons();
    };

    const loadPendencias = () => {
      if (corpo) corpo.innerHTML = Array.from({ length: 6 }, () => '<tr><td colspan="5" class="!p-0"><div class="lp-skel"></div></td></tr>').join('');
      status?.classList.add('hidden');
      return fetch(`${API_BASE}/pendencias`)
        .then(res => {
          if (!res.ok) throw new Error('Erro ao carregar pendências');
          return res.json();
        })
        .then(data => {
          todas = Array.isArray(data) ? data : [];
          render();
        })
        .catch(err => mostrarErro(err instanceof Error ? err.message : 'erro desconhecido'));
    };

    // Delegação de eventos da tabela: concluir e excluir
    corpo?.addEventListener('click', async (e: MouseEvent) => {
      const alvo = e.target as HTMLElement;
      const concluir = alvo.closest<HTMLElement>('.btn-concluir');
      const excluir = alvo.closest<HTMLElement>('.btn-excluir');
      try {
        if (concluir) {
          const res = await fetch(`${API_BASE}/pendencias/${concluir.dataset.id}/concluir`, { method: 'POST' });
          if (!res.ok) throw new Error('Erro ao concluir tarefa');
          showToast('Tarefa concluída!', 'success');
          await loadPendencias();
        } else if (excluir) {
          const tarefa = todas.find(p => String(p.id) === excluir.dataset.id);
          if (!(await customConfirm(`Excluir a tarefa "${tarefa?.titulo ?? ''}"? Esta ação não pode ser desfeita.`))) return;
          const res = await fetch(`${API_BASE}/pendencias/${excluir.dataset.id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Erro ao deletar tarefa');
          showToast('Tarefa removida!', 'success');
          await loadPendencias();
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Erro na operação', 'error');
      }
    });

    // Segmentos
    document.getElementById('seg-pendencias')?.addEventListener('click', (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-seg]');
      if (!btn) return;
      segmentoAtual = (btn.dataset.seg as SegmentoPend) || 'abertas';
      render();
    });

    // Ordenação por cabeçalho (clique ou Enter/Espaço); clicar de novo inverte a direção
    const alternarOrdem = (th: HTMLElement) => {
      const campo = th.dataset.ordem as CampoOrdemPend | undefined;
      if (!campo) return;
      if (campo === campoOrdem) direcaoOrdem = direcaoOrdem === 'asc' ? 'desc' : 'asc';
      else { campoOrdem = campo; direcaoOrdem = campo === 'titulo' ? 'asc' : 'desc'; }
      render();
    };
    document.querySelectorAll<HTMLElement>('.lp-tabela th[data-ordem]').forEach(th => {
      th.addEventListener('click', () => alternarOrdem(th));
      th.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternarOrdem(th); }
      });
    });

    // Busca: debounce, ✕ e Esc limpam, "/" foca
    let timeout: ReturnType<typeof setTimeout>;
    buscaInput?.addEventListener('input', () => {
      buscaWrap?.classList.toggle('tem-valor', buscaInput.value.length > 0);
      clearTimeout(timeout);
      timeout = setTimeout(() => { termo = buscaInput.value; render(); }, 200);
    });
    const limparBusca = () => {
      if (!buscaInput) return;
      buscaInput.value = '';
      buscaWrap?.classList.remove('tem-valor');
      clearTimeout(timeout);
      termo = '';
      render();
    };
    document.getElementById('busca-limpar')?.addEventListener('click', () => { limparBusca(); buscaInput?.focus(); });
    buscaInput?.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') { limparBusca(); buscaInput.blur(); }
    });
    status?.addEventListener('click', (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-estado-acao="limpar"]')) { segmentoAtual = 'abertas'; limparBusca(); }
    });
    atalhoBuscaPend = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable)) return;
      e.preventDefault();
      buscaInput?.focus();
    };
    document.addEventListener('keydown', atalhoBuscaPend);

    // Nova tarefa
    document.getElementById('form-pendencia')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const btn = document.getElementById('btn-criar-pendencia') as HTMLButtonElement | null;
      const dados = new FormData(form);
      const payload = {
        titulo: String(dados.get('titulo') || '').trim(),
        descricao: String(dados.get('descricao') || '').trim(),
        prioridade: String(dados.get('prioridade') || 'MEDIA')
      };
      if (!payload.titulo) return;

      if (btn) btn.disabled = true;
      fetch(`${API_BASE}/pendencias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(res => {
          if (!res.ok) throw new Error('Erro ao criar pendência');
          form.reset();
          showToast('Nova tarefa adicionada!', 'success');
          segmentoAtual = segmentoAtual === 'concluidas' ? 'abertas' : segmentoAtual; // a nova tarefa nasce aberta: não escondê-la
          return loadPendencias();
        })
        .catch(err => showToast(err.message, 'error'))
        .finally(() => { if (btn) btn.disabled = false; });
    });

    loadPendencias();
  },
  cleanup: () => {
    if (atalhoBuscaPend) {
      document.removeEventListener('keydown', atalhoBuscaPend);
      atalhoBuscaPend = null;
    }
  }
};
