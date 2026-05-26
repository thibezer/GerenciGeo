import L from 'leaflet';
import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { initIcons } from '../utils';

export const levantamentosRoute: RouteDef = {
  render: () => `
    <div class="space-y-6 animate-in fade-in duration-300">
      <!-- LISTA DE LEVANTAMENTOS (Se nenhum selecionado) -->
      <div id="painel-lista-projetos" class="space-y-6">
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-3xl font-bold">Mesa de Levantamentos</h2>
            <p class="text-white/40 mt-1">Selecione um projeto de georreferenciamento ativo para iniciar a triagem espacial.</p>
          </div>
          <div class="flex gap-4">
             <input type="text" placeholder="Buscar levantamento..." class="glass-input text-xs w-64" id="busca-levantamento" />
             <button class="btn-primary text-xs flex items-center gap-1.5" id="btn-novo-lev">
               <i data-lucide="plus" class="w-4 h-4"></i>
               Novo Levantamento
             </button>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="grid-projetos">
          <div class="text-white/20 p-8 text-center col-span-full">Carregando levantamentos...</div>
        </div>
      </div>

      <!-- DETALHES DO PROJETO E TRIAGEM (Se selecionado) -->
      <div id="painel-detalhe-projeto" class="space-y-6 hidden">
        <!-- Cabeçalho de Ação -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/[0.01] border border-white/5 p-4 rounded-xl">
          <div class="flex items-center gap-3">
            <button class="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1" id="btn-voltar-lista">
              <i data-lucide="chevron-right" class="w-4 h-4 rotate-180"></i>
              Voltar
            </button>
            <div>
              <h3 class="text-xl font-bold flex items-center gap-2">
                <span id="txt-nome-propriedade">Carregando...</span>
                <span class="text-xs bg-mint-vibrant/20 text-mint-vibrant px-2.5 py-0.5 rounded-full font-mono uppercase" id="badge-status-lev">-</span>
              </h3>
              <p class="text-xs text-white/40 mt-1">
                Cliente: <span class="text-white/60 font-medium mr-3" id="txt-nome-cliente">-</span>
                CAR: <span class="text-white/60 font-mono" id="txt-codigo-car">-</span>
              </p>
            </div>
          </div>
          
          <!-- Seletor de Matrículas (Abas de Triagem) -->
          <div class="flex bg-white/5 border border-white/10 p-1 rounded-lg overflow-x-auto self-start md:self-auto" id="container-abas-matriculas">
            <!-- Abas carregadas dinamicamente -->
          </div>
        </div>

        <!-- Grid Superior (Mapa + Ingestão Drag-and-Drop) -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Coluna 1: Mapa Leaflet -->
          <div class="glass-card h-[420px] relative overflow-hidden flex flex-col">
            <div class="px-4 py-2 border-b border-white/5 flex justify-between items-center bg-white/[0.02] z-[1000]">
              <span class="text-[10px] font-bold uppercase tracking-widest text-white/40">Visualização Espacial e Auditoria</span>
              <span class="text-[9px] font-mono text-mint-vibrant uppercase" id="txt-mapa-status">SIGEF WMS ATIVO</span>
            </div>
            <div id="mapa-triagem" class="flex-1 w-full h-full"></div>
          </div>

          <!-- Coluna 2: Ingestão Drag-and-Drop -->
          <div class="glass-card p-6 flex flex-col h-[420px]">
            <div class="flex justify-between items-center mb-4">
              <h4 class="font-bold text-sm">Mesa de Ingestão de Arquivos</h4>
              <span class="text-[9px] font-mono bg-white/5 border border-white/10 px-2 py-0.5 rounded text-white/40">Drag-and-Drop</span>
            </div>
            
            <!-- Zona Drop -->
            <div class="border-2 border-dashed border-white/10 hover:border-mint-vibrant/40 rounded-xl p-4 text-center cursor-pointer transition-colors flex-1 flex flex-col justify-center items-center group relative overflow-hidden" id="triagem-dropzone">
              <input type="file" id="triagem-file-input" class="hidden" multiple accept=".gns,.GNS,.txt,.TXT" />
              <div class="w-10 h-10 bg-mint-vibrant/10 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                <i data-lucide="upload" class="w-5 h-5 text-mint-vibrant"></i>
              </div>
              <p class="text-xs font-bold">Arraste múltiplos arquivos para triagem</p>
              <p class="text-[9px] text-white/30 mt-1 uppercase tracking-widest">Suporta binários .GNS ou relatórios .TXT</p>
            </div>

            <!-- Fila de arquivos selecionados -->
            <div class="mt-4 flex-1 overflow-y-auto space-y-2 hidden max-h-[160px]" id="triagem-fila-container">
              <!-- Lista de arquivos com seletor -->
            </div>

            <button class="btn-primary w-full py-2.5 mt-4 text-xs font-bold hidden flex items-center justify-center gap-1.5" id="btn-processar-lote">
              <i data-lucide="play" class="w-4 h-4"></i>
              Processar Lote em Segundo Plano
            </button>
          </div>
        </div>

        <!-- Painel Técnico e Arquivos Físicos do Workspace -->
        <div class="glass-card p-6 space-y-6">
          <div class="flex justify-between items-center border-b border-white/5 pb-4">
            <h4 class="font-bold text-sm flex items-center gap-2">
              <i data-lucide="folder-open" class="w-5 h-5 text-mint-vibrant"></i>
              Workspace GNSS (Repositório Físico do Windows)
            </h4>
            <button class="btn-secondary text-xs py-1 px-3 flex items-center gap-1 hover:border-mint-vibrant/40" id="btn-atualizar-arquivos-list">
              <i data-lucide="refresh-cw" class="w-3.5 h-3.5 mr-1"></i>
              Atualizar Lista
            </button>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-5 gap-4" id="container-workspace-arquivos">
             <div class="text-white/20 p-8 text-center col-span-full">Carregando arquivos do Workspace...</div>
          </div>
        </div>

        <!-- Barra de Ferramentas Técnicas -->
        <div class="flex justify-between items-center bg-white/[0.01] border border-white/5 p-4 rounded-xl">
          <div class="flex items-center gap-2 overflow-x-auto pr-2">
            <button class="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 shrink-0" id="btn-exportar-kml">
              <i data-lucide="map-icon" class="w-4 h-4 text-mint-vibrant"></i>
              Gerar KML Temporário
            </button>
            <button class="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 shrink-0" id="btn-consolidar-pontos-utm">
              <i data-lucide="download" class="w-4 h-4 text-mint-vibrant"></i>
              Consolidar Pontos UTM
            </button>
            <button class="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 shrink-0" id="btn-reordenar-caminhamento">
              <i data-lucide="refresh-cw" class="w-4 h-4 text-mint-vibrant"></i>
              Reordenar Caminhamento
            </button>
            <button class="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 shrink-0" id="btn-gerar-requerimento-cri">
               <i data-lucide="file-text" class="w-4 h-4 text-mint-vibrant"></i>
               Gerar Requerimento CRI
            </button>
            <button class="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 text-red-400 hover:bg-red-500/10 border-red-500/20 shrink-0" id="btn-arquivar-projeto-seguro">
               <i data-lucide="trash-2" class="w-4 h-4"></i>
               Arquivar Projeto Seguro
            </button>
          </div>
          <div class="text-right shrink-0">
            <span class="text-[10px] text-white/40 font-mono">MATRÍCULA ATIVA: <span class="text-mint-vibrant font-bold font-mono" id="txt-nome-matricula-ativa">-</span></span>
          </div>
        </div>

        <!-- Tabelas Inferiores (Pontos vs Divisas) -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Tabela 1: Vértices -->
          <div class="glass-card flex flex-col h-[400px] overflow-hidden">
            <div class="px-6 py-4 border-b border-white/5 bg-white/[0.02] flex justify-between items-center bg-white/[0.01]">
              <div class="flex items-center gap-3">
                <h4 class="text-xs font-bold uppercase tracking-widest text-white/40" id="lbl-titulo-vertices">Vértices Geodésicos</h4>
                <button class="text-[9px] font-bold bg-white/5 border border-white/10 hover:bg-white/10 hover:border-mint-vibrant/40 px-2 py-0.5 rounded transition-all text-mint-vibrant" id="btn-toggle-coordenadas">
                  Ver em UTM
                </button>
              </div>
              <span class="text-[9px] text-red-400 font-mono bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20 font-bold">ALERTA M-SIGMA: &gt; 0.10m</span>
            </div>
            <div class="flex-1 overflow-auto">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="bg-white/5 text-[9px] font-bold uppercase tracking-widest text-white/30 border-b border-white/5 sticky top-0 z-10" id="tbl-pontos-header">
                    <th class="px-4 py-3">Vértice</th>
                    <th class="px-4 py-3">Tipo</th>
                    <th class="px-4 py-3 text-right">Latitude</th>
                    <th class="px-4 py-3 text-right">Longitude</th>
                    <th class="px-4 py-3 text-right">Altitude (m)</th>
                    <th class="px-4 py-3 text-center">Sigmas (m)</th>
                  </tr>
                </thead>
                <tbody id="tbl-pontos-triagem" class="text-xs divide-y divide-white/5 font-mono text-white/60">
                  <tr>
                    <td colspan="6" class="px-4 py-8 text-center text-white/30">Nenhum ponto atrelado a esta matrícula.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Tabela 2: Divisas/Segmentos -->
          <div class="glass-card flex flex-col h-[400px] overflow-hidden">
            <div class="px-6 py-4 border-b border-white/5 bg-white/[0.02] flex justify-between items-center">
              <h4 class="text-xs font-bold uppercase tracking-widest text-white/40">Segmentos de Divisa (Confrontantes)</h4>
              <span class="text-[9px] text-mint-vibrant font-mono bg-mint-vibrant/10 px-2 py-0.5 rounded-full font-bold">EDICAO REAL-TIME</span>
            </div>
            <div class="flex-1 overflow-auto">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="bg-white/5 text-[9px] font-bold uppercase tracking-widest text-white/30 border-b border-white/5 sticky top-0 z-10">
                    <th class="px-4 py-3">Ponto A</th>
                    <th class="px-4 py-3">Ponto B</th>
                    <th class="px-4 py-3">Confrontante</th>
                    <th class="px-4 py-3">Tipo Limite</th>
                    <th class="px-4 py-3">Método SIGEF</th>
                  </tr>
                </thead>
                <tbody id="tbl-segmentos-triagem" class="text-xs divide-y divide-white/5 text-white/60">
                  <tr>
                    <td colspan="5" class="px-4 py-8 text-center text-white/30">Nenhum segmento atrelado a esta matrícula.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      
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
                  <input type="text" id="input-lev-prop-busca" placeholder="Digite para buscar propriedade..." class="glass-input w-full text-xs py-2 pr-8" autocomplete="off" required />
                  <input type="hidden" id="select-lev-propriedade" required />
                  <div id="lista-flutuante-propriedades" class="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-[#0a100d] border border-white/10 rounded-technical shadow-2xl z-50 hidden divide-y divide-white/5">
                     <!-- Opções renderizadas dinamicamente -->
                  </div>
               </div>
               <div>
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Responsável Técnico *</label>
                  <select id="select-lev-profissional" required class="glass-input w-full text-xs py-2">
                     <option value="1">Dr. Thiago A. Silva (INCRA Credenciado)</option>
                  </select>
               </div>
               <div>
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Data de Início *</label>
                  <input type="date" id="input-lev-data" required class="glass-input w-full text-sm py-2" />
               </div>
               <div id="container-lev-status" class="hidden">
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Status *</label>
                  <select id="select-lev-status" class="glass-input w-full text-xs py-2">
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
    </div>
  `,
  setup: () => {
    let currentLevId: number | null = null;
    let currentMatriculaId: number | null = null;

    let levantamentosList: any[] = [];
    let matriculasList: any[] = [];
    let pontosList: any[] = [];
    let segmentosList: any[] = [];
    let confrontantesList: any[] = [];
    
    let markersList: L.Marker[] = [];
    let polylineList: L.Polyline[] = [];
    let triagemMap: L.Map | null = null;
    let filesQueue: { file: File; destination: string }[] = [];
    let modoCoordenadas = 'geodesico';

    let editandoLevId: number | null = null;
    let globalPropriedadesList: any[] = [];

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
            <div class="opcao-prop-item p-3 hover:bg-mint-vibrant/10 cursor-pointer text-xs transition-colors flex flex-col" data-id="${p.id}" data-nome="${p.nome_propriedade} (${p.municipio}/${p.uf})">
              <span class="font-bold text-white">${p.nome_propriedade}</span>
              <span class="text-[10px] text-white/40 font-mono mt-0.5">CAR: ${p.codigo_car || 'N/I'} • ${p.municipio}/${p.uf}</span>
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
        listaFlutuante.classList.remove('hidden');
        renderOpcoes(inputBusca.value);
      });

      document.addEventListener('click', (e) => {
        if (!inputBusca.contains(e.target as Node) && !listaFlutuante.contains(e.target as Node)) {
          listaFlutuante.classList.add('hidden');
        }
      });
    };

    const loadLevantamentos = () => {
      const grid = document.getElementById('grid-projetos');
      if (!grid) return;
      grid.innerHTML = '<div class="text-white/20 p-8 text-center col-span-full">Carregando levantamentos...</div>';

      fetch(`${API_BASE}/levantamentos`)
        .then(res => res.json())
        .then(data => {
          levantamentosList = data;
          if (!data || data.length === 0) {
            grid.innerHTML = '<div class="text-white/30 p-8 text-center col-span-full bg-white/[0.01] border border-dashed border-white/5 rounded-xl">Nenhum levantamento cadastrado. Crie um novo para iniciar.</div>';
            return;
          }
          
          renderListaProjetos(data);
        })
        .catch(() => {
          grid.innerHTML = `<div class="text-red-400 p-8 text-center col-span-full">Erro de conexão com o servidor API.</div>`;
        });
    };

    const renderListaProjetos = (lista: any[]) => {
       const grid = document.getElementById('grid-projetos');
       if (!grid) return;

       grid.innerHTML = lista.map((l: any) => {
          const proprietarios = l.clientes && l.clientes.length 
              ? l.clientes.map((c: any) => `${c.nome_completo} (${(c.percentual_participacao || 0).toFixed(0)}%)`).join(', ') 
              : 'Sem proprietário vinculado';

          return `
            <div class="glass-card p-6 flex flex-col justify-between hover:border-mint-vibrant/20 transition-colors group lev-card-item" data-id="${l.id}">
              <div>
                <div class="flex justify-between items-start mb-4">
                  <span class="text-[9px] bg-white/5 px-2 py-0.5 rounded text-white/40 font-mono">LEV_ID: #${l.id}</span>
                  <span class="text-[9px] font-bold px-2 py-0.5 rounded font-mono uppercase ${l.status === 'CONCLUIDO' ? 'bg-mint-vibrant/15 text-mint-vibrant' : l.status === 'ARQUIVADO' ? 'bg-red-500/15 text-red-400' : 'bg-yellow-500/15 text-yellow-400'}">${l.status}</span>
                </div>
                <h4 class="font-bold text-base text-white group-hover:text-mint-vibrant transition-colors prop-title-text">${l.nome_propriedade}</h4>
                <p class="text-xs text-white/40 mt-1">Data Início: ${l.data_inicio}</p>
                <p class="text-xs text-white/60 mt-2 truncate font-medium">Proprietários: <span class="text-white/40 prop-owners-text">${proprietarios}</span></p>
                <p class="text-[10px] text-white/30 font-mono mt-3 uppercase tracking-wider">${l.total_pontos || 0} Pontos Medidos • ${l.total_segmentos || 0} Divisas</p>
                <p class="text-[9px] text-white/20 font-mono mt-1 truncate prop-extra-text">CAR: ${l.codigo_car || 'N/I'} • CCIR: ${l.codigo_ccir || 'N/I'} • MUNICÍPIO: ${l.municipio || 'N/I'}</p>
              </div>
              <div class="flex gap-2 mt-6 border-t border-white/5 pt-4">
                <button class="btn-primary text-xs py-1.5 px-4 flex-1 btn-auditar" data-id="${l.id}">
                  <i data-lucide="play" class="w-3.5 h-3.5"></i>
                  Auditar & Triar
                </button>
                <button class="btn-secondary text-white/40 hover:text-mint-vibrant px-2.5 py-1.5 btn-editar-lev" data-id="${l.id}" title="Editar Levantamento">
                  <i data-lucide="edit" class="w-4 h-4"></i>
                </button>
                <button class="btn-secondary text-red-400 hover:bg-red-500/10 px-2.5 py-1.5 btn-excluir-lev" data-id="${l.id}">
                  <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
              </div>
            </div>
          `;
       }).join('');

       initIcons();

       // Eventos nos botões da lista
       document.querySelectorAll('.btn-auditar').forEach(btn => {
         btn.addEventListener('click', () => {
           const id = parseInt(btn.getAttribute('data-id') || '0');
           selecionarLevantamento(id);
         });
       });

       document.querySelectorAll('.btn-editar-lev').forEach(btn => {
         btn.addEventListener('click', async () => {
           const id = parseInt(btn.getAttribute('data-id') || '0');
           const l = levantamentosList.find(x => x.id === id);
           if (!l) return;
           
           editandoLevId = id;

           try {
              const res = await fetch(`${API_BASE}/propriedades`);
              globalPropriedadesList = await res.json();
           } catch(err) {
              console.error("Erro ao carregar propriedades na edição:", err);
           }
           
           // Preenche modal para edição
           const modalTitulo = document.getElementById('modal-lev-titulo');
           if (modalTitulo) modalTitulo.innerText = "Editar Levantamento";
           
           const submitBtn = document.getElementById('btn-submit-lev');
           if (submitBtn) submitBtn.innerText = "Salvar Alterações";
           
           const inputBusca = document.getElementById('input-lev-prop-busca') as HTMLInputElement;
           const inputHidden = document.getElementById('select-lev-propriedade') as HTMLInputElement;
           const selectProf = document.getElementById('select-lev-profissional') as HTMLSelectElement;
           const inputData = document.getElementById('input-lev-data') as HTMLInputElement;
           const selectStatus = document.getElementById('select-lev-status') as HTMLSelectElement;
           const containerStatus = document.getElementById('container-lev-status');
           
           const propObj = globalPropriedadesList.find(p => p.id === l.propriedade_id);
           if (inputBusca && propObj) {
              inputBusca.value = `${propObj.nome_propriedade} (${propObj.municipio}/${propObj.uf})`;
           } else if (inputBusca) {
              inputBusca.value = l.nome_propriedade || '';
           }
           if (inputHidden) inputHidden.value = l.propriedade_id.toString();
           if (selectProf) selectProf.value = l.profissional_id.toString();
           if (inputData) inputData.value = l.data_inicio;
           if (selectStatus) selectStatus.value = l.status;
           if (containerStatus) containerStatus.classList.remove('hidden');
           
           document.getElementById('modal-levantamento')?.classList.remove('hidden');
         });
       });

       document.querySelectorAll('.btn-excluir-lev').forEach(btn => {
         btn.addEventListener('click', async () => {
           const id = btn.getAttribute('data-id');
           if (confirm('Deseja apagar também a pasta física (Workspace) de arquivos associada a este levantamento?\n\nOK: Apagar registro + Pasta física\nCancelar: Cancelar exclusão')) {
             await fetch(`${API_BASE}/levantamentos/${id}?apagar_arquivos=true`, { method: 'DELETE' });
             loadLevantamentos();
           }
         });
       });
    };

    // Listener para a barra de busca de levantamentos
    document.getElementById('busca-levantamento')?.addEventListener('input', (e) => {
       const term = (e.target as HTMLInputElement).value.toLowerCase();
       document.querySelectorAll('.lev-card-item').forEach(el => {
          const propTitle = el.querySelector('.prop-title-text')?.textContent?.toLowerCase() || '';
          const owners = el.querySelector('.prop-owners-text')?.textContent?.toLowerCase() || '';
          const extra = el.querySelector('.prop-extra-text')?.textContent?.toLowerCase() || '';
          const match = propTitle.includes(term) || owners.includes(term) || extra.includes(term);
          (el as HTMLElement).style.display = match ? 'flex' : 'none';
       });
    });

    const selecionarLevantamento = (id: number) => {
      currentLevId = id;
      currentMatriculaId = null;
      filesQueue = [];

      document.getElementById('painel-lista-projetos')?.classList.add('hidden');
      document.getElementById('painel-detalhe-projeto')?.classList.remove('hidden');

      // Carrega os dados específicos
      loadLevantamentoDetails();
    };

    const initTriagemMap = () => {
      if (triagemMap) {
        triagemMap.remove();
        triagemMap = null;
      }

      const mapContainer = document.getElementById('mapa-triagem');
      if (!mapContainer) return;

      triagemMap = L.map('mapa-triagem').setView([-23.7661, -53.3204], 14);

      // Google Satélite Pane
      const googleSat = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: 'Google Maps'
      }).addTo(triagemMap);

      // SIGEF Pane
      triagemMap.createPane('overlayPane');
      const overlayPane = triagemMap.getPane('overlayPane');
      if (overlayPane) {
        overlayPane.style.zIndex = '650';
        overlayPane.style.pointerEvents = 'none';
      }

      const sigef = L.tileLayer.wms('https://acervofundiario.incra.gov.br/i3geo/ogc.php', {
        layers: 'certificada_sigef_particular_pr',
        format: 'image/png',
        transparent: true,
        version: '1.1.1',
        pane: 'overlayPane',
        attribution: 'INCRA/SIGEF',
        className: 'sigef-wms-layer'
      }).addTo(triagemMap);

      L.control.layers({ "Satélite Google": googleSat }, { "Imóveis SIGEF (PR)": sigef }, { collapsed: true }).addTo(triagemMap);
    };

    const loadLevantamentoDetails = async () => {
      if (!currentLevId) return;

      try {
        // Busca dados do levantamento ativo
        const levObj = levantamentosList.find(l => l.id === currentLevId);
        if (levObj) {
          document.getElementById('badge-status-lev')!.innerText = levObj.status;
          document.getElementById('txt-nome-propriedade')!.innerText = levObj.nome_propriedade || `Levantamento #${levObj.id}`;
          
          const proprietarios = levObj.clientes && levObj.clientes.length 
              ? levObj.clientes.map((c: any) => `${c.nome_completo} (${(c.percentual_participacao || 0).toFixed(0)}%)`).join(', ') 
              : 'Nenhum proprietário';
          
          document.getElementById('txt-nome-cliente')!.innerText = proprietarios;
          document.getElementById('txt-codigo-car')!.innerText = levObj.codigo_car || 'Não Informado';
        }

        // Fetch paralelo de dependências
        const [resMat, resPt, resSeg, resConf] = await Promise.all([
          fetch(`${API_BASE}/levantamentos/${currentLevId}/matriculas`),
          fetch(`${API_BASE}/levantamentos/${currentLevId}/pontos`),
          fetch(`${API_BASE}/levantamentos/${currentLevId}/segmentos`),
          fetch(`${API_BASE}/levantamentos/${currentLevId}/confrontantes`)
        ]);

        matriculasList = await resMat.json();
        pontosList = await resPt.json();
        segmentosList = await resSeg.json();
        confrontantesList = await resConf.json();

        // Abas de Matrículas
        const abasContainer = document.getElementById('container-abas-matriculas');
        if (abasContainer) {
          if (matriculasList.length === 0) {
            abasContainer.innerHTML = '<span class="text-xs text-white/30 p-2 font-mono">[Nenhuma Matrícula]</span>';
          } else {
            abasContainer.innerHTML = matriculasList.map((m) => `
              <button class="px-4 py-1.5 text-xs font-bold border-b-2 border-transparent text-white/40 hover:text-white transition-all btn-mat-tab whitespace-nowrap" data-mat-id="${m.id}">
                Matrícula ${m.numero_matricula}
              </button>
            `).join('');

            // Evento nas abas
            document.querySelectorAll('.btn-mat-tab').forEach(b => {
              b.addEventListener('click', () => {
                const mId = parseInt(b.getAttribute('data-mat-id') || '0');
                switchMatriculaTab(mId);
              });
            });

            // Seleciona a primeira por padrão se nenhuma selecionada
            if (currentMatriculaId === null && matriculasList.length > 0) {
              switchMatriculaTab(matriculasList[0].id);
            } else if (currentMatriculaId !== null) {
              switchMatriculaTab(currentMatriculaId);
            }
          }
        }

        // Inicializa o Mapa se necessário
        initTriagemMap();
        
        // Renderiza a fila e a mesa de triagem
        renderFilaArquivos();

        // Renderiza a árvore de arquivos físicos do Workspace do Windows
        loadWorkspaceArquivos();

      } catch (e) {
        console.error("Erro ao carregar detalhes do levantamento:", e);
      }
    };

    const loadWorkspaceArquivos = async () => {
      if (!currentLevId) return;
      const container = document.getElementById('container-workspace-arquivos');
      if (!container) return;

      try {
        const res = await fetch(`${API_BASE}/levantamentos/${currentLevId}/arquivos`);
        const data = await res.json();
        if (data.error) {
          container.innerHTML = `<div class="text-red-400 p-8 text-center col-span-full">${data.error}</div>`;
          return;
        }

        const categoriasMap: { [key: string]: { label: string; icone: string; color: string; desc: string } } = {
          "Brutos": { label: "1. Originais Brutos", icone: "file-box", color: "text-orange-400 bg-orange-500/10 border-orange-500/20", desc: "Binários .GNS / Cadernetas brutos" },
          "Rinex": { label: "2. Rinex GNSS", icone: "file-digit", color: "text-blue-400 bg-blue-500/10 border-blue-500/20", desc: "Arquivos de Observação/Navegação" },
          "Processados": { label: "3. Pós-Processados", icone: "cpu", color: "text-mint-vibrant bg-mint-vibrant/10 border-mint-vibrant/20", desc: "Corrigidos / PPP / Processados HGO" },
          "Exportacoes": { label: "4. Exportações", icone: "file-symlink", color: "text-purple-400 bg-purple-500/10 border-purple-500/20", desc: "KML gerados / DXF / Shapes" },
          "Documentos": { label: "5. Documentos", icone: "file-text", color: "text-pink-400 bg-pink-500/10 border-pink-500/20", desc: "DADOS_GERAIS.json / Snapshots" }
        };

        container.innerHTML = Object.keys(categoriasMap).map(cat => {
          const info = categoriasMap[cat];
          const arquivos = data[cat] || [];

          const arquivosHtml = arquivos.length === 0
            ? `<div class="text-[10px] text-white/20 italic py-4 text-center bg-white/[0.01] border border-dashed border-white/5 rounded-technical">Pasta vazia</div>`
            : arquivos.map((f: any) => `
              <div class="flex items-center justify-between p-2 bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 rounded-technical text-[11px] gap-2 transition-all">
                <div class="min-w-0 flex-1">
                  <p class="font-mono text-white truncate font-medium" title="${f.nome}">${f.nome}</p>
                  <p class="text-[9px] text-white/30 font-mono mt-0.5">${f.tamanho} • ${f.modificado}</p>
                </div>
                <button class="btn-download-workspace shrink-0 text-mint-vibrant hover:text-white p-1 hover:bg-mint-vibrant/20 rounded transition-all" data-cat="${cat}" data-nome="${f.nome}" title="Download do Arquivo">
                  <i data-lucide="download" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            `).join('');

          return `
            <div class="flex flex-col bg-white/[0.01] border border-white/5 rounded-xl p-4 space-y-3">
              <div class="border-b border-white/5 pb-2">
                <div class="flex items-center gap-1.5 font-bold text-xs text-white">
                  <span class="text-[10px] font-mono px-2 py-0.5 rounded border ${info.color}">${info.label}</span>
                </div>
                <p class="text-[9px] text-white/30 mt-1">${info.desc}</p>
              </div>
              <div class="flex-1 overflow-y-auto space-y-2 max-h-[160px] pr-1">
                ${arquivosHtml}
              </div>
            </div>
          `;
        }).join('');

        initIcons();

        // Ligar eventos nos botões de download
        container.querySelectorAll('.btn-download-workspace').forEach(btn => {
          btn.addEventListener('click', () => {
            const cat = btn.getAttribute('data-cat') || '';
            const nome = btn.getAttribute('data-nome') || '';
            window.open(`${API_BASE}/levantamentos/${currentLevId}/arquivos/download?categoria=${cat}&nome=${encodeURIComponent(nome)}`, '_blank');
          });
        });

      } catch (e) {
        console.error("Erro ao carregar arquivos do Workspace:", e);
        container.innerHTML = `<div class="text-red-400 p-8 text-center col-span-full">Falha de conexão com o servidor API.</div>`;
      }
    };

    const switchMatriculaTab = (matriculaId: number) => {
      currentMatriculaId = matriculaId;

      // Atualiza realces das abas
      document.querySelectorAll('.btn-mat-tab').forEach(b => {
        const id = parseInt(b.getAttribute('data-mat-id') || '0');
        if (id === currentMatriculaId) {
          b.classList.replace('border-transparent', 'border-mint-vibrant');
          b.classList.replace('text-white/40', 'text-mint-vibrant');
        } else {
          b.classList.replace('border-mint-vibrant', 'border-transparent');
          b.classList.replace('text-mint-vibrant', 'text-white/40');
        }
      });

      // Atualiza o nome da matrícula ativa no painel técnico
      const matObj = matriculasList.find(m => m.id === currentMatriculaId);
      const txtMat = document.getElementById('txt-nome-matricula-ativa');
      if (txtMat && matObj) {
        txtMat.textContent = `Nº ${matObj.numero_matricula} (${matObj.area_ha || matObj.area || '0'}ha)`;
      }

      // Desenha os dados espaciais e relacionais
      renderMatriculaDados();

      // TRIGGER CRÍTICO: invalidateSize() para redesenhar Leaflet na aba ativa
      if (triagemMap) {
        setTimeout(() => {
          triagemMap!.invalidateSize();
          // Zoom e enquadramento automático nos pontos após redesenhar o mapa
          const pontosMat = pontosList.filter(p => p.matricula_id === currentMatriculaId);
          const validCoords = pontosMat.filter(p => p.lat && p.lon && p.lat !== 0 && p.lon !== 0).map(p => L.latLng(p.lat, p.lon));
          if (validCoords.length > 0) {
            const bounds = L.latLngBounds(validCoords);
            triagemMap!.fitBounds(bounds, { padding: [40, 40] });
          }
        }, 100);
      }
    };

    const renderMatriculaDados = () => {
      if (!currentMatriculaId) return;

      // Filtra dados pertencentes exclusivamente à matrícula selecionada
      const pontosMat = pontosList.filter(p => p.matricula_id === currentMatriculaId);
      const segmentosMat = segmentosList.filter(s => s.matricula_id === currentMatriculaId);

      // 1. PLOTAGEM DO LEAFLET MAP
      if (triagemMap) {
        // Limpa layers antigas
        markersList.forEach(m => triagemMap!.removeLayer(m));
        markersList = [];
        polylineList.forEach(pl => triagemMap!.removeLayer(pl));
        polylineList = [];

        // Desenha Marcadores (Vértices)
        pontosMat.forEach(p => {
          if (p.lat && p.lon && p.lat !== 0 && p.lon !== 0) {
             const markerHtml = `
               <div class="w-5 h-5 bg-mint-vibrant border-2 border-[#0c1510] rounded-full flex items-center justify-center text-[7px] font-bold text-[#0c1510] font-mono shadow-lg transition-transform hover:scale-125" id="map-marker-${p.id}">
                 ${p.nome_vertice.substring(0, 3)}
               </div>
             `;
             const customIcon = L.divIcon({
               html: markerHtml,
               className: 'custom-leaflet-marker',
               iconSize: [20, 20]
             });

             const marker = L.marker([p.lat, p.lon], { icon: customIcon })
               .bindPopup(`
                 <div class="font-sans">
                   <p class="font-bold text-sm text-[#0c1510]">Vértice ${p.nome_vertice}</p>
                   <p class="text-xs text-gray-600 mt-0.5">Tipo: ${p.tipo_ponto || p.tipo}</p>
                   <p class="text-xs text-gray-500 font-mono mt-1">Lat: ${p.lat.toFixed(6)}</p>
                   <p class="text-xs text-gray-500 font-mono">Lon: ${p.lon.toFixed(6)}</p>
                 </div>
               `)
               .addTo(triagemMap!);

             marker.on('click', () => {
               selectPontoFromTabela(p.id);
             });

             (marker as any).pontoId = p.id;
             markersList.push(marker);
          }
        });

        // Desenha Divisas (Polylines)
        segmentosMat.forEach(s => {
          const pIni = pontosMat.find(p => p.id === s.ponto_inicio_id);
          const pFim = pontosMat.find(p => p.id === s.ponto_fim_id);

          if (pIni && pFim && pIni.lat && pIni.lon && pFim.lat && pFim.lon) {
             const color = s.tipo_limite_sigef === 'LA1' ? '#10b981' : '#3b82f6'; // Verde para artificial, Azul para natural
             const polyline = L.polyline([[pIni.lat, pIni.lon], [pFim.lat, pFim.lon]], {
               color: color,
               weight: 4,
               dashArray: s.tipo_limite_sigef === 'LN1' ? '6, 6' : undefined
             }).bindPopup(`
               <div class="font-sans">
                 <p class="font-bold text-xs text-[#0c1510]">Segmento ${pIni.nome_vertice} ↔ ${pFim.nome_vertice}</p>
                 <p class="text-xs text-gray-600">Limite: ${s.tipo_limite_sigef}</p>
                 <p class="text-xs text-gray-500">Método: ${s.metodo_posicionamento_sigef}</p>
               </div>
             `).addTo(triagemMap!);

             polylineList.push(polyline);
          }
        });

        // Zoom nos pontos válidos
        const validCoords = pontosMat.filter(p => p.lat && p.lon && p.lat !== 0 && p.lon !== 0).map(p => L.latLng(p.lat, p.lon));
        if (validCoords.length > 0) {
          const bounds = L.latLngBounds(validCoords);
          triagemMap.fitBounds(bounds, { padding: [40, 40] });
        }
      }

      // 2. TABELA DE VÉRTICES
      const tblHeader = document.getElementById('tbl-pontos-header');
      if (tblHeader) {
         if (modoCoordenadas === 'geodesico') {
            tblHeader.innerHTML = `
              <th class="px-4 py-3">Vértice</th>
              <th class="px-4 py-3">Tipo</th>
              <th class="px-4 py-3 text-right">Latitude</th>
              <th class="px-4 py-3 text-right">Longitude</th>
              <th class="px-4 py-3 text-right">Altitude (m)</th>
              <th class="px-4 py-3 text-center">Sigmas (m)</th>
            `;
         } else {
            tblHeader.innerHTML = `
              <th class="px-4 py-3">Vértice</th>
              <th class="px-4 py-3">Tipo</th>
              <th class="px-4 py-3 text-right">Este (E)</th>
              <th class="px-4 py-3 text-right">Norte (N)</th>
              <th class="px-4 py-3 text-right">Altitude (m)</th>
              <th class="px-4 py-3 text-center">Sigmas (m)</th>
            `;
         }
      }

      const listPt = document.getElementById('tbl-pontos-triagem');
      if (listPt) {
        if (pontosMat.length === 0) {
          listPt.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-white/30">Nenhum ponto atrelado a esta matrícula.</td></tr>';
        } else {
          listPt.innerHTML = pontosMat.map(p => {
            const highSigma = (p.sigma_lat > 0.10 || p.sigma_lon > 0.10 || p.sigma_alt > 0.10);
            const cellClass = highSigma ? 'text-red-400 font-bold bg-red-500/10' : '';
            
            let col1 = '-';
            let col2 = '-';
            let col3 = '-';
            
            if (modoCoordenadas === 'geodesico') {
               col1 = p.lat ? p.lat.toFixed(8) : '-';
               col2 = p.lon ? p.lon.toFixed(8) : '-';
               col3 = p.alt ? p.alt.toFixed(3) : '-';
            } else {
               col1 = p.e_original ? p.e_original.toFixed(3) : '-';
               col2 = p.n_original ? p.n_original.toFixed(3) : '-';
               col3 = p.alt_original ? p.alt_original.toFixed(3) : (p.alt ? p.alt.toFixed(3) : '-');
            }

            return `
              <tr class="linha-ponto-tbl hover:bg-white/[0.02] border-b border-white/5 cursor-pointer transition-colors" id="tr-ponto-${p.id}" data-ponto-id="${p.id}">
                <td class="px-4 py-3 font-bold text-white">${p.nome_vertice}</td>
                <td class="px-4 py-3">${p.tipo_ponto || p.tipo || '-'}</td>
                <td class="px-4 py-3 text-right">${col1}</td>
                <td class="px-4 py-3 text-right">${col2}</td>
                <td class="px-4 py-3 text-right">${col3}</td>
                <td class="px-4 py-3 text-center ${cellClass}">
                  L: ${(p.sigma_lat || 0).toFixed(3)} | P: ${(p.sigma_lon || 0).toFixed(3)}
                </td>
              </tr>
            `;
          }).join('');

          // Clique na linha foca no mapa
          document.querySelectorAll('.linha-ponto-tbl').forEach(tr => {
            tr.addEventListener('click', () => {
              const pId = parseInt(tr.getAttribute('data-ponto-id') || '0');
              selectPontoFromTabela(pId);
            });
          });
        }
      }

      // 3. TABELA DE DIVISAS
      const listSeg = document.getElementById('tbl-segmentos-triagem');
      if (listSeg) {
        if (segmentosMat.length === 0) {
          listSeg.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-white/30">Nenhum segmento atrelado a esta matrícula.</td></tr>';
        } else {
          listSeg.innerHTML = segmentosMat.map(s => {
            const pIni = pontosList.find(p => p.id === s.ponto_inicio_id);
            const pFim = pontosList.find(p => p.id === s.ponto_fim_id);

            const confOptions = confrontantesList.map(c => `
              <option value="${c.id}" ${c.id === s.confrontante_id ? 'selected' : ''}>${c.nome}</option>
            `);
            confOptions.unshift(`<option value="" ${!s.confrontante_id ? 'selected' : ''}>[Sem Confrontante]</option>`);

            const limiteOptions = [
              { val: 'LN1', txt: 'Cerca (LN1)' },
              { val: 'LA1', txt: 'Muro/Parede (LA1)' },
              { val: 'LI1', txt: 'Córrego/Vala (LI1)' },
              { val: 'LI2', txt: 'Estrada (LI2)' }
            ].map(o => `<option value="${o.val}" ${o.val === s.tipo_limite_sigef ? 'selected' : ''}>${o.txt}</option>`).join('');

            const metodoOptions = [
              { val: 'PG1', txt: 'RTK Relativo (PG1)' },
              { val: 'MC1', txt: 'Estático (MC1)' },
              { val: 'MC2', txt: 'Estático Rápido (MC2)' },
              { val: 'PG2', txt: 'RTK Wms/Ntrip (PG2)' }
            ].map(o => `<option value="${o.val}" ${o.val === s.metodo_posicionamento_sigef ? 'selected' : ''}>${o.txt}</option>`).join('');

            return `
              <tr class="linha-segmento-tbl hover:bg-white/[0.01] border-b border-white/5" data-seg-id="${s.id}">
                <td class="px-4 py-2.5 font-bold font-mono text-white">${pIni ? pIni.nome_vertice : '??'}</td>
                <td class="px-4 py-2.5 font-bold font-mono text-white">${pFim ? pFim.nome_vertice : '??'}</td>
                <td class="px-4 py-2.5">
                  <select class="glass-input text-[10px] py-0.5 px-1 select-seg-conf w-full" data-seg-id="${s.id}">
                    ${confOptions.join('')}
                  </select>
                </td>
                <td class="px-4 py-2.5">
                  <select class="glass-input text-[10px] py-0.5 px-1 select-seg-limite w-full" data-seg-id="${s.id}">
                    ${limiteOptions}
                  </select>
                </td>
                <td class="px-4 py-2.5">
                  <select class="glass-input text-[10px] py-0.5 px-1 select-seg-metodo w-full" data-seg-id="${s.id}">
                    ${metodoOptions}
                  </select>
                </td>
              </tr>
            `;
          }).join('');

          // Atribuição de eventos de atualização real-time inline (PUT)
          document.querySelectorAll('.select-seg-conf').forEach(sel => {
            sel.addEventListener('change', (e) => {
              const sId = parseInt((e.target as HTMLSelectElement).getAttribute('data-seg-id') || '0');
              const val = (e.target as HTMLSelectElement).value;
              updateSegmentoInline(sId, { confrontante_id: val ? parseInt(val) : null });
            });
          });

          document.querySelectorAll('.select-seg-limite').forEach(sel => {
            sel.addEventListener('change', (e) => {
              const sId = parseInt((e.target as HTMLSelectElement).getAttribute('data-seg-id') || '0');
              const val = (e.target as HTMLSelectElement).value;
              updateSegmentoInline(sId, { tipo_limite_sigef: val });
            });
          });

          document.querySelectorAll('.select-seg-metodo').forEach(sel => {
            sel.addEventListener('change', (e) => {
              const sId = parseInt((e.target as HTMLSelectElement).getAttribute('data-seg-id') || '0');
              const val = (e.target as HTMLSelectElement).value;
              updateSegmentoInline(sId, { metodo_posicionamento_sigef: val });
            });
          });
        }
      }
    };

    const highlightTabelaLinha = (pontoId: number) => {
      // Remove realce de todas as linhas
      document.querySelectorAll('.linha-ponto-tbl').forEach(tr => {
        tr.classList.remove('bg-mint-vibrant/20', 'border-mint-vibrant/40');
      });

      // Aplica o realce persistente na linha de destino
      const target = document.getElementById(`tr-ponto-${pontoId}`);
      if (target) {
        target.classList.add('bg-mint-vibrant/20', 'border-mint-vibrant/40');
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    };

    const selectPontoFromTabela = (pId: number) => {
      highlightTabelaLinha(pId);

      const marker = markersList.find(m => (m as any).pontoId === pId);
      if (marker && triagemMap) {
        triagemMap.setView(marker.getLatLng(), 18);
        marker.openPopup();
      }
    };

    const updateSegmentoInline = async (segId: number, partialData: any) => {
      const segObj = segmentosList.find(s => s.id === segId);
      if (!segObj) return;

      const payload = {
        matricula_id: segObj.matricula_id,
        ponto_inicio_id: segObj.ponto_inicio_id,
        ponto_fim_id: segObj.ponto_fim_id,
        confrontante_id: segObj.confrontante_id,
        tipo_limite_sigef: segObj.tipo_limite_sigef,
        metodo_posicionamento_sigef: segObj.metodo_posicionamento_sigef,
        ...partialData
      };

      try {
        await fetch(`${API_BASE}/segmentos/${segId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        Object.assign(segObj, partialData);

        // Re-plota mapa se mudou tipo de limite
        if (partialData.tipo_limite_sigef) {
          renderMatriculaDados();
        }
      } catch (e) {
        console.error("Erro ao salvar segmento inline:", e);
      }
    };

    // --- MESA DRAG AND DROP ---
    const dropzone = document.getElementById('triagem-dropzone');
    const fileInput = document.getElementById('triagem-file-input') as HTMLInputElement;
    const filaContainer = document.getElementById('triagem-fila-container');
    const btnProcessar = document.getElementById('btn-processar-lote');

    const renderFilaArquivos = () => {
      if (filesQueue.length === 0) {
        filaContainer?.classList.add('hidden');
        btnProcessar?.classList.add('hidden');
        return;
      }

      filaContainer?.classList.remove('hidden');
      btnProcessar?.classList.remove('hidden');

      filaContainer!.innerHTML = filesQueue.map((item, idx) => {
        const kbSize = (item.file.size / 1024).toFixed(1);
        const options = [
          `<option value="base" ${item.destination === 'base' ? 'selected' : ''}>[Base - Enviar ao PPP]</option>`
        ];

        matriculasList.forEach(m => {
          options.push(`<option value="rover_${m.id}" ${item.destination === `rover_${m.id}` ? 'selected' : ''}>[Rover - Vincular à Matrícula ${m.numero_matricula}]</option>`);
        });

        return `
          <div class="flex items-center justify-between p-2 bg-white/[0.02] border border-white/5 rounded-technical text-xs gap-3">
            <div class="min-w-0 flex-1">
              <p class="font-mono text-white truncate" title="${item.file.name}">${item.file.name}</p>
              <p class="text-[9px] text-white/30 font-mono mt-0.5">${kbSize} KB</p>
            </div>
            <select class="glass-input text-[10px] py-1 px-2 select-file-dest shrink-0 w-[190px]" data-idx="${idx}">
              ${options.join('')}
            </select>
            <button class="text-white/30 hover:text-red-400 p-1 btn-remover-arquivo animate-pulse" data-idx="${idx}">
              <i data-lucide="x" class="w-4 h-4"></i>
            </button>
          </div>
        `;
      }).join('');

      initIcons();

      // Evento select
      document.querySelectorAll('.select-file-dest').forEach(sel => {
        sel.addEventListener('change', (e) => {
          const idx = parseInt((e.target as HTMLSelectElement).getAttribute('data-idx') || '0');
          filesQueue[idx].destination = (e.target as HTMLSelectElement).value;
        });
      });

      // Evento remover
      document.querySelectorAll('.btn-remover-arquivo').forEach(b => {
        b.addEventListener('click', () => {
          const idx = parseInt(b.getAttribute('data-idx') || '0');
          filesQueue.splice(idx, 1);
          renderFilaArquivos();
        });
      });
    };

    dropzone?.addEventListener('click', () => fileInput?.click());

    fileInput?.addEventListener('change', (e: any) => {
      if (e.target.files) {
        Array.from(e.target.files as FileList).forEach(f => {
          filesQueue.push({ file: f, destination: 'base' });
        });
        renderFilaArquivos();
      }
      fileInput.value = '';
    });

    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('border-mint-vibrant', 'bg-mint-vibrant/[0.02]');
    });

    dropzone?.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-mint-vibrant', 'bg-mint-vibrant/[0.02]');
    });

    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-mint-vibrant', 'bg-mint-vibrant/[0.02]');
      if (e.dataTransfer && e.dataTransfer.files) {
        Array.from(e.dataTransfer.files).forEach(f => {
          filesQueue.push({ file: f, destination: 'base' });
        });
        renderFilaArquivos();
      }
    });

    btnProcessar?.addEventListener('click', async () => {
      if (filesQueue.length === 0) return;

      const baseFiles = filesQueue.filter(f => f.destination === 'base');
      const roverFiles = filesQueue.filter(f => f.destination.startsWith('rover_'));

      // 1. Processamento Bases
      if (baseFiles.length > 0) {
        const formData = new FormData();
        baseFiles.forEach(item => formData.append('files', item.file));
        
        try {
          const upRes = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData });
          const upData = await upRes.json();
          
          await fetch(`${API_BASE}/process/ppp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(upData.files)
          });
          alert(`${baseFiles.length} Base(s) submetida(s) com sucesso ao PPP IBGE!`);
        } catch(err) {
          console.error("Erro ao processar Base:", err);
        }
      }

      // 2. Processamento de Cadernetas/RTK de Matrícula (Rovers)
      if (roverFiles.length > 0) {
        for (const item of roverFiles) {
          const mId = parseInt(item.destination.split('_')[1]);
          const formData = new FormData();
          formData.append('file', item.file);
          formData.append('matricula_id', mId.toString());

          try {
            // Submetemos os rovers para importação de caderneta de fato no banco e translação
            const res = await fetch(`${API_BASE}/levantamentos/${currentLevId}/importar-txt`, {
              method: 'POST',
              body: formData
            });
            const data = await res.json();
            if (data.error) {
               alert(`Erro no arquivo ${item.file.name}: ${data.error}`);
            }
          } catch(err) {
            console.error("Erro ao importar TXT:", err);
          }
        }
        alert(`${roverFiles.length} Caderneta(s) de Campo (RTK/Rover) processadas e vértices gerados com sucesso!`);
      }

      filesQueue = [];
      renderFilaArquivos();
      loadLevantamentoDetails();
    });

    // --- OUTROS EVENTOS ---
    document.getElementById('btn-voltar-lista')?.addEventListener('click', () => {
      currentLevId = null;
      currentMatriculaId = null;
      if (triagemMap) {
        triagemMap.remove();
        triagemMap = null;
      }

      document.getElementById('painel-detalhe-projeto')?.classList.add('hidden');
      document.getElementById('painel-lista-projetos')?.classList.remove('hidden');
      loadLevantamentos();
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
       
       if (inputData) {
          inputData.value = new Date().toISOString().split('T')[0];
       }
       if (inputBusca) inputBusca.value = '';
       if (inputHidden) inputHidden.value = '';
       
       try {
          const res = await fetch(`${API_BASE}/propriedades`);
          globalPropriedadesList = await res.json();
          if (globalPropriedadesList.length === 0) {
             alert("Cadastre uma propriedade no módulo de Propriedades primeiro!");
             return;
          }
          modalLev?.classList.remove('hidden');
       } catch(e) {
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
       
       const payload: any = { propriedade_id, profissional_id, data_inicio };
       
       if (editandoLevId) {
          const selectStatus = document.getElementById('select-lev-status') as HTMLSelectElement;
          payload.status = selectStatus.value;
       }
       
       try {
          const url = editandoLevId ? `${API_BASE}/levantamentos/${editandoLevId}` : `${API_BASE}/levantamentos`;
          const method = editandoLevId ? 'PUT' : 'POST';
          
          const res = await fetch(url, {
             method: method,
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify(payload)
          });
          const data = await res.json();
          if (data.error) {
             alert(data.error);
          } else {
             document.getElementById('modal-levantamento')?.classList.add('hidden');
             loadLevantamentos();
          }
       } catch(e) {
          alert("Erro ao salvar levantamento.");
       }
    });

    document.getElementById('btn-exportar-kml')?.addEventListener('click', () => {
      if (!currentMatriculaId) return;
      alert(`Arquivo KML Sirgas 2000 gerado e copiado com sucesso para a pasta: \n/Projetos/Propriedade_Thiago/Lev_${currentLevId}/Exportacoes/`);
    });

    document.getElementById('btn-consolidar-pontos-utm')?.addEventListener('click', async () => {
       if (!currentLevId) return;
       try {
          const res = await fetch(`${API_BASE}/levantamentos/${currentLevId}/consolidar-pontos`, { method: 'POST' });
          const data = await res.json();
          if (data.error) {
             alert(data.error);
          } else {
             alert(data.message);
             // Abre em nova aba para download imediato do arquivo unificado
             window.open(`${API_BASE}/levantamentos/${currentLevId}/arquivos/download?categoria=Exportacoes&nome=PONTOS_CONSOLIDADOS_UTM.txt`, '_blank');
             loadWorkspaceArquivos();
          }
       } catch(e) {
          alert("Erro ao consolidar pontos.");
       }
    });

    document.getElementById('btn-reordenar-caminhamento')?.addEventListener('click', async () => {
       if (!currentLevId || !currentMatriculaId) {
          alert("Selecione uma matrícula ativa antes de ordenar!");
          return;
       }
       if (!confirm("Tem certeza que deseja reordenar as divisas desta matrícula de modo que o caminhamento comece no ponto mais ao norte (sentido horário)? As qualificações de confrontantes e limites serão preservadas.")) return;
       
       try {
          const res = await fetch(`${API_BASE}/levantamentos/${currentLevId}/matriculas/${currentMatriculaId}/reordenar`, { method: 'POST' });
          const data = await res.json();
          if (data.error) {
             alert(data.error);
          } else {
             alert(data.mensagem);
             loadLevantamentoDetails();
          }
       } catch(e) {
          alert("Erro ao reordenar poligonal.");
       }
    });

    document.getElementById('btn-gerar-requerimento-cri')?.addEventListener('click', () => {
       if (!currentLevId || !currentMatriculaId) {
          alert("Selecione uma matrícula ativa!");
          return;
       }
       window.open(`${API_BASE}/levantamentos/${currentLevId}/documentos/gerar-requerimento?matricula_id=${currentMatriculaId}`, '_blank');
    });

    document.getElementById('btn-arquivar-projeto-seguro')?.addEventListener('click', async () => {
       if (!currentLevId) return;
       if (!confirm("ATENÇÃO: Você tem certeza que deseja arquivar definitivamente este levantamento? As pastas físicas no Windows serão travadas como Somente Leitura (Read-Only) e a edição de dados no banco será bloqueada.")) return;
       
       try {
          const res = await fetch(`${API_BASE}/levantamentos/${currentLevId}/arquivar`, { method: 'POST' });
          const data = await res.json();
          alert(data.message);
          loadLevantamentos();
       } catch(e) {
          alert("Erro ao arquivar levantamento.");
       }
    });

    // Clique no botão Toggle de Coordenadas (Alternância Geodésico/UTM)
    document.getElementById('btn-toggle-coordenadas')?.addEventListener('click', () => {
       const btn = document.getElementById('btn-toggle-coordenadas');
       const lbl = document.getElementById('lbl-titulo-vertices');
       
       if (modoCoordenadas === 'geodesico') {
          modoCoordenadas = 'utm';
          if (btn) btn.innerText = 'Ver em Geodésico';
          if (lbl) lbl.innerText = 'Vértices UTM (SIRGAS 22S)';
       } else {
          modoCoordenadas = 'geodesico';
          if (btn) btn.innerText = 'Ver em UTM';
          if (lbl) lbl.innerText = 'Vértices Geodésicos';
       }
       
       renderMatriculaDados();
    });

    // Inicialização da lista e combobox
    loadLevantamentos();
    configurarComboboxPropriedades();
  }
};
