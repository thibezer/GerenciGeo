import type { RouteDef } from '../types';
import { API_BASE, PUBLIC_HOST_URL } from '../config';
import { initIcons, showToast, escapeHtml } from '../utils';
import L from 'leaflet';
import {
   filtrarLevantamentos,
   filtrarPorSegmento,
   contarSegmentosLev,
   ordenarLevantamentos,
   renderLinhasLevHtml,
   renderCardsLevHtml
} from './levantamentos/levantamentos_helpers';
import type { SegmentoLev, CampoOrdemLev, DirecaoOrdem } from './levantamentos/levantamentos_helpers';


let clickOutsideHandler: ((e: MouseEvent) => void) | null = null;
let atalhoBuscaLev: ((e: KeyboardEvent) => void) | null = null;
// Em escopo de módulo para que o cleanup consiga destruir o mapa se a tela for trocada com o modal aberto
let mapaTriagem: L.Map | null = null;

// Extrai a mensagem de erro de respostas FastAPI (detail string, objeto ou lista de validação 422)
const extrairMensagemErro = (data: any, fallback: string): string => {
   const detail = data?.detail;
   if (typeof detail === 'string') return detail;
   if (Array.isArray(detail)) return detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ');
   if (detail && typeof detail === 'object') return detail.mensagem || JSON.stringify(detail);
   return data?.error || fallback;
};

// Data de hoje no fuso local (toISOString usaria UTC e, à noite no Brasil, já daria o dia seguinte)
const dataLocalHoje = (): string => {
   const d = new Date();
   return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const levantamentosRoute: RouteDef = {
   render: () => `
    <div class="gap-2 animate-in fade-in duration-300 flex flex-col h-full min-h-0 flex-1">
      <!-- Barra superior (padrão de listagem): título + segmentos + visualização + busca + ações -->
      <div class="lp-bar">
        <div class="lp-bar-left">
          <h2 class="lp-titulo">Levantamentos</h2>
          <div class="lp-seg" id="seg-levantamentos" role="group" aria-label="Filtrar levantamentos por situação">
            <button type="button" class="lp-seg-btn is-active" data-seg="todos" aria-pressed="true">Todos <span class="lp-seg-n" id="seg-n-todos">0</span></button>
            <button type="button" class="lp-seg-btn" data-seg="andamento" aria-pressed="false">Andamento <span class="lp-seg-n" id="seg-n-andamento">0</span></button>
            <button type="button" class="lp-seg-btn" data-seg="concluido" aria-pressed="false">Concluídos <span class="lp-seg-n" id="seg-n-concluido">0</span></button>
            <button type="button" class="lp-seg-btn" data-seg="arquivado" aria-pressed="false">Arquivados <span class="lp-seg-n" id="seg-n-arquivado">0</span></button>
            <button type="button" class="lp-seg-btn" data-seg="pendencias" data-tom="warn" aria-pressed="false" title="Sem proprietário, sem TRT ou sem pontos">Pendências <span class="lp-seg-n" id="seg-n-pendencias">0</span></button>
          </div>
        </div>
        <div class="lp-bar-right">
          <!-- Alternador de visualização -->
          <div class="lp-seg" id="lev-view-toggle" role="group" aria-label="Modo de visualização">
            <button type="button" class="lp-seg-btn" id="btn-mode-list" title="Lista" aria-label="Visualizar em lista" style="padding:0 7px"><i data-lucide="list" class="w-3.5 h-3.5"></i></button>
            <button type="button" class="lp-seg-btn" id="btn-mode-grid" title="Cards" aria-label="Visualizar em cards" style="padding:0 7px"><i data-lucide="layout-grid" class="w-3.5 h-3.5"></i></button>
          </div>
          <label class="lp-busca" id="busca-wrap" style="width:clamp(150px,13vw,280px)">
            <i data-lucide="search"></i>
            <input type="text" id="busca-levantamento" placeholder="Buscar levantamento" title="Busca por propriedade, município, proprietário, CAR, CCIR ou TRT" autocomplete="off" aria-label="Buscar levantamento" />
            <span class="lp-busca-fim">
              <button type="button" class="lp-busca-limpar" id="busca-limpar" aria-label="Limpar busca"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
              <kbd class="lp-kbd" title="Atalho: pressione / para buscar">/</kbd>
            </span>
          </label>
          <button type="button" class="lp-btn-sec" id="btn-triagem-txt" title="Área de Triagem (importar arquivos .txt)" style="color:var(--lp-accent);border-color:rgba(0,224,138,.25)">
            <i data-lucide="filter" class="w-3.5 h-3.5"></i>
            Triagem
          </button>
          <button type="button" class="lp-btn-primario" id="btn-novo-lev" title="Novo levantamento" aria-label="Novo levantamento">
            <i data-lucide="plus" class="w-4 h-4"></i>
            Novo
          </button>
        </div>
      </div>

      <!-- Área da lista (tabela dentro de .lp-card, ou grade de cards): é aqui que rola -->
      <div id="grid-projetos" class="lp-card"></div>

      <!-- MODAL NOVO/EDITAR LEVANTAMENTO -->
      <div id="modal-levantamento" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
         <div class="glass-card w-full max-w-md">
            <div class="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
               <h3 class="text-lg font-bold flex items-center gap-2">
                  <i data-lucide="plus" class="w-5 h-5 text-mint-vibrant"></i>
                  <span id="modal-lev-titulo">Novo Levantamento</span>
               </h3>
               <button class="text-white/40 hover:text-white" id="btn-fechar-modal-lev">
                  <i data-lucide="x" class="w-5 h-5"></i>
               </button>
            </div>
            <form id="form-levantamento" class="p-6 space-y-4">
               <div class="relative">
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Selecionar Propriedade *</label>
                  <input type="text" id="input-lev-prop-busca" placeholder="Digite para buscar propriedade..." class="glass-input w-full text-xs py-3 md:py-2 pr-8" autocomplete="off" required />
                  <input type="hidden" id="select-lev-propriedade" required />
                  <div id="lista-flutuante-propriedades" class="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-[#0a100d] border border-white/10 rounded-technical shadow-2xl z-50 hidden divide-y divide-white/5">
                     <!-- Opções renderizadas dinamicamente -->
                  </div>
               </div>
               <div>
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Responsável Técnico *</label>
                  <select id="select-lev-profissional" required class="glass-input w-full text-xs py-3 md:py-2">
                     <option value="">Carregando profissionais...</option>
                  </select>
               </div>
               <div>
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Data de Início *</label>
                  <input type="date" id="input-lev-data" required class="glass-input w-full text-sm py-3 md:py-2" />
               </div>
               <div>
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Número TRT (Opcional)</label>
                  <input type="text" id="input-lev-trt-numero" class="glass-input w-full text-xs py-3 md:py-2" placeholder="Ex: 2026123456" />
               </div>
               <div>
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Data Quitação TRT (Opcional)</label>
                  <input type="date" id="input-lev-trt-data" class="glass-input w-full text-sm py-3 md:py-2" />
               </div>
               <div id="container-lev-status" class="hidden">
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Status *</label>
                  <select id="select-lev-status" class="glass-input w-full text-xs py-3 md:py-2">
                     <option value="EM_ANDAMENTO">Em Andamento</option>
                     <option value="CONCLUIDO">Concluido</option>
                     <option value="ARQUIVADO">Arquivado</option>
                  </select>
               </div>
               <div class="flex justify-end gap-3 pt-4 border-t border-white/5">
                  <button type="button" class="btn-secondary text-xs" id="btn-cancelar-lev">Cancelar</button>
                  <button type="submit" class="btn-primary text-xs" id="btn-submit-lev">Criar Levantamento</button>
               </div>
            </form>
         </div>
      </div>

      <!-- MODAL ÁREA DE TRIAGEM -->
      <div id="modal-triagem" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
         <div class="glass-card w-full max-w-5xl h-[85vh] flex flex-col">
            <!-- Cabeçalho -->
            <div class="p-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02] shrink-0">
               <h3 class="text-sm font-bold flex items-center gap-2">
                  <i data-lucide="filter" class="w-4 h-4 text-mint-vibrant"></i>
                  <span>Área de Triagem Espacial (Testador de Arquivos)</span>
               </h3>
               <button class="text-white/40 hover:text-white" id="btn-fechar-modal-triagem">
                  <i data-lucide="x" class="w-4 h-4"></i>
               </button>
            </div>
            <!-- Conteúdo Principal -->
            <div class="p-4 flex flex-col md:flex-row gap-4 overflow-hidden flex-1 min-h-0">
               <!-- Painel de Controle (Esquerdo) -->
               <div class="w-full md:w-2/5 flex flex-col gap-3 overflow-y-auto pr-1">
                  <div>
                     <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">1. Carregar Arquivo de Pontos (.TXT) *</label>
                     <div id="drop-zone-triagem" class="border border-dashed border-white/10 hover:border-mint-vibrant/40 rounded-lg p-4 text-center cursor-pointer transition-colors bg-white/[0.01]">
                        <i data-lucide="upload-cloud" class="w-6 h-6 text-white/20 mx-auto mb-1" id="icon-upload-triagem"></i>
                        <span class="text-[10px] block text-white/60 font-medium" id="label-upload-triagem">Arraste ou clique para selecionar arquivos .txt</span>
                        <input type="file" id="input-file-triagem" accept=".txt" multiple class="hidden" />
                     </div>
                  </div>
                  <div class="flex gap-2">
                     <div class="flex-1">
                        <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Fuso UTM *</label>
                        <select id="select-fuso-triagem" class="glass-input w-full text-[11px] py-1 px-2">
                           <option value="18">Fuso 18S</option>
                           <option value="19">Fuso 19S</option>
                           <option value="20">Fuso 20S</option>
                           <option value="21">Fuso 21S</option>
                           <option value="22" selected>Fuso 22S (PR/SP/etc.)</option>
                           <option value="23">Fuso 23S (MG/RJ/BA/etc.)</option>
                           <option value="24">Fuso 24S</option>
                           <option value="25">Fuso 25S</option>
                        </select>
                     </div>
                     <div class="flex flex-col justify-end min-w-[90px]">
                        <label class="flex items-center gap-1 text-[9px] text-white/60 font-bold mb-1.5 cursor-pointer select-none">
                           <input type="checkbox" id="chk-inverter-ne" class="rounded border-white/10 text-mint-vibrant bg-white/5 focus:ring-0 focus:ring-offset-0 w-3 h-3 cursor-pointer" />
                           Inverter N/E
                        </label>
                        <button type="button" class="btn-primary text-[10px] py-1.5 px-3 flex items-center justify-center gap-1 w-full" id="btn-processar-triagem">
                           <i data-lucide="play" class="w-3 h-3"></i> Processar
                        </button>
                     </div>
                  </div>

                  <!-- Lista de pontos carregados -->
                  <div class="flex-1 flex flex-col min-h-[120px] border border-white/5 rounded-lg p-2.5 bg-white/[0.01] overflow-hidden">
                     <div class="flex justify-between items-center mb-1 shrink-0">
                        <span class="text-[9px] text-white/40 uppercase font-bold">Pontos Carregados (<span id="count-pontos-triagem">0</span>)</span>
                        <span class="text-[8px] font-mono font-bold bg-mint-vibrant/10 text-mint-vibrant px-1.5 py-0.5 rounded hidden" id="tag-layout-triagem">RTK</span>
                     </div>
                     <div class="flex-1 overflow-y-auto text-[10px] font-mono text-white/60 divide-y divide-white/5 font-mono max-h-[180px]" id="lista-pontos-triagem">
                        <div class="text-white/20 italic text-center py-4">Nenhum arquivo carregado</div>
                     </div>
                  </div>

                  <!-- Direcionar para Levantamento -->
                  <div class="border-t border-white/5 pt-3 space-y-2 shrink-0">
                     <h4 class="text-[11px] font-bold text-mint-vibrant flex items-center gap-1">
                        <i data-lucide="corner-down-right" class="w-3.5 h-3.5"></i>
                        <span>2. Direcionar para Levantamento</span>
                     </h4>
                     <div>
                        <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Selecionar Levantamento *</label>
                        <select id="select-destino-triagem" class="glass-input w-full text-[11px] py-1 px-2">
                           <option value="">Selecione o levantamento...</option>
                        </select>
                     </div>
                     <div class="grid grid-cols-2 gap-2">
                        <div>
                           <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Matrícula (Opcional)</label>
                           <select id="select-matricula-triagem" class="glass-input w-full text-[11px] py-1 px-2" disabled>
                              <option value="">Selecione o levantamento...</option>
                           </select>
                        </div>
                        <div>
                           <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Base de Campo (Opcional)</label>
                           <select id="select-base-triagem" class="glass-input w-full text-[11px] py-1 px-2" disabled>
                              <option value="">Selecione o levantamento...</option>
                           </select>
                        </div>
                     </div>
                     <button type="button" class="btn-primary w-full text-[11px] py-2 flex items-center justify-center gap-1 active:scale-95 transition-all mb-2" id="btn-salvar-associacao-triagem" disabled>
                        <i data-lucide="check" class="w-3.5 h-3.5"></i>
                        Confirmar e Importar
                     </button>
                  </div>
               </div>
               <!-- Mapa (Direito) -->
               <div class="w-full md:w-3/5 h-[300px] md:h-full rounded-lg overflow-hidden border border-white/5 relative bg-black/40 flex-1">
                  <div id="mapa-triagem" class="w-full h-full z-10"></div>
                  <!-- Indicador de sem dados no mapa -->
                  <div id="placeholder-mapa-triagem" class="absolute inset-0 bg-[#0a100d]/90 flex flex-col items-center justify-center z-20 text-center p-4 pointer-events-none">
                     <i data-lucide="map" class="w-10 h-10 text-white/10 mb-1"></i>
                     <span class="text-[10px] text-white/30 font-medium">Os pontos serão plotados aqui após o processamento</span>
                  </div>
               </div>
            </div>
         </div>
      </div>
   </div>
  `,
   setup: () => {
      let levantamentosList: any[] = [];
      let globalPropriedadesList: any[] = [];
      let editandoLevId: number | null = null;
      let viewMode: 'grid' | 'list' = (localStorage.getItem('lev_view_mode') as 'grid' | 'list') || 'list';
      let segmentoAtual: SegmentoLev = 'todos';
      let termoBusca = '';
      let campoOrdem: CampoOrdemLev = 'data';
      let direcaoOrdem: DirecaoOrdem = 'desc';

      const updateToggleButtonsState = () => {
         const ativar = (id: string, ativo: boolean) => {
            const btn = document.getElementById(id);
            btn?.classList.toggle('is-active', ativo);
            btn?.setAttribute('aria-pressed', String(ativo));
         };
         ativar('btn-mode-list', viewMode === 'list');
         ativar('btn-mode-grid', viewMode === 'grid');
      };

      // Pipeline único: segmento -> busca -> ordenação (a tela inteira renderiza a partir daqui)
      const getListaVisivel = (): any[] =>
         ordenarLevantamentos(filtrarLevantamentos(filtrarPorSegmento(levantamentosList, segmentoAtual), termoBusca), campoOrdem, direcaoOrdem);

      const configurarComboboxPropriedades = () => {
         const inputBusca = document.getElementById('input-lev-prop-busca') as HTMLInputElement;
         const inputHidden = document.getElementById('select-lev-propriedade') as HTMLInputElement;
         const listaFlutuante = document.getElementById('lista-flutuante-propriedades');

         if (!inputBusca || !inputHidden || !listaFlutuante) return;

         const renderOpcoes = (termo: string) => {
            const t = termo.toLowerCase();
            const filtradas = globalPropriedadesList.filter(p =>
               p.nome_propriedade.toLowerCase().includes(t) ||
               p.municipio.toLowerCase().includes(t) ||
               p.uf.toLowerCase().includes(t) ||
               (p.codigo_car && p.codigo_car.toLowerCase().includes(t))
            );

            if (filtradas.length === 0) {
               listaFlutuante.innerHTML = '<div class="p-3 text-xs text-white/30 italic">Nenhuma propriedade localizada.</div>';
            } else {
               listaFlutuante.innerHTML = filtradas.map(p => `
            <div class="opcao-prop-item p-3 hover:bg-mint-vibrant/10 cursor-pointer text-xs transition-colors flex flex-col" data-id="${p.id}" data-nome="${escapeHtml(`${p.nome_propriedade} (${p.municipio}/${p.uf})`)}">
              <span class="font-bold text-white">${escapeHtml(p.nome_propriedade)}</span>
              <span class="text-[10px] text-white/40 font-mono mt-0.5">CAR: ${escapeHtml(p.codigo_car || 'N/I')} • ${escapeHtml(p.municipio)}/${escapeHtml(p.uf)}</span>
            </div>
          `).join('');

               listaFlutuante.querySelectorAll('.opcao-prop-item').forEach(item => {
                  item.addEventListener('click', () => {
                     const id = item.getAttribute('data-id') || '';
                     const nome = item.getAttribute('data-nome') || '';

                     inputBusca.value = nome;
                     inputHidden.value = id;
                     listaFlutuante.classList.add('hidden');
                  });
               });
            }
         };

         inputBusca.addEventListener('focus', () => {
            listaFlutuante.classList.remove('hidden');
            renderOpcoes(inputBusca.value);
         });

         inputBusca.addEventListener('input', () => {
            // Texto digitado manualmente invalida a seleção anterior
            inputHidden.value = '';
            listaFlutuante.classList.remove('hidden');
            renderOpcoes(inputBusca.value);
         });

         clickOutsideHandler = (e: MouseEvent) => {
            if (!inputBusca.contains(e.target as Node) && !listaFlutuante.contains(e.target as Node)) {
               listaFlutuante.classList.add('hidden');
            }
         };
         document.addEventListener('click', clickOutsideHandler);
      };

      const loadLevantamentos = () => {
         const grid = document.getElementById('grid-projetos');
         if (!grid) return;
         grid.className = 'lp-card';
         grid.innerHTML = Array.from({ length: 6 }, () => '<div class="lp-skel"></div>').join('');

         fetch(`${API_BASE}/levantamentos`)
            .then(res => {
               if (!res.ok) throw new Error(`HTTP ${res.status}`);
               return res.json();
            })
            .then(data => {
               levantamentosList = Array.isArray(data) ? data : [];
               renderTela();
            })
            .catch(() => {
               grid.className = 'lp-card';
               grid.innerHTML = '<div class="lp-estado"><div class="lp-estado-ico"><i data-lucide="alert-triangle"></i></div><div class="lp-estado-titulo">Erro de conexão com o servidor</div><div class="lp-estado-txt">Não foi possível carregar os levantamentos.</div><button type="button" class="lp-btn-sec" id="btn-recarregar-lev">Tentar novamente</button></div>';
               document.getElementById('btn-recarregar-lev')?.addEventListener('click', () => loadLevantamentos());
               initIcons();
            });
      };

      // Chips de segmento (contagem sobre a lista inteira)
      const atualizarCabecalhoLista = () => {
         const contagem = contarSegmentosLev(levantamentosList);
         (Object.keys(contagem) as SegmentoLev[]).forEach(seg => {
            const n = document.getElementById(`seg-n-${seg}`);
            if (n) { n.innerText = String(contagem[seg]); n.classList.toggle('is-zero', contagem[seg] === 0); }
         });
         document.querySelectorAll<HTMLElement>('#seg-levantamentos [data-seg]').forEach(btn => {
            const ativo = btn.getAttribute('data-seg') === segmentoAtual;
            btn.classList.toggle('is-active', ativo);
            btn.setAttribute('aria-pressed', String(ativo));
         });
      };

      const renderEstadoVazio = (grid: HTMLElement, semCadastro: boolean) => {
         grid.className = 'lp-card';
         grid.innerHTML = semCadastro
            ? `<div class="lp-estado">
                 <div class="lp-estado-ico"><i data-lucide="folder"></i></div>
                 <div class="lp-estado-titulo">Nenhum levantamento cadastrado</div>
                 <div class="lp-estado-txt">Crie um levantamento para iniciar a triagem e a auditoria dos pontos.</div>
                 <button type="button" class="lp-btn-primario" data-estado-acao="novo"><i data-lucide="plus" class="w-4 h-4"></i>Novo levantamento</button>
               </div>`
            : `<div class="lp-estado">
                 <div class="lp-estado-ico"><i data-lucide="search"></i></div>
                 <div class="lp-estado-titulo">Nenhum levantamento encontrado</div>
                 <div class="lp-estado-txt">Nada corresponde à busca ou ao filtro aplicado.</div>
                 <button type="button" class="lp-btn-sec" data-estado-acao="limpar">Limpar busca e filtros</button>
               </div>`;
      };

      const renderTela = () => {
         atualizarCabecalhoLista();
         renderListaProjetos(getListaVisivel());
      };

      const renderListaProjetos = (lista: any[]) => {
         const grid = document.getElementById('grid-projetos');
         if (!grid) return;

         if (lista.length === 0) {
            renderEstadoVazio(grid, levantamentosList.length === 0);
         } else if (viewMode === 'grid') {
            grid.className = 'flex-1 min-h-0 overflow-y-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 content-start pr-1';
            grid.innerHTML = renderCardsLevHtml(lista);
         } else {
            grid.className = 'lp-card';
            const th = (campo: CampoOrdemLev | null, rotulo: string, extra = '') => {
               if (!campo) return `<th class="${extra}">${rotulo}</th>`;
               const ordem = campo === campoOrdem ? ` aria-sort="${direcaoOrdem === 'asc' ? 'ascending' : 'descending'}"` : '';
               return `<th class="lp-ordenavel ${extra}" data-ordem="${campo}"${ordem} tabindex="0">${rotulo}<span class="lp-sort-ico"></span></th>`;
            };
            grid.innerHTML = `
               <div class="lp-wrap overflow-x-auto overflow-y-auto flex-1 min-h-0">
                  <table class="lp-tabela">
                     <thead>
                        <tr>
                           ${th('nome', 'Levantamento', 'lp-celula-nome')}
                           ${th('data', 'Início')}
                           ${th(null, 'Status')}
                           ${th(null, 'Proprietários', 'lp-oculta-lg lp-celula-fixa')}
                           ${th('pontos', 'Medições', 'lp-col-num lp-oculta-md')}
                           <th class="lp-col-acoes" style="width:150px"><span class="sr-only">Ações</span></th>
                        </tr>
                     </thead>
                     <tbody>${renderLinhasLevHtml(lista)}</tbody>
                  </table>
               </div>
               <div class="lp-rodape">
                  <span>Mostrando ${lista.length} de ${levantamentosList.length} levantamento(s)</span>
                  <span class="lp-muted" style="font-size:11px">Clique na linha para abrir na mesa de trabalho</span>
               </div>`;
         }

         initIcons();

         // Delegação de eventos no grid-projetos
         grid.onclick = (e) => {
            const target = e.target as HTMLElement;
            const th = target.closest<HTMLElement>('th[data-ordem]');
            if (th) { alternarOrdem(th); return; }
            const btn = target.closest('.btn-auditar, .btn-auditar-icon, .btn-auditar-link, .btn-editar-lev, .btn-excluir-lev, .btn-desarquivar-lev, .btn-compartilhar-lev') as HTMLElement;
            if (!btn) {
               // Linha inteira abre a mesa de trabalho (mesma ação do botão Auditar)
               const linhaId = parseInt(target.closest<HTMLElement>('tr.lev-list-item')?.getAttribute('data-id') || '0');
               if (linhaId) { localStorage.setItem('active_levantamento_id', linhaId.toString()); window.location.hash = '#mesa_trabalho'; }
               return;
            }

            const id = parseInt(btn.getAttribute('data-id') || '0');

            if (btn.classList.contains('btn-auditar') || btn.classList.contains('btn-auditar-icon') || btn.classList.contains('btn-auditar-link')) {
               localStorage.setItem('active_levantamento_id', id.toString());
               window.location.hash = '#mesa_trabalho';
            } else if (btn.classList.contains('btn-compartilhar-lev')) {
               (async () => {
                  try {
                     const res = await fetch(`${API_BASE}/levantamentos/${id}/compartilhar`, { method: 'POST' });
                     const data = await res.json();
                     if (res.ok) {
                        const link = `${PUBLIC_HOST_URL}#compartilhado/${data.codigo}`;
                        try {
                           await navigator.clipboard.writeText(link);
                           showToast("Link público copiado para a área de transferência!", "success");
                        } catch(e) {
                           prompt("Copie o link público abaixo:", link);
                        }
                     } else {
                        showToast(data.detail || "Erro ao gerar link de compartilhamento", "error");
                     }
                  } catch(e) {
                     console.error("Erro comunicação:", e);
                     showToast("Erro na comunicação com o servidor", "error");
                  }
               })();
            } else if (btn.classList.contains('btn-desarquivar-lev')) {
               (async () => {
                  const justificativa = prompt("Informe a justificativa formal para o desarquivamento do levantamento:");
                  if (justificativa === null) return; // Cancelou
                  if (!justificativa.trim()) {
                     alert("A justificativa é obrigatória para desarquivamento.");
                     return;
                  }

                  try {
                     const res = await fetch(`${API_BASE}/levantamentos/${id}/desarquivar`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ justificativa })
                     });
                     const data = await res.json();
                     if (res.ok) {
                        alert(data.message || "Levantamento desarquivado com sucesso.");
                        loadLevantamentos();
                     } else {
                        alert(data.detail || "Erro ao desarquivar levantamento.");
                     }
                  } catch (err) {
                     console.error(err);
                     alert("Erro na requisição de desarquivamento.");
                  }
               })();
            } else if (btn.classList.contains('btn-editar-lev')) {
               (async () => {
                  const l = levantamentosList.find(x => x.id === id);
                  if (!l) return;
                  editandoLevId = id;
                  try {
                     const res = await fetch(`${API_BASE}/propriedades`);
                     globalPropriedadesList = await res.json();
                  } catch (err) { console.error("Erro:", err); }

                  const modalTitulo = document.getElementById('modal-lev-titulo');
                  if (modalTitulo) modalTitulo.innerText = "Editar Levantamento";
                  const submitBtn = document.getElementById('btn-submit-lev');
                  if (submitBtn) submitBtn.innerText = "Salvar Alterações";

                  const inputBusca = document.getElementById('input-lev-prop-busca') as HTMLInputElement;
                  const inputHidden = document.getElementById('select-lev-propriedade') as HTMLInputElement;
                  const selectProf = document.getElementById('select-lev-profissional') as HTMLSelectElement;
                  const inputData = document.getElementById('input-lev-data') as HTMLInputElement;
                  const inputTrtNumero = document.getElementById('input-lev-trt-numero') as HTMLInputElement;
                  const inputTrtData = document.getElementById('input-lev-trt-data') as HTMLInputElement;
                  const selectStatus = document.getElementById('select-lev-status') as HTMLSelectElement;
                  const containerStatus = document.getElementById('container-lev-status');

                  const propObj = globalPropriedadesList.find(p => p.id === l.propriedade_id);
                  if (inputBusca && propObj) inputBusca.value = `${propObj.nome_propriedade} (${propObj.municipio}/${propObj.uf})`;
                  if (inputHidden) inputHidden.value = l.propriedade_id.toString();
                  if (selectProf) selectProf.value = l.profissional_id.toString();
                  if (inputData) inputData.value = l.data_inicio;
                  if (inputTrtNumero) inputTrtNumero.value = l.numero_trt || '';
                  if (inputTrtData) inputTrtData.value = l.data_trt || '';
                  if (selectStatus) selectStatus.value = l.status;
                  if (containerStatus) containerStatus.classList.remove('hidden');
                  document.getElementById('modal-levantamento')?.classList.remove('hidden');
               })();
            } else if (btn.classList.contains('btn-excluir-lev')) {
               (async () => {
                  const l = levantamentosList.find(x => x.id === id);
                  const nome = l ? l.nome_propriedade : `#${id}`;
                  if (!confirm(`Excluir o levantamento "${nome}"?\n\nPontos, segmentos e confrontantes deste levantamento serão removidos do banco.`)) return;
                  // Pergunta separada: Cancelar aqui mantém a pasta, não cancela a exclusão
                  const apagarArquivos = confirm('Apagar também a pasta física (Workspace) com os arquivos do levantamento?\n\nOK: apagar a pasta\nCancelar: manter a pasta no disco');
                  try {
                     const res = await fetch(`${API_BASE}/levantamentos/${id}?apagar_arquivos=${apagarArquivos}`, { method: 'DELETE' });
                     const resData = await res.json().catch(() => ({}));
                     if (!res.ok) {
                        showToast(extrairMensagemErro(resData, 'Erro ao excluir levantamento.'), 'error');
                        return;
                     }
                     showToast(resData.message || 'Levantamento removido.', resData.aviso_pasta ? 'error' : 'success');
                     loadLevantamentos();
                  } catch (err) {
                     console.error('Erro ao excluir levantamento:', err);
                     showToast('Erro de comunicação com o servidor ao tentar excluir.', 'error');
                  }
               })();
            }
         };
      };

      // --- BOTOES DE ALTERNAÇÃO DE VISUALIZAÇÃO ---
      updateToggleButtonsState();

      const trocarModo = (modo: 'grid' | 'list') => {
         if (viewMode === modo) return;
         viewMode = modo;
         localStorage.setItem('lev_view_mode', modo);
         updateToggleButtonsState();
         renderTela();
      };
      document.getElementById('btn-mode-grid')?.addEventListener('click', () => trocarModo('grid'));
      document.getElementById('btn-mode-list')?.addEventListener('click', () => trocarModo('list'));

      // --- ORDENAÇÃO (clique ou Enter/Espaço no cabeçalho; de novo inverte a direção) ---
      const alternarOrdem = (th: HTMLElement) => {
         const campo = th.getAttribute('data-ordem') as CampoOrdemLev | null;
         if (!campo) return;
         if (campo === campoOrdem) direcaoOrdem = direcaoOrdem === 'asc' ? 'desc' : 'asc';
         else { campoOrdem = campo; direcaoOrdem = campo === 'nome' ? 'asc' : 'desc'; }
         renderTela();
      };
      document.getElementById('grid-projetos')?.addEventListener('keydown', (e: KeyboardEvent) => {
         const alvo = e.target as HTMLElement;
         if (e.key === 'Enter' && alvo.matches('tr.lev-list-item')) {
            localStorage.setItem('active_levantamento_id', alvo.getAttribute('data-id') || '0');
            window.location.hash = '#mesa_trabalho';
         } else if ((e.key === 'Enter' || e.key === ' ') && alvo.matches('th[data-ordem]')) {
            e.preventDefault();
            alternarOrdem(alvo);
         }
      });

      // --- SEGMENTOS ---
      document.getElementById('seg-levantamentos')?.addEventListener('click', (e: MouseEvent) => {
         const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-seg]');
         if (!btn) return;
         segmentoAtual = (btn.getAttribute('data-seg') as SegmentoLev) || 'todos';
         renderTela();
      });

      // --- BUSCA (debounce; ✕ limpa; Esc limpa; "/" foca) ---
      const buscaInput = document.getElementById('busca-levantamento') as HTMLInputElement | null;
      const buscaWrap = document.getElementById('busca-wrap');
      let timeoutBusca: ReturnType<typeof setTimeout>;
      buscaInput?.addEventListener('input', () => {
         buscaWrap?.classList.toggle('tem-valor', buscaInput.value.length > 0);
         clearTimeout(timeoutBusca);
         timeoutBusca = setTimeout(() => { termoBusca = buscaInput.value; renderTela(); }, 250);
      });
      const limparBusca = () => {
         if (!buscaInput) return;
         buscaInput.value = '';
         buscaWrap?.classList.remove('tem-valor');
         clearTimeout(timeoutBusca);
         termoBusca = '';
         renderTela();
      };
      document.getElementById('busca-limpar')?.addEventListener('click', () => { limparBusca(); buscaInput?.focus(); });
      buscaInput?.addEventListener('keydown', (e: KeyboardEvent) => {
         if (e.key === 'Escape') { limparBusca(); buscaInput.blur(); }
      });
      atalhoBuscaLev = (e: KeyboardEvent) => {
         if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
         const alvo = e.target as HTMLElement | null;
         if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable)) return;
         e.preventDefault();
         buscaInput?.focus();
      };
      document.addEventListener('keydown', atalhoBuscaLev);

      // Ações do estado vazio (criar / limpar filtros)
      document.getElementById('grid-projetos')?.addEventListener('click', (e: MouseEvent) => {
         const acao = (e.target as HTMLElement).closest<HTMLElement>('[data-estado-acao]')?.getAttribute('data-estado-acao');
         if (acao === 'novo') document.getElementById('btn-novo-lev')?.click();
         else if (acao === 'limpar') { segmentoAtual = 'todos'; limparBusca(); }
      });

      document.getElementById('btn-novo-lev')?.addEventListener('click', async () => {
         editandoLevId = null;

         const modalTitulo = document.getElementById('modal-lev-titulo');
         if (modalTitulo) modalTitulo.innerText = "Novo Levantamento";

         const submitBtn = document.getElementById('btn-submit-lev');
         if (submitBtn) submitBtn.innerText = "Criar Levantamento";

         const containerStatus = document.getElementById('container-lev-status');
         if (containerStatus) containerStatus.classList.add('hidden');

         const modalLev = document.getElementById('modal-levantamento');
         const inputBusca = document.getElementById('input-lev-prop-busca') as HTMLInputElement;
         const inputHidden = document.getElementById('select-lev-propriedade') as HTMLInputElement;
         const inputData = document.getElementById('input-lev-data') as HTMLInputElement;
         const inputTrtNumero = document.getElementById('input-lev-trt-numero') as HTMLInputElement;
         const inputTrtData = document.getElementById('input-lev-trt-data') as HTMLInputElement;

         if (inputData) {
            inputData.value = dataLocalHoje();
         }
         if (inputBusca) inputBusca.value = '';
         if (inputHidden) inputHidden.value = '';
         if (inputTrtNumero) inputTrtNumero.value = '';
         if (inputTrtData) inputTrtData.value = '';

         try {
            const res = await fetch(`${API_BASE}/propriedades`);
            globalPropriedadesList = await res.json();
            if (globalPropriedadesList.length === 0) {
               alert("Cadastre uma propriedade no módulo de Propriedades primeiro!");
               return;
            }
            modalLev?.classList.remove('hidden');
         } catch (e) {
            alert("Erro ao buscar propriedades.");
         }
      });

      document.getElementById('btn-fechar-modal-lev')?.addEventListener('click', () => {
         document.getElementById('modal-levantamento')?.classList.add('hidden');
      });
      document.getElementById('btn-cancelar-lev')?.addEventListener('click', () => {
         document.getElementById('modal-levantamento')?.classList.add('hidden');
      });

      document.getElementById('form-levantamento')?.addEventListener('submit', async (e) => {
         e.preventDefault();
         const propriedade_id = parseInt((document.getElementById('select-lev-propriedade') as HTMLSelectElement).value);
         const profissional_id = parseInt((document.getElementById('select-lev-profissional') as HTMLSelectElement).value);
         const data_inicio = (document.getElementById('input-lev-data') as HTMLInputElement).value;
         const numero_trt = (document.getElementById('input-lev-trt-numero') as HTMLInputElement).value.trim() || null;
         const data_trt = (document.getElementById('input-lev-trt-data') as HTMLInputElement).value || null;

         // O input hidden não participa da validação nativa do formulário
         if (!propriedade_id) {
            showToast('Selecione uma propriedade da lista de sugestões.', 'error');
            document.getElementById('input-lev-prop-busca')?.focus();
            return;
         }
         if (!profissional_id) {
            showToast('Selecione um responsável técnico válido.', 'error');
            return;
         }

         const payload: any = { propriedade_id, profissional_id, data_inicio, numero_trt, data_trt };

         if (editandoLevId) {
            const selectStatus = document.getElementById('select-lev-status') as HTMLSelectElement;
            payload.status = selectStatus.value;
            if (payload.status === 'ARQUIVADO' && !confirm("ATENÇÃO: Arquivar este levantamento gera o snapshot de fechamento, trava as pastas físicas como Somente Leitura e bloqueia a edição de dados. Deseja continuar?")) {
               return;
            }
         }

         const url = editandoLevId ? `${API_BASE}/levantamentos/${editandoLevId}` : `${API_BASE}/levantamentos`;
         const method = editandoLevId ? 'PUT' : 'POST';

         // Desabilita o botão submit para evitar double-submit durante a requisição
         const btnSubmit = document.getElementById('btn-submit-lev') as HTMLButtonElement;
         if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.textContent = 'Salvando...'; }

         try {
            const res = await fetch(url, {
               method: method,
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error) {
               showToast(extrairMensagemErro(data, `Erro ao salvar levantamento (HTTP ${res.status}).`), 'error');
               return;
            }
            document.getElementById('modal-levantamento')?.classList.add('hidden');
            showToast(data.message || (editandoLevId ? 'Levantamento atualizado.' : 'Levantamento criado.'), 'success');
            loadLevantamentos();
         } catch (e) {
            console.error('Erro ao salvar levantamento:', e);
            showToast('Erro de comunicação com o servidor ao salvar levantamento.', 'error');
         } finally {
            if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.textContent = editandoLevId ? 'Salvar Alterações' : 'Criar Levantamento'; }
         }
      });

      const loadProfissionais = () => {
         const selectProf = document.getElementById('select-lev-profissional') as HTMLSelectElement;
         if (!selectProf) return;

         fetch(`${API_BASE}/profissionais`)
            .then(res => {
               if (!res.ok) throw new Error(`HTTP ${res.status}`);
               return res.json();
            })
            .then(data => {
               if (!data || data.length === 0) {
                  selectProf.innerHTML = '<option value="">Nenhum profissional cadastrado</option>';
                  return;
               }
               selectProf.innerHTML = data.map((p: any) => `
               <option value="${p.id}">${escapeHtml(p.nome)} (${escapeHtml(p.registro || 'Sem Registro')})</option>
             `).join('');
            })
            .catch(err => {
               console.error("Erro ao carregar profissionais:", err);
               selectProf.innerHTML = '<option value="">Erro ao carregar profissionais</option>';
            });
      };

      // =========================================================================
      // LÓGICA DA ÁREA DE TRIAGEM ESPACIAL
      // =========================================================================
      let mapaTriagemMarkers: L.Marker[] = [];
      let mapaTriagemPolyline: L.Polyline | null = null;
      let arquivosSelecionadosTriagem: File[] = [];
      let pontosProcessadosTriagem: any[] = [];

      const initMapaTriagem = () => {
         if (mapaTriagem) {
            mapaTriagem.remove();
            mapaTriagem = null;
         }

         const mapContainer = document.getElementById('mapa-triagem');
         if (!mapContainer) return;

         mapaTriagem = L.map('mapa-triagem', {
            maxZoom: 24,
            scrollWheelZoom: true
         }).setView([-23.7661, -53.3204], 14);

         // Google Satélite
         L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
            maxZoom: 24,
            maxNativeZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
            attribution: 'Google Maps'
         }).addTo(mapaTriagem);
      };

      const limparMapaTriagem = () => {
         if (!mapaTriagem) return;
         mapaTriagemMarkers.forEach(m => mapaTriagem!.removeLayer(m));
         mapaTriagemMarkers = [];
         if (mapaTriagemPolyline) {
            mapaTriagem.removeLayer(mapaTriagemPolyline);
            mapaTriagemPolyline = null;
         }
      };

      const plotarPontosNoMapaTriagem = (pontos: any[]) => {
         limparMapaTriagem();
         if (!mapaTriagem || pontos.length === 0) return;

         const placeholder = document.getElementById('placeholder-mapa-triagem');
         if (placeholder) placeholder.classList.add('hidden');

         const coords: L.LatLng[] = [];
         // Perímetro: exclui bases (set_base / nome com BASE), que não são vértices da poligonal
         const coordsPerimetro: L.LatLng[] = [];

         pontos.forEach(p => {
            if (p.lat && p.lon) {
               const latLng = L.latLng(p.lat, p.lon);
               coords.push(latLng);

               // Copiado o mesmo estilo do mapa oficial do GerenciGeo
               const isBaseFisica = p.descricao && p.descricao.toLowerCase() === 'set_base';
               // Nome iniciado por 'M' é marco de divisa (vértice do perímetro), não base
               const isBasePeloNome = !!p.nome && p.nome.toUpperCase().includes('BASE');
               if (!isBaseFisica && !isBasePeloNome) coordsPerimetro.push(latLng);
               let markerBg = 'bg-mint-vibrant text-[#0c1510]';

               if (isBasePeloNome) {
                  markerBg = 'bg-indigo-600 text-white';
               } else if (isBaseFisica) {
                  markerBg = 'bg-rose-600 text-white';
               }

               const markerHtml = `
                 <div class="w-5 h-5 ${markerBg} border-2 border-[#0c1510] rounded-full flex items-center justify-center text-[7px] font-bold font-mono shadow-lg transition-transform hover:scale-125">
                   ${escapeHtml(p.nome.substring(0, 3))}
                 </div>
               `;
               const customIcon = L.divIcon({
                  html: markerHtml,
                  className: 'custom-leaflet-marker',
                  iconSize: [20, 20]
               });

               const popupRole = isBasePeloNome
                  ? 'Base (Provável, pelo nome)'
                  : (isBaseFisica ? 'Base de Campo (RTK set_base)' : 'Vértice de Perímetro');

               const marker = L.marker(latLng, { icon: customIcon })
                  .bindPopup(`
                     <div style="font-family:var(--geo-font-sans),sans-serif; color:rgba(255, 255, 255, 0.9); line-height:1.3; font-size:11px;">
                        <div style="font-weight:700; font-size:13px; margin-bottom:4px; color:#00b366;">${escapeHtml(p.nome)}</div>
                        <div style="font-size:10px; color:rgba(255, 255, 255, 0.65); font-weight:bold;">${popupRole}</div>
                        <div style="margin-top:4px; color:rgba(255, 255, 255, 0.85);">N: ${p.norte.toFixed(3)}</div>
                        <div style="color:rgba(255, 255, 255, 0.85);">E: ${p.este.toFixed(3)}</div>
                        <div style="color:rgba(255, 255, 255, 0.85);">Alt: ${p.alt.toFixed(3)}</div>
                        <div style="font-size:9px; color:rgba(255, 255, 255, 0.45); font-family:'JetBrains Mono',monospace; margin-top:4px;">Lat ${p.lat.toFixed(6)} &nbsp; Lon ${p.lon.toFixed(6)}</div>
                     </div>
                  `, { maxWidth: 220 })
                  .addTo(mapaTriagem!);

               mapaTriagemMarkers.push(marker);
            }
         });

         if (coords.length > 0) {
            // Desenha a polilinha conectando os vértices do perímetro e fechando no primeiro
            if (coordsPerimetro.length > 1) {
               mapaTriagemPolyline = L.polyline([...coordsPerimetro, coordsPerimetro[0]], {
                  color: '#00ff88',
                  weight: 2,
                  opacity: 0.8,
                  dashArray: '5, 5'
               }).addTo(mapaTriagem);
            }

            const bounds = L.latLngBounds(coords);
            mapaTriagem.fitBounds(bounds, { padding: [40, 40] });
         }
      };

      const btnTriagem = document.getElementById('btn-triagem-txt');
      const modalTriagem = document.getElementById('modal-triagem');
      const btnFecharTriagem = document.getElementById('btn-fechar-modal-triagem');

      const dropZone = document.getElementById('drop-zone-triagem');
      const inputFile = document.getElementById('input-file-triagem') as HTMLInputElement;
      const labelUpload = document.getElementById('label-upload-triagem');
      const iconUpload = document.getElementById('icon-upload-triagem');

      const selectFuso = document.getElementById('select-fuso-triagem') as HTMLSelectElement;
      const chkInverterNE = document.getElementById('chk-inverter-ne') as HTMLInputElement;
      const btnProcessar = document.getElementById('btn-processar-triagem');
      const countPontos = document.getElementById('count-pontos-triagem');
      const tagLayout = document.getElementById('tag-layout-triagem');
      const listaPontos = document.getElementById('lista-pontos-triagem');

      const selectDestino = document.getElementById('select-destino-triagem') as HTMLSelectElement;
      const selectMatricula = document.getElementById('select-matricula-triagem') as HTMLSelectElement;
      const selectBase = document.getElementById('select-base-triagem') as HTMLSelectElement;
      const btnSalvarAssociacao = document.getElementById('btn-salvar-associacao-triagem') as HTMLButtonElement;

      const atualizarBotaoImportar = () => {
         if (btnSalvarAssociacao) {
            const temPontos = pontosProcessadosTriagem.length > 0;
            const temDestino = selectDestino && selectDestino.value !== '';
            btnSalvarAssociacao.disabled = !(temPontos && temDestino);
         }
      };

      // Mudança de arquivo, fuso ou inversão N/E torna a prévia obsoleta: exige novo processamento
      // antes de liberar a importação (evita importar algo diferente do que está no mapa)
      const invalidarPreviaTriagem = () => {
         pontosProcessadosTriagem = [];
         if (countPontos) countPontos.innerText = '0';
         if (tagLayout) tagLayout.classList.add('hidden');
         if (listaPontos) listaPontos.innerHTML = '<div class="text-white/20 italic text-center py-4">Clique em Processar para analisar</div>';
         limparMapaTriagem();
         document.getElementById('placeholder-mapa-triagem')?.classList.remove('hidden');
         atualizarBotaoImportar();
      };

      const selecionarArquivosTriagem = (arquivos: FileList) => {
         const txtFiles = Array.from(arquivos).filter(f => f.name.toLowerCase().endsWith('.txt'));
         if (txtFiles.length === 0) {
            showToast('Apenas arquivos de extensão .txt são permitidos na triagem.', 'error');
            return;
         }
         arquivosSelecionadosTriagem = txtFiles;
         if (labelUpload) {
            labelUpload.innerText = txtFiles.length === 1
               ? `Selecionado: ${txtFiles[0].name}`
               : `${txtFiles.length} arquivos selecionados: ${txtFiles.map(f => f.name).join(', ')}`;
         }
         if (iconUpload) iconUpload.setAttribute('class', 'w-6 h-6 text-mint-vibrant mx-auto mb-1');
         invalidarPreviaTriagem();
      };

      // Abrir Modal de Triagem
      btnTriagem?.addEventListener('click', () => {
         modalTriagem?.classList.remove('hidden');

         // Inicializa o mapa só depois que o modal está visível, para o Leaflet medir o container corretamente
         setTimeout(initMapaTriagem, 100);

         // Preencher o select de levantamento destino com levantamentos ativos
         if (selectDestino) {
            selectDestino.innerHTML = '<option value="">Selecione o levantamento de destino...</option>' +
               levantamentosList
                  .filter(l => l.status === 'EM_ANDAMENTO')
                  .map(l => `<option value="${l.id}">${escapeHtml(l.nome_propriedade)} (${escapeHtml(l.municipio)}/${escapeHtml(l.uf)})</option>`)
                  .join('');
         }

         // Resetar selects dependentes
         if (selectMatricula) {
            selectMatricula.innerHTML = '<option value="">Selecione o levantamento...</option>';
            selectMatricula.disabled = true;
         }
         if (selectBase) {
            selectBase.innerHTML = '<option value="">Selecione o levantamento...</option>';
            selectBase.disabled = true;
         }
         if (btnSalvarAssociacao) {
            btnSalvarAssociacao.disabled = true;
         }
      });

      // Fechar modal
      btnFecharTriagem?.addEventListener('click', () => {
         modalTriagem?.classList.add('hidden');
         limparMapaTriagem();
         if (mapaTriagem) {
            mapaTriagem.remove();
            mapaTriagem = null;
         }
         // Resetar estado
         arquivosSelecionadosTriagem = [];
         pontosProcessadosTriagem = [];
         // Sem isso, escolher o mesmo arquivo ao reabrir não dispara 'change'
         if (inputFile) inputFile.value = '';
         if (labelUpload) labelUpload.innerText = 'Arraste ou clique para selecionar arquivos .txt';
         if (iconUpload) iconUpload.setAttribute('class', 'w-6 h-6 text-white/20 mx-auto mb-1');
         if (countPontos) countPontos.innerText = '0';
         if (tagLayout) tagLayout.classList.add('hidden');
         if (listaPontos) listaPontos.innerHTML = '<div class="text-white/20 italic text-center py-4">Nenhum arquivo carregado</div>';
         const placeholder = document.getElementById('placeholder-mapa-triagem');
         if (placeholder) placeholder.classList.remove('hidden');
      });

      // Drag and Drop
      dropZone?.addEventListener('click', () => inputFile?.click());
      dropZone?.addEventListener('dragover', (e) => {
         e.preventDefault();
         dropZone.classList.add('border-mint-vibrant/60', 'bg-mint-vibrant/5');
      });
      dropZone?.addEventListener('dragleave', () => {
         dropZone.classList.remove('border-mint-vibrant/60', 'bg-mint-vibrant/5');
      });
      dropZone?.addEventListener('drop', (e) => {
         e.preventDefault();
         dropZone.classList.remove('border-mint-vibrant/60', 'bg-mint-vibrant/5');

         if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
            selecionarArquivosTriagem(e.dataTransfer.files);
         }
      });

      inputFile?.addEventListener('change', () => {
         if (inputFile.files && inputFile.files.length > 0) {
            selecionarArquivosTriagem(inputFile.files);
         }
         // Permite selecionar de novo o mesmo arquivo (ex.: após corrigi-lo no disco)
         inputFile.value = '';
      });

      // O fuso e a inversão N/E também são usados na importação: alterá-los exige reprocessar
      selectFuso?.addEventListener('change', () => {
         if (pontosProcessadosTriagem.length > 0) invalidarPreviaTriagem();
      });
      chkInverterNE?.addEventListener('change', () => {
         if (pontosProcessadosTriagem.length > 0) invalidarPreviaTriagem();
      });

      // Enviar arquivos para processamento temporário em lote
      btnProcessar?.addEventListener('click', async () => {
         if (arquivosSelecionadosTriagem.length === 0) {
            showToast('Por favor, selecione ou arraste um ou mais arquivos de pontos (.txt) primeiro.', 'error');
            return;
         }

         const fuso = selectFuso.value;
         const inverterNE = chkInverterNE?.checked ? 'true' : 'false';

         try {
            btnProcessar.innerHTML = `<i class="animate-spin mr-1">🔄</i> Analisando (${arquivosSelecionadosTriagem.length})...`;
            (btnProcessar as HTMLButtonElement).disabled = true;

            let todosPontos: any[] = [];
            let layoutsDetectados: Set<string> = new Set();

            for (let i = 0; i < arquivosSelecionadosTriagem.length; i++) {
               const file = arquivosSelecionadosTriagem[i];
               const formData = new FormData();
               formData.append('file', file);
               formData.append('fuso_utm', fuso);
               formData.append('inverter_ne', inverterNE);

               const res = await fetch(`${API_BASE}/pontos/analisar-txt`, {
                  method: 'POST',
                  body: formData
               });

               const data = await res.json().catch(() => ({}));
               if (!res.ok) {
                  throw new Error(extrairMensagemErro(data, `Erro ao processar arquivo ${file.name}.`));
               }
               if (data.error) {
                  throw new Error(`Erro em ${file.name}: ${data.error}`);
               }

               const pts = data.pontos || [];
               todosPontos.push(...pts);
               if (data.layout_detectado) {
                  layoutsDetectados.add(data.layout_detectado);
               }
            }

            pontosProcessadosTriagem = todosPontos;
            const layoutDetectado = Array.from(layoutsDetectados).join(' + ') || 'DESCONHECIDO';

            if (countPontos) countPontos.innerText = pontosProcessadosTriagem.length.toString();
            if (tagLayout) {
               tagLayout.innerText = layoutDetectado;
               tagLayout.classList.remove('hidden');
            }

            // Renderizar na lista do painel
            if (listaPontos) {
               if (pontosProcessadosTriagem.length === 0) {
                  listaPontos.innerHTML = '<div class="text-white/20 italic text-center py-4">Nenhum ponto válido processado</div>';
               } else {
                  listaPontos.innerHTML = pontosProcessadosTriagem.map((p) => `
                     <div class="py-1 px-1 flex justify-between items-center hover:bg-white/5 transition-colors">
                        <span class="font-bold text-white">${escapeHtml(p.nome)}</span>
                        <span class="text-white/40 text-[9px]">N: ${p.norte.toFixed(1)} E: ${p.este.toFixed(1)}</span>
                     </div>
                  `).join('');
               }
            }

            // Plotar no Mapa
            plotarPontosNoMapaTriagem(pontosProcessadosTriagem);

            // Ativa o botão de associação se já houver levantamento destino
            atualizarBotaoImportar();

         } catch (err: any) {
            console.error(err);
            alert(`Falha no processamento: ${err.message}`);
         } finally {
            if (btnProcessar) {
               btnProcessar.innerHTML = '<i data-lucide="play" class="w-3 h-3"></i> Processar';
               (btnProcessar as HTMLButtonElement).disabled = false;
               initIcons();
            }
         }
      });

      // Monitorar troca do Levantamento Destino
      selectDestino?.addEventListener('change', async () => {
         const levId = selectDestino.value;
         if (!levId) {
            if (selectMatricula) {
               selectMatricula.innerHTML = '<option value="">Selecione o levantamento...</option>';
               selectMatricula.disabled = true;
            }
            if (selectBase) {
               selectBase.innerHTML = '<option value="">Selecione o levantamento...</option>';
               selectBase.disabled = true;
            }
            atualizarBotaoImportar();
            return;
         }

         try {
            // 1. Carregar Matrículas
            if (selectMatricula) {
               selectMatricula.innerHTML = '<option value="">Carregando...</option>';
            }
            const resMat = await fetch(`${API_BASE}/levantamentos/${levId}/matriculas`);
            if (!resMat.ok) throw new Error(`Matrículas: HTTP ${resMat.status}`);
            const matriculas = await resMat.json();
            if (selectMatricula) {
               if (matriculas.length === 0) {
                  selectMatricula.innerHTML = '<option value="">Sem matrículas vinculadas</option>';
                  selectMatricula.disabled = true;
               } else {
                  // area_ha é opcional no cadastro da matrícula
                  const formatarArea = (area: any) => area != null && !isNaN(Number(area)) ? `${Number(area).toFixed(2)} Ha` : 'área N/I';
                  selectMatricula.innerHTML = '<option value="">[Geral - Sem Matrícula]</option>' +
                     matriculas.map((m: any) => `<option value="${m.id}">Matrícula: ${escapeHtml(m.numero_matricula)} (${formatarArea(m.area_ha)})</option>`).join('');
                  selectMatricula.disabled = false;
               }
            }

            // 2. Carregar Bases de Campo do Levantamento
            if (selectBase) {
               selectBase.innerHTML = '<option value="">Carregando...</option>';
            }
            const resPts = await fetch(`${API_BASE}/levantamentos/${levId}/pontos`);
            if (!resPts.ok) throw new Error(`Pontos: HTTP ${resPts.status}`);
            const pontos = await resPts.json();
            if (selectBase) {
               // Base é o tipo B; um M só entra se já for base de rovers (legado de quando M era "Base PPP")
               const idsBase = new Set(pontos.map((p: any) => p.ponto_base_id).filter(Boolean));
               const bases = pontos.filter((p: any) => p.tipo_ponto === 'B' || idsBase.has(p.id) || p.nome_vertice.toUpperCase().includes('BASE'));
               if (bases.length === 0) {
                  selectBase.innerHTML = '<option value="">[Sem Bases]</option>';
                  selectBase.disabled = true;
               } else {
                  selectBase.innerHTML = '<option value="">[Nenhuma Base / Autodetectar]</option>' +
                     bases.map((p: any) => `<option value="${p.id}">Base: ${escapeHtml(p.nome_vertice)}</option>`).join('');
                  selectBase.disabled = false;
               }
            }

            atualizarBotaoImportar();

         } catch (e) {
            console.error("Erro ao carregar dados do levantamento destino:", e);
            if (selectMatricula) selectMatricula.innerHTML = '<option value="">Erro ao carregar</option>';
            if (selectBase) selectBase.innerHTML = '<option value="">Erro ao carregar</option>';
         }
      });

      // Confirmar Associação e Importar Oficialmente no Levantamento de Destino
      btnSalvarAssociacao?.addEventListener('click', async () => {
         const levId = selectDestino.value;
         if (!levId || arquivosSelecionadosTriagem.length === 0) return;

         const totalArquivos = arquivosSelecionadosTriagem.length;
         const msgConfirm = totalArquivos === 1
            ? 'Confirmar importação oficial deste arquivo no levantamento selecionado? Os segmentos e polilinha perimetral correspondentes serão recalculados no destino.'
            : `Confirmar importação oficial dos ${totalArquivos} arquivos no levantamento selecionado? Eles serão unidos num único caminhamento, na ordem em que foram selecionados, e importados juntos: se um falhar, nenhum é importado.`;

         if (!confirm(msgConfirm)) {
            return;
         }

         try {
            btnSalvarAssociacao.disabled = true;
            btnSalvarAssociacao.innerHTML = `<i class="animate-spin mr-1">🔄</i> Importando (${totalArquivos} arquivo(s))...`;

            // Todos os arquivos vão numa única requisição: o backend grava tudo numa só transação
            // e gera uma única divisa de fechamento para o conjunto
            const formData = new FormData();
            arquivosSelecionadosTriagem.forEach(file => formData.append('arquivos', file));
            formData.append('inverter_ne', chkInverterNE?.checked ? 'true' : 'false');
            // Mesmo fuso usado na prévia: as coordenadas do arquivo são interpretadas nele
            formData.append('fuso_utm', selectFuso.value);

            const matriculaVal = selectMatricula.value;
            if (matriculaVal) {
               formData.append('matricula_id', matriculaVal);
            }

            const baseVal = selectBase.value;
            if (baseVal && !selectBase.disabled) {
               formData.append('base_escolhida_id', baseVal);
            }

            const res = await fetch(`${API_BASE}/levantamentos/${levId}/importar-txt`, {
               method: 'POST',
               body: formData
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error) {
               throw new Error(extrairMensagemErro(data, `Erro na importação (HTTP ${res.status}).`));
            }

            showToast(`${totalArquivos} arquivo(s) importado(s) com sucesso no levantamento de destino!`, 'success');

            // Fechar modal de triagem
            btnFecharTriagem?.click();

            // Recarregar lista de levantamentos na tela principal
            loadLevantamentos();

         } catch (e: any) {
            console.error(e);
            alert(`Falha ao importar no levantamento: ${e.message}`);
         } finally {
            if (btnSalvarAssociacao) {
               btnSalvarAssociacao.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5"></i> Confirmar e Importar';
               btnSalvarAssociacao.disabled = false;
               initIcons();
            }
         }
      });

      loadLevantamentos();
      configurarComboboxPropriedades();
      loadProfissionais();
   },
   cleanup: () => {
      if (atalhoBuscaLev) {
         document.removeEventListener('keydown', atalhoBuscaLev);
         atalhoBuscaLev = null;
      }
      if (mapaTriagem) {
         mapaTriagem.remove();
         mapaTriagem = null;
      }
      if (clickOutsideHandler) {
         document.removeEventListener('click', clickOutsideHandler);
         clickOutsideHandler = null;
      }
   }
};
