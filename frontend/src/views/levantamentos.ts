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

        <!-- Seletor de Etapas de Trabalho (Ajuste Fino V2.3) -->
        <div class="flex bg-white/5 border border-white/10 p-1 rounded-xl w-full" id="container-abas-etapas">
          <button class="flex-grow py-2 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab bg-mint-vibrant/20 text-mint-vibrant flex items-center justify-center gap-2" id="btn-etapa-geoprocessamento" type="button">
            <i data-lucide="cpu" class="w-4 h-4"></i>
            Etapa 1: Mesa Geodésica (Geoprocessamento)
          </button>
          <button class="flex-grow py-2 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white flex items-center justify-center gap-2" id="btn-etapa-cartorio" type="button">
            <i data-lucide="database" class="w-4 h-4"></i>
            Etapa 2: Organizador de Perímetro (Cartório)
          </button>
          <button class="flex-grow py-2 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white flex items-center justify-center gap-2" id="btn-etapa-auditoria" type="button">
            <i data-lucide="history" class="w-4 h-4"></i>
            Etapa 3: Histórico e Auditoria de Campo
          </button>
        </div>

        <!-- Grid Superior (Mapa + Ingestão Drag-and-Drop) -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6" id="grid-superior-detalhe">
          <!-- Coluna 1: Mapa Leaflet -->
          <div class="glass-card h-[420px] relative overflow-hidden flex flex-col" id="container-mapa-leaflet-parent">
            <div class="px-4 py-2 border-b border-white/5 flex justify-between items-center bg-white/[0.02] z-[1000]">
              <span class="text-[10px] font-bold uppercase tracking-widest text-white/40">Visualização Espacial e Auditoria</span>
              <span class="text-[9px] font-mono text-mint-vibrant uppercase" id="txt-mapa-status">SIGEF WMS ATIVO</span>
            </div>
            <div id="mapa-triagem" class="flex-1 w-full h-full"></div>
          </div>

          <!-- Coluna 2: Ingestão Drag-and-Drop -->
          <div class="glass-card p-6 flex flex-col h-[420px]" id="container-ingestao-arquivos">
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
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6" id="container-tabelas-inferiores">
          <!-- Tabela 1: Vértices -->
          <div class="glass-card flex flex-col h-[400px] overflow-hidden" id="container-tabela-vertices">
            <div class="px-6 py-4 border-b border-white/5 bg-white/[0.02] flex justify-between items-center bg-white/[0.01]">
              <div class="flex items-center gap-3">
                <h4 class="text-xs font-bold uppercase tracking-widest text-white/40" id="lbl-titulo-vertices">Vértices Geodésicos</h4>
                <button class="text-[9px] font-bold bg-white/5 border border-white/10 hover:bg-white/10 hover:border-mint-vibrant/40 px-2 py-0.5 rounded transition-all text-mint-vibrant" id="btn-toggle-coordenadas" type="button">
                  Ver em Geodésico
                </button>
                <button class="btn-primary text-[10px] font-bold py-1 px-3 hidden flex items-center gap-1 hover:scale-105 transition-all bg-emerald-600 border-emerald-500 hover:bg-emerald-500" id="btn-salvar-perimetro-custom" type="button">
                  <i data-lucide="play" class="w-3.5 h-3.5"></i>
                  Salvar Perímetro & Recomputar
                </button>
              </div>
              <span class="text-[9px] text-red-400 font-mono bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20 font-bold" id="lbl-alerta-sigma">ALERTA M-SIGMA: &gt; 0.10m</span>
            </div>
            <div class="flex-1 overflow-auto">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="bg-white/5 text-[9px] font-bold uppercase tracking-widest text-white/30 border-b border-white/5 sticky top-0 z-10" id="tbl-pontos-header">
                    <th class="px-4 py-3">Vértice</th>
                    <th class="px-4 py-3">Tipo</th>
                    <th class="px-4 py-3 text-right">Este (E)</th>
                    <th class="px-4 py-3 text-right">Norte (N)</th>
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

          <!-- Tabela 2: Lateral Dinâmica (Divisas ou Auditoria de Translação) -->
          <div class="glass-card flex flex-col h-[400px] overflow-hidden" id="container-tabela-divisas">
            <div class="px-6 py-4 border-b border-white/5 bg-white/[0.02] flex justify-between items-center bg-white/[0.01]">
              <h4 class="text-xs font-bold uppercase tracking-widest text-white/40" id="lbl-titulo-tabela-lateral">Segmentos de Divisa (Confrontantes)</h4>
              <span class="text-[9px] text-mint-vibrant font-mono bg-mint-vibrant/10 px-2 py-0.5 rounded-full font-bold" id="badge-tabela-lateral">EDICAO REAL-TIME</span>
            </div>
            <div class="flex-1 overflow-auto" id="container-tabela-lateral-content">
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

        <!-- Etapa 3: Histórico e Auditoria de Campo (V2.4) -->
        <div class="glass-card p-6 hidden flex flex-col space-y-6" id="container-etapa-auditoria-campo">
          <div class="flex justify-between items-center border-b border-white/5 pb-4">
            <div>
              <h4 class="font-bold text-sm flex items-center gap-2">
                <i data-lucide="history" class="w-5 h-5 text-mint-vibrant"></i>
                Linha do Tempo e Auditoria de Campo
              </h4>
              <p class="text-xs text-white/40 mt-1">Histórico completo e imutável de translações, edições, importações e exclusões no levantamento.</p>
            </div>
            <button class="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5" id="btn-atualizar-historico-campo" type="button">
              <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
              Atualizar Histórico
            </button>
          </div>
          <div class="overflow-y-auto max-h-[500px] pr-2 space-y-4" id="timeline-historico-campo">
            <!-- Timeline de auditoria inserida aqui dinamicamente -->
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

      <!-- MODAL RÁPIDO NOVA MATRÍCULA (Ajuste Fino V2.3) -->
      <div id="modal-matricula-rapido" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] hidden flex items-center justify-center p-4">
         <div class="glass-card w-full max-w-sm">
            <div class="p-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
               <h3 class="text-sm font-bold flex items-center gap-2">
                  <i data-lucide="plus" class="w-4 h-4 text-mint-vibrant"></i>
                  Cadastrar Matrícula da Propriedade
               </h3>
               <button class="text-white/40 hover:text-white" id="btn-fechar-modal-mat-rapido" type="button">
                  <i data-lucide="x" class="w-4 h-4"></i>
               </button>
            </div>
            <form id="form-matricula-rapido" class="p-4 space-y-3">
               <div>
                  <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Número da Matrícula *</label>
                  <input type="text" id="input-mat-numero" required placeholder="Ex: 12.345" class="glass-input w-full text-xs py-1.5" />
               </div>
               <div>
                  <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Área (Hectares) *</label>
                  <input type="number" step="0.0001" id="input-mat-area" required placeholder="Ex: 45.1234" class="glass-input w-full text-xs py-1.5" />
               </div>
               <div class="grid grid-cols-2 gap-2">
                  <div>
                     <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Código CCIR</label>
                     <input type="text" id="input-mat-ccir" placeholder="Ex: 950.082.012.345-6" class="glass-input w-full text-[10px] py-1.5" />
                  </div>
                  <div>
                     <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Código ITR / NIRF</label>
                     <input type="text" id="input-mat-itr" placeholder="Ex: 1.234.567-8" class="glass-input w-full text-[10px] py-1.5" />
                  </div>
               </div>
               <div class="flex justify-end gap-2 pt-3 border-t border-white/5">
                  <button type="button" class="btn-secondary text-[10px] py-1 px-3" id="btn-cancelar-mat-rapido">Cancelar</button>
                  <button type="submit" class="btn-primary text-[10px] py-1 px-3 bg-emerald-600 hover:bg-emerald-500 text-white" id="btn-submit-mat-rapido">Salvar Matrícula</button>
               </div>
            </form>
         </div>
      </div>

      <!-- MENU DE CONTEXTO FLUTUANTE (BOTÃO DIREITO) -->
      <div id="menu-contexto-ponto" class="menu-contexto-flutuante hidden">
         <button class="menu-contexto-item" id="menu-ctx-editar" type="button">
            <i data-lucide="edit-3" class="w-4 h-4 text-mint-vibrant"></i>
            Editar Vértice
         </button>
         <button class="menu-contexto-item item-excluir text-red-400" id="menu-ctx-excluir" type="button">
            <i data-lucide="trash-2" class="w-4 h-4 text-red-400"></i>
            Excluir Vértice
         </button>
      </div>

      <!-- MODAL DE CONTROLE TOTAL E EDIÇÃO DE PONTO -->
      <div id="modal-editar-ponto" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] hidden flex items-center justify-center p-4">
         <div class="glass-card w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div class="p-5 border-b border-white/5 flex justify-between items-center bg-white/[0.02] shrink-0">
               <h3 class="text-base font-bold flex items-center gap-2">
                  <i data-lucide="crosshair" class="w-5 h-5 text-mint-vibrant"></i>
                  Controle Individual de Vértice: <span id="modal-pt-titulo-nome" class="text-mint-vibrant">-</span>
               </h3>
               <button class="text-white/40 hover:text-white" id="btn-fechar-modal-pt" type="button">
                  <i data-lucide="x" class="w-5 h-5"></i>
               </button>
            </div>
            
            <form id="form-editar-ponto" class="flex-1 overflow-y-auto p-6 space-y-6">
               <input type="hidden" id="input-pt-id" />
               
               <!-- 1. DADOS ORIGINAIS DE INGESTÃO (SOMENTE LEITURA) -->
               <div class="bg-forest-deep/60 border border-white/5 rounded-xl p-4 space-y-2">
                  <div class="flex justify-between items-center border-b border-white/5 pb-2">
                     <span class="text-[10px] font-bold text-white/40 uppercase tracking-wider">Dados Originais de Ingestão (Auditável)</span>
                     <span class="text-[9px] font-mono bg-white/5 px-2 py-0.5 rounded text-white/40" id="txt-pt-arquivo-origem">Rinex: -</span>
                  </div>
                  <div class="grid grid-cols-3 gap-4 text-xs font-mono">
                     <div>
                        <span class="block text-[9px] text-white/30 uppercase">Este (E) Original</span>
                        <span class="text-white font-medium" id="txt-pt-e-orig">-</span>
                     </div>
                     <div>
                        <span class="block text-[9px] text-white/30 uppercase">Norte (N) Original</span>
                        <span class="text-white font-medium" id="txt-pt-n-orig">-</span>
                     </div>
                     <div>
                        <span class="block text-[9px] text-white/30 uppercase">Altitude Original</span>
                        <span class="text-white font-medium" id="txt-pt-alt-orig">-</span>
                     </div>
                  </div>
               </div>

               <!-- 2. IDENTIFICAÇÃO E PARÂMETROS EDITÁVEIS -->
               <div class="grid grid-cols-2 gap-4">
                  <div>
                     <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Nome do Vértice *</label>
                     <input type="text" id="input-pt-nome" required class="glass-input w-full text-xs font-mono" placeholder="Ex: P001" />
                  </div>
                  <div>
                     <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Tipo de Ponto *</label>
                     <select id="select-pt-tipo" required class="glass-input w-full text-xs">
                        <option value="M">Marco de Apoio / Base (M)</option>
                        <option value="P">Rover Estático / Rover RTK (P)</option>
                        <option value="V">Virtual (V)</option>
                     </select>
                  </div>
               </div>

               <div class="grid grid-cols-3 gap-4">
                  <div>
                     <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Status do Ponto *</label>
                     <select id="select-pt-status" required class="glass-input w-full text-xs">
                        <option value="BRUTO">Bruto</option>
                        <option value="CORRIGIDO">Corrigido</option>
                     </select>
                  </div>
                  <div>
                     <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Método SIGEF *</label>
                     <select id="select-pt-metodo" required class="glass-input w-full text-xs">
                        <option value="PG1">RTK Relativo (PG1)</option>
                        <option value="MC1">Estático (MC1)</option>
                        <option value="MC2">Estático Rápido (MC2)</option>
                        <option value="PG2">RTK Wms/Ntrip (PG2)</option>
                     </select>
                  </div>
                  <div>
                     <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Base de Campo</label>
                     <select id="select-pt-base" class="glass-input w-full text-xs">
                        <option value="">[Sem Base Apoio]</option>
                        <!-- Carregado dinamicamente -->
                     </select>
                  </div>
               </div>

               <!-- 3. COORDENADAS ATUAIS CORRIGIDAS -->
               <div class="space-y-3">
                  <span class="block text-[10px] font-bold text-white/40 uppercase tracking-wider border-b border-white/5 pb-1">Coordenadas Ajustadas (SIRGAS 2000)</span>
                  
                  <div class="grid grid-cols-3 gap-4">
                     <div>
                        <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Latitude (Dec)</label>
                        <input type="number" step="0.0000000001" id="input-pt-lat" class="glass-input w-full text-xs font-mono" placeholder="-23.123456789" />
                     </div>
                     <div>
                        <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Longitude (Dec)</label>
                        <input type="number" step="0.0000000001" id="input-pt-lon" class="glass-input w-full text-xs font-mono" placeholder="-53.123456789" />
                     </div>
                     <div>
                        <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Altitude H (m)</label>
                        <input type="number" step="0.001" id="input-pt-alt" class="glass-input w-full text-xs font-mono" placeholder="320.456" />
                     </div>
                  </div>

                  <!-- 4. INCERTEZAS / PRECISION SIGMAS (± METROS) -->
                  <div class="grid grid-cols-3 gap-4 pt-2">
                     <div>
                        <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Incerteza Lat (Sigma ± m)</label>
                        <input type="number" step="0.0001" id="input-pt-sigma-lat" class="glass-input w-full text-xs font-mono" placeholder="0.0050" />
                     </div>
                     <div>
                        <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Incerteza Lon (Sigma ± m)</label>
                        <input type="number" step="0.0001" id="input-pt-sigma-lon" class="glass-input w-full text-xs font-mono" placeholder="0.0050" />
                     </div>
                     <div>
                        <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Incerteza Alt (Sigma ± m)</label>
                        <input type="number" step="0.0001" id="input-pt-sigma-alt" class="glass-input w-full text-xs font-mono" placeholder="0.0100" />
                     </div>
                  </div>
               </div>

               <!-- RODAPÉ AÇÕES -->
               <div class="flex justify-between items-center pt-5 border-t border-white/5 shrink-0">
                  <button type="button" class="px-4 py-2 rounded-technical bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white font-bold text-xs flex items-center gap-1.5 transition-all" id="btn-excluir-ponto-modal">
                     <i data-lucide="trash-2" class="w-4 h-4"></i>
                     Excluir Vértice
                  </button>
                  <div class="flex gap-3">
                     <button type="button" class="btn-secondary text-xs" id="btn-cancelar-pt">Cancelar</button>
                     <button type="submit" class="btn-primary text-xs" id="btn-salvar-pt">Aplicar Alterações</button>
                  </div>
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
    let filesQueue: { file: File; destination: string; matricula_id?: number | null; base_escolhida_id?: number | null }[] = [];
    let modoCoordenadas = 'utm'; // Padrão AutoCAD UTM Default (Diretriz V2.3)
    let etapaAtiva = 'geoprocessamento'; // 'geoprocessamento' ou 'cartorio' (Isolação de Telas)

    let editandoLevId: number | null = null;
    let globalPropriedadesList: any[] = [];

    // Função matemática precisa e determinística de conversão Lat/Lon para UTM SIRGAS 2000
    const latLonToUTM = (lat: number, lon: number) => {
      const sa = 6378137.0;
      const sb = 6356752.314245;
      const e2cuadrado = (sa * sa - sb * sb) / (sb * sb);
      const c = sa * sa / sb;
      
      const latRad = lat * Math.PI / 180;
      const lonRad = lon * Math.PI / 180;
      
      const zone = Math.floor((lon + 180) / 6) + 1;
      const lonSMRad = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
      
      const deltaLon = lonRad - lonSMRad;
      
      const A = Math.cos(latRad) * Math.sin(deltaLon);
      const xi = 0.5 * Math.log((1 + A) / (1 - A));
      const eta = Math.atan(Math.tan(latRad) / Math.cos(deltaLon)) - latRad;
      
      const nu = c / Math.sqrt(1 + e2cuadrado * Math.cos(latRad) * Math.cos(latRad));
      const zeta = (e2cuadrado / 2) * xi * xi * Math.cos(latRad) * Math.cos(latRad);
      const A1 = Math.sin(2 * latRad);
      const A2 = A1 * Math.cos(latRad) * Math.cos(latRad);
      const J2 = latRad + A1 / 2;
      const J4 = (3 * J2 + A2) / 4;
      const J6 = (5 * J4 + A2 * Math.cos(latRad) * Math.cos(latRad)) / 3;
      
      const alpha = (3 / 4) * e2cuadrado;
      const beta = (5 / 3) * alpha * alpha;
      const gama = (35 / 27) * alpha * alpha * alpha;
      
      const Bm = 0.9996 * c * (latRad - alpha * J2 + beta * J4 - gama * J6);
      
      const e = xi * nu * 0.9996 * (1 + zeta / 3) + 500000;
      let n = eta * nu * 0.9996 * (1 + zeta) + Bm;
      
      if (n < 0) {
        n = n + 10000000;
      }
      
      return { e, n, zone };
    };

    const atualizarPolilinhaMapaTemp = () => {
      if (!triagemMap || !currentMatriculaId) return;

      const pontosMat = pontosList.filter(p => p.matricula_id === currentMatriculaId);
      pontosMat.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));
      
      polylineList.forEach(pl => triagemMap!.removeLayer(pl));
      polylineList = [];

      const validPoints = pontosMat.filter(p => p.lat && p.lon && p.lat !== 0 && p.lon !== 0);
      if (validPoints.length < 2) return;

      for (let i = 0; i < validPoints.length - 1; i++) {
        const pIni = validPoints[i];
        const pFim = validPoints[i+1];
        const polyline = L.polyline([[pIni.lat, pIni.lon], [pFim.lat, pFim.lon]], {
          color: '#10b981', 
          weight: 4
        }).addTo(triagemMap!);
        polylineList.push(polyline);
      }

      const pLast = validPoints[validPoints.length - 1];
      const pFirst = validPoints[0];
      const polylineClose = L.polyline([[pLast.lat, pLast.lon], [pFirst.lat, pFirst.lon]], {
        color: '#10b981',
        weight: 4,
        dashArray: '4, 4'
      }).addTo(triagemMap!);
      polylineList.push(polylineClose);
    };

    const subirPonto = (pontoId: number) => {
      if (!currentMatriculaId) return;
      
      // Filtra e ordena a lista local
      const pontosMat = pontosList.filter(p => p.matricula_id === currentMatriculaId);
      pontosMat.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));
      
      const idx = pontosMat.findIndex(p => p.id === pontoId);
      if (idx > 0) {
        // Troca a ordem_caminhamento dos dois pontos
        const p1 = pontosMat[idx];
        const p2 = pontosMat[idx - 1];
        
        const tempOrdem = p1.ordem_caminhamento || idx + 1;
        p1.ordem_caminhamento = p2.ordem_caminhamento || idx;
        p2.ordem_caminhamento = tempOrdem;

        const btnSalvar = document.getElementById('btn-salvar-perimetro-custom');
        if (btnSalvar) {
          btnSalvar.classList.remove('hidden');
          btnSalvar.classList.add('animate-pulse');
        }

        renderMatriculaDados();
        atualizarPolilinhaMapaTemp();
      }
    };

    const descerPonto = (pontoId: number) => {
      if (!currentMatriculaId) return;
      
      const pontosMat = pontosList.filter(p => p.matricula_id === currentMatriculaId);
      pontosMat.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));
      
      const idx = pontosMat.findIndex(p => p.id === pontoId);
      if (idx !== -1 && idx < pontosMat.length - 1) {
        const p1 = pontosMat[idx];
        const p2 = pontosMat[idx + 1];
        
        const tempOrdem = p1.ordem_caminhamento || idx + 1;
        p1.ordem_caminhamento = p2.ordem_caminhamento || idx + 2;
        p2.ordem_caminhamento = tempOrdem;

        const btnSalvar = document.getElementById('btn-salvar-perimetro-custom');
        if (btnSalvar) {
          btnSalvar.classList.remove('hidden');
          btnSalvar.classList.add('animate-pulse');
        }

        renderMatriculaDados();
        atualizarPolilinhaMapaTemp();
      }
    };

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

       // Inicializa na Etapa 1: Mesa Geodésica por padrão (Diretriz V2.3)
       alternarEtapa('geoprocessamento');

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
            abasContainer.innerHTML = `
              <div class="flex items-center gap-2 p-1 shrink-0">
                <span class="text-xs text-white/30 font-mono">[Nenhuma Matrícula]</span>
                <button class="px-2.5 py-1 text-[10px] font-bold bg-mint-vibrant/10 border border-mint-vibrant/20 text-mint-vibrant hover:bg-mint-vibrant hover:text-forest-deep rounded transition-all flex items-center gap-1" id="btn-adicionar-matricula-rapido" type="button">
                  <i data-lucide="plus" class="w-3 h-3"></i>
                  Cadastrar Matrícula
                </button>
              </div>
            `;
            // Anexa listener no botão rápido
            document.getElementById('btn-adicionar-matricula-rapido')?.addEventListener('click', () => {
              abrirModalMatriculaRapido();
            });
          } else {
            let abasHtml = matriculasList.map((m) => `
              <button class="px-4 py-1.5 text-xs font-bold border-b-2 border-transparent text-white/40 hover:text-white transition-all btn-mat-tab whitespace-nowrap" data-mat-id="${m.id}" type="button">
                Matrícula ${m.numero_matricula}
              </button>
            `).join('');

            // Adiciona o botão premium "+" ao lado das abas
            abasHtml += `
              <button class="px-2.5 py-1 text-[10px] font-bold bg-white/5 border border-white/10 text-white hover:text-mint-vibrant hover:border-mint-vibrant/30 rounded transition-all flex items-center gap-1 shrink-0 ml-2" id="btn-adicionar-matricula-rapido" type="button" title="Cadastrar nova matrícula para a propriedade">
                <i data-lucide="plus" class="w-3.5 h-3.5"></i>
                Adicionar Matrícula
              </button>
            `;

            abasContainer.innerHTML = abasHtml;

            // Evento nas abas
            document.querySelectorAll('.btn-mat-tab').forEach(b => {
              b.addEventListener('click', () => {
                const mId = parseInt(b.getAttribute('data-mat-id') || '0');
                switchMatriculaTab(mId);
              });
            });

            // Anexa listener no botão rápido de adicionar
            document.getElementById('btn-adicionar-matricula-rapido')?.addEventListener('click', () => {
              abrirModalMatriculaRapido();
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

    const abrirModalMatriculaRapido = () => {
      const modal = document.getElementById('modal-matricula-rapido');
      const form = document.getElementById('form-matricula-rapido') as HTMLFormElement;
      if (form) form.reset();
      if (modal) modal.classList.remove('hidden');
    };

    const alternarEtapa = (etapa: string) => {
      etapaAtiva = etapa;
      
      const btnGeo = document.getElementById('btn-etapa-geoprocessamento');
      const btnCart = document.getElementById('btn-etapa-cartorio');
      const btnAud = document.getElementById('btn-etapa-auditoria');
      const containerIngestao = document.getElementById('container-ingestao-arquivos');
      const gridSuperior = document.getElementById('grid-superior-detalhe');
      const containerTabelas = document.getElementById('container-tabelas-inferiores');
      const containerDivisas = document.getElementById('container-tabela-divisas');
      const btnSalvarPerimetro = document.getElementById('btn-salvar-perimetro-custom');
      const containerAuditoriaCampo = document.getElementById('container-etapa-auditoria-campo');
      
      const lblTituloLateral = document.getElementById('lbl-titulo-tabela-lateral');
      const badgeLateral = document.getElementById('badge-tabela-lateral');
      
      if (etapa === 'geoprocessamento') {
        if (btnGeo) {
          btnGeo.className = 'flex-grow py-2 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab bg-mint-vibrant/20 text-mint-vibrant flex items-center justify-center gap-2';
        }
        if (btnCart) {
          btnCart.className = 'flex-grow py-2 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white flex items-center justify-center gap-2';
        }
        if (btnAud) {
          btnAud.className = 'flex-grow py-2 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white flex items-center justify-center gap-2';
        }
        if (containerIngestao) containerIngestao.classList.remove('hidden');
        if (gridSuperior) {
          gridSuperior.className = 'grid grid-cols-1 lg:grid-cols-2 gap-6';
          gridSuperior.classList.remove('hidden');
        }
        if (containerDivisas) containerDivisas.classList.remove('hidden');
        if (containerTabelas) {
          containerTabelas.className = 'grid grid-cols-1 lg:grid-cols-2 gap-6'; // Mantém lado a lado!
          containerTabelas.classList.remove('hidden');
        }
        if (containerAuditoriaCampo) containerAuditoriaCampo.classList.add('hidden');
        if (lblTituloLateral) lblTituloLateral.innerText = "Auditoria de Translação Geodésica";
        if (badgeLateral) {
          badgeLateral.innerText = "VETOR DELTA ECEF";
          badgeLateral.className = "text-[9px] text-blue-400 font-mono bg-blue-500/10 px-2 py-0.5 rounded-full font-bold";
        }
        if (btnSalvarPerimetro) btnSalvarPerimetro.classList.add('hidden');
      } else if (etapa === 'cartorio') {
        if (btnGeo) {
          btnGeo.className = 'flex-grow py-2 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white flex items-center justify-center gap-2';
        }
        if (btnCart) {
          btnCart.className = 'flex-grow py-2 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab bg-mint-vibrant/20 text-mint-vibrant flex items-center justify-center gap-2';
        }
        if (btnAud) {
          btnAud.className = 'flex-grow py-2 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white flex items-center justify-center gap-2';
        }
        if (containerIngestao) containerIngestao.classList.add('hidden');
        if (gridSuperior) {
          gridSuperior.className = 'grid grid-cols-1 gap-6'; // Mapa Leaflet ocupa 100% de largura superior!
          gridSuperior.classList.remove('hidden');
        }
        if (containerDivisas) containerDivisas.classList.remove('hidden');
        if (containerTabelas) {
          containerTabelas.className = 'grid grid-cols-1 lg:grid-cols-2 gap-6'; // Tabelas lado a lado
          containerTabelas.classList.remove('hidden');
        }
        if (containerAuditoriaCampo) containerAuditoriaCampo.classList.add('hidden');
        if (lblTituloLateral) lblTituloLateral.innerText = "Segmentos de Divisa (Confrontantes)";
        if (badgeLateral) {
          badgeLateral.innerText = "EDICAO REAL-TIME";
          badgeLateral.className = "text-[9px] text-mint-vibrant font-mono bg-mint-vibrant/10 px-2 py-0.5 rounded-full font-bold";
        }
        if (btnSalvarPerimetro) btnSalvarPerimetro.classList.remove('hidden');
      } else if (etapa === 'auditoria') {
        if (btnGeo) {
          btnGeo.className = 'flex-grow py-2 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white flex items-center justify-center gap-2';
        }
        if (btnCart) {
          btnCart.className = 'flex-grow py-2 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white flex items-center justify-center gap-2';
        }
        if (btnAud) {
          btnAud.className = 'flex-grow py-2 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab bg-mint-vibrant/20 text-mint-vibrant flex items-center justify-center gap-2';
        }
        if (containerIngestao) containerIngestao.classList.add('hidden');
        if (gridSuperior) gridSuperior.classList.add('hidden');
        if (containerTabelas) containerTabelas.classList.add('hidden');
        if (containerAuditoriaCampo) containerAuditoriaCampo.classList.remove('hidden');
        renderHistoricoCampo();
      }
      
      initIcons();
      if (triagemMap && etapa !== 'auditoria') {
        setTimeout(() => {
          triagemMap!.invalidateSize();
        }, 50);
      }
      
      if (etapa !== 'auditoria') {
         renderMatriculaDados();
      }
    };

    const renderHistoricoCampo = async () => {
      const timeline = document.getElementById('timeline-historico-campo');
      if (!timeline || !currentLevId) return;

      try {
        timeline.innerHTML = `<div class="text-center py-8 text-white/30 flex flex-col items-center justify-center gap-2"><i data-lucide="refresh-cw" class="w-6 h-6 animate-spin text-mint-vibrant"></i> Carregando linha do tempo...</div>`;
        initIcons();

        const res = await fetch(`${API_BASE}/levantamentos/${currentLevId}/historico-campo`);
        const logs = await res.json();
        
        if (logs.length === 0) {
          timeline.innerHTML = `<div class="text-center py-8 text-white/30 border border-white/5 bg-white/[0.01] rounded-technical">Nenhum evento registrado nesta auditoria de campo.</div>`;
          return;
        }

        timeline.innerHTML = logs.map((log: any) => {
          let icone = 'info';
          let corIcone = 'text-blue-400 bg-blue-500/10 border-blue-500/20';
          
          if (log.tipo_evento === 'IMPORTACAO_TXT') {
            icone = 'file-up';
            corIcone = 'text-mint-vibrant bg-mint-vibrant/10 border-mint-vibrant/20';
          } else if (log.tipo_evento === 'EXCLUSAO_PONTO') {
            icone = 'trash-2';
            corIcone = 'text-red-400 bg-red-500/10 border-red-500/20';
          } else if (log.tipo_evento === 'CORRECAO_TRANSLACAO') {
            icone = 'refresh-cw';
            corIcone = 'text-blue-400 bg-blue-500/10 border-blue-500/20';
          } else if (log.tipo_evento === 'EDICAO_METODO') {
            icone = 'edit-3';
            corIcone = 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
          } else if (log.tipo_evento === 'ALTERACAO_BASE') {
            icone = 'link-2';
            corIcone = 'text-purple-400 bg-purple-500/10 border-purple-500/20';
          } else if (log.tipo_evento === 'CORRECAO_PONTO') {
            icone = 'crosshair';
            corIcone = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
          }

          const dataFormatada = new Date(log.timestamp).toLocaleString('pt-BR');
          let extraDetailsHtml = '';
          
          if (log.dados_detalhados && Object.keys(log.dados_detalhados).length > 0) {
             extraDetailsHtml = `
               <details class="mt-2 text-[10px] text-white/40 cursor-pointer outline-none">
                 <summary class="hover:text-white/60 select-none font-medium">Ver detalhes estruturados</summary>
                 <pre class="mt-1 p-2 bg-[#0c1510]/80 border border-white/5 rounded text-[10px] text-mint-vibrant/80 font-mono overflow-x-auto max-w-full">${JSON.stringify(log.dados_detalhados, null, 2)}</pre>
               </details>
             `;
          }

          return `
            <div class="flex items-start gap-4 p-4 border border-white/5 bg-white/[0.01] hover:bg-white/[0.02] rounded-technical transition-colors group">
              <div class="w-8 h-8 rounded-full border flex items-center justify-center shrink-0 ${corIcone} transition-transform group-hover:scale-105">
                <i data-lucide="${icone}" class="w-4 h-4"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex justify-between items-start gap-2">
                  <span class="text-[10px] font-bold tracking-wider uppercase text-white/30 font-mono">${log.tipo_evento}</span>
                  <span class="text-[9px] text-white/30 font-mono">${dataFormatada}</span>
                </div>
                <h5 class="text-xs font-bold text-white mt-1 leading-relaxed">${log.descricao}</h5>
                ${extraDetailsHtml}
              </div>
            </div>
          `;
        }).join('');

        initIcons();
      } catch (err) {
        console.error("Erro ao carregar timeline de auditoria:", err);
        timeline.innerHTML = `<div class="text-center py-8 text-red-400">Falha ao ler o histórico do levantamento.</div>`;
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
         if (etapaAtiva === 'cartorio') {
            tblHeader.innerHTML = `
              <th class="px-4 py-3 text-center w-[110px]">Ordem</th>
              <th class="px-4 py-3">Vértice</th>
              <th class="px-4 py-3">Tipo</th>
              <th class="px-4 py-3 text-right">${modoCoordenadas === 'geodesico' ? 'Latitude' : 'Este (E)'}</th>
              <th class="px-4 py-3 text-right">${modoCoordenadas === 'geodesico' ? 'Longitude' : 'Norte (N)'}</th>
              <th class="px-4 py-3 text-right">Altitude (m)</th>
            `;
         } else {
            if (modoCoordenadas === 'geodesico') {
                tblHeader.innerHTML = `
                  <th class="px-4 py-3">Vértice</th>
                  <th class="px-2 py-3 text-center">Tipo</th>
                  <th class="px-4 py-3 text-right">Latitude</th>
                  <th class="px-4 py-3 text-right">Longitude</th>
                  <th class="px-4 py-3 text-right">Altitude (m)</th>
                  <th class="px-4 py-3 text-center">Sigmas (mm: E, N, H)</th>
                  <th class="px-4 py-3 text-center">Base Apoio</th>
                  <th class="px-4 py-3 text-center">Método</th>
                `;
             } else {
                tblHeader.innerHTML = `
                  <th class="px-4 py-3">Vértice</th>
                  <th class="px-2 py-3 text-center">Tipo</th>
                  <th class="px-4 py-3 text-right">Este (E)</th>
                  <th class="px-4 py-3 text-right">Norte (N)</th>
                  <th class="px-4 py-3 text-right">Altitude (m)</th>
                  <th class="px-4 py-3 text-center">Sigmas (mm: E, N, H)</th>
                  <th class="px-4 py-3 text-center">Base Apoio</th>
                  <th class="px-4 py-3 text-center">Método</th>
                `;
             }
         }
      }

      const listPt = document.getElementById('tbl-pontos-triagem');
      if (listPt) {
        if (pontosMat.length === 0) {
          listPt.innerHTML = `<tr><td colspan="${etapaAtiva === 'cartorio' ? 6 : 8}" class="px-4 py-8 text-center text-white/30">Nenhum ponto atrelado a esta matrícula.</td></tr>`;
        } else {
          // Garante a ordenação correta na interface
          pontosMat.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));
          
          listPt.innerHTML = pontosMat.map((p, idx) => {
            const highSigma = (p.sigma_lat > 0.10 || p.sigma_lon > 0.10 || p.sigma_alt > 0.10);
            const cellClass = highSigma ? 'text-red-400 font-bold bg-red-500/10 animate-pulse' : '';
            
            let col1 = '-';
            let col2 = '-';
            let col3 = '-';
            
            if (modoCoordenadas === 'geodesico') {
               col1 = p.lat ? p.lat.toFixed(8) : '-';
               col2 = p.lon ? p.lon.toFixed(8) : '-';
               col3 = p.alt ? p.alt.toFixed(3) : '-';
            } else {
               if (p.e_original && p.n_original) {
                  // Se for da translação do RTK, calculamos a UTM corrigida para exibição
                  if (p.lat && p.lon) {
                     const utm = latLonToUTM(p.lat, p.lon);
                     col1 = utm.e.toFixed(3);
                     col2 = utm.n.toFixed(3);
                  } else {
                     col1 = p.e_original.toFixed(3);
                     col2 = p.n_original.toFixed(3);
                  }
                  col3 = p.alt ? p.alt.toFixed(3) : (p.alt_original ? p.alt_original.toFixed(3) : '-');
               } else if (p.lat && p.lon) {
                  // AutoCAD UTM Default: Cálculo dinâmico para evitar vazios se cadastrado manual
                  const utm = latLonToUTM(p.lat, p.lon);
                  col1 = utm.e.toFixed(3);
                  col2 = utm.n.toFixed(3);
                  col3 = p.alt ? p.alt.toFixed(3) : '-';
               }
            }

            if (etapaAtiva === 'cartorio') {
               return `
                 <tr class="linha-ponto-tbl hover:bg-white/[0.02] border-b border-white/5 cursor-pointer transition-colors" id="tr-ponto-${p.id}" data-ponto-id="${p.id}">
                   <td class="px-2 py-1.5 text-center flex items-center justify-center gap-1.5 h-full">
                     <span class="text-[10px] font-bold text-mint-vibrant font-mono">${p.ordem_caminhamento || (idx + 1)}</span>
                     <button class="btn-subir-ponto p-0.5 bg-white/5 hover:bg-mint-vibrant/20 text-white hover:text-mint-vibrant rounded transition-colors" data-ponto-id="${p.id}" title="Subir Ponto" type="button">
                       <i data-lucide="chevron-up" class="w-3.5 h-3.5"></i>
                     </button>
                     <button class="btn-descer-ponto p-0.5 bg-white/5 hover:bg-mint-vibrant/20 text-white hover:text-mint-vibrant rounded transition-colors" data-ponto-id="${p.id}" title="Descer Ponto" type="button">
                       <i data-lucide="chevron-down" class="w-3.5 h-3.5"></i>
                     </button>
                   </td>
                   <td class="px-4 py-3 font-bold text-white">${p.nome_vertice}</td>
                   <td class="px-4 py-3 text-center font-bold text-mint-vibrant/80">${p.tipo_ponto || p.tipo || '-'}</td>
                   <td class="px-4 py-3 text-right">${col1}</td>
                   <td class="px-4 py-3 text-right">${col2}</td>
                   <td class="px-4 py-3 text-right">${col3}</td>
                 </tr>
               `;
            } else {
               // Sigmas convertidos em milímetros (mm) na sequência Este, Norte, Altitude
               const sE = p.sigma_lon ? (p.sigma_lon * 1000).toFixed(0) + 'mm' : '0mm';
               const sN = p.sigma_lat ? (p.sigma_lat * 1000).toFixed(0) + 'mm' : '0mm';
               const sH = p.sigma_alt ? (p.sigma_alt * 1000).toFixed(0) + 'mm' : '0mm';
               const cellSigmas = `E: ${sE} | N: ${sN} | H: ${sH}`;

               const metodosDisponiveis: { [key: string]: string } = {
                  'PG1': 'RTK Relativo (PG1)',
                  'MC1': 'Estático (MC1)',
                  'MC2': 'Estático Rápido (MC2)',
                  'PG2': 'RTK Wms/Ntrip (PG2)'
               };
               const metodoText = metodosDisponiveis[p.metodo_posicionamento || 'PG1'] || (p.metodo_posicionamento || 'PG1');

               let baseText = '<span class="text-[9px] bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/20 px-2 py-0.5 rounded-full font-bold font-mono">BASE</span>';
               if (p.tipo_ponto !== 'M') {
                  const baseObj = pontosList.find(b => b.id === p.ponto_base_id);
                  baseText = baseObj ? `Base: ${baseObj.nome_vertice}` : '<span class="text-white/30 italic">Sem Base</span>';
               }

               return `
                 <tr class="linha-ponto-tbl hover:bg-white/[0.02] border-b border-white/5 cursor-pointer transition-colors" id="tr-ponto-${p.id}" data-ponto-id="${p.id}">
                   <td class="px-4 py-3 font-bold text-white">${p.nome_vertice}</td>
                   <td class="px-2 py-3 text-center font-bold text-mint-vibrant/80">${p.tipo_ponto || p.tipo || '-'}</td>
                   <td class="px-4 py-3 text-right">${col1}</td>
                   <td class="px-4 py-3 text-right">${col2}</td>
                   <td class="px-4 py-3 text-right">${col3}</td>
                   <td class="px-4 py-3 text-center text-[10px] ${cellClass}">
                     ${cellSigmas}
                   </td>
                   <td class="px-4 py-3 text-center text-[11px] font-medium text-white/70">
                     ${baseText}
                   </td>
                   <td class="px-4 py-3 text-center text-[11px] font-medium text-white/70">
                     ${metodoText}
                   </td>
                 </tr>
               `;
            }
          }).join('');

          // Clique na linha foca no mapa
          document.querySelectorAll('.linha-ponto-tbl').forEach(tr => {
            tr.addEventListener('click', () => {
              const pId = parseInt(tr.getAttribute('data-ponto-id') || '0');
              selectPontoFromTabela(pId);
            });
          });


          // Eventos subir/descer
          document.querySelectorAll('.btn-subir-ponto').forEach(b => {
             b.addEventListener('click', (e) => {
                e.stopPropagation();
                const pId = parseInt(b.getAttribute('data-ponto-id') || '0');
                subirPonto(pId);
             });
          });

          document.querySelectorAll('.btn-descer-ponto').forEach(b => {
             b.addEventListener('click', (e) => {
                e.stopPropagation();
                const pId = parseInt(b.getAttribute('data-ponto-id') || '0');
                descerPonto(pId);
             });
          });

          initIcons();
        }
      }

      // 3. TABELA LATERAL REATIVA (GEOPROCESSAMENTO: AUDITORIA | CARTORIO: CONFRONTANTES)
      const containerLateral = document.getElementById('container-tabela-lateral-content');
      if (containerLateral) {
         if (etapaAtiva === 'geoprocessamento') {
            // Renderiza Tabela de Auditoria de Translação
            if (pontosMat.length === 0) {
               containerLateral.innerHTML = `
                 <table class="w-full text-left border-collapse">
                   <tbody class="text-xs text-white/30">
                     <tr><td class="px-4 py-8 text-center">Nenhum ponto para auditar translação.</td></tr>
                   </tbody>
                 </table>
               `;
            } else {
               const auditoriaHtml = pontosMat.map(p => {
                  let originalE = '-';
                  let originalN = '-';
                  let corrE = '-';
                  let corrN = '-';
                  
                  let devE = '0.0';
                  let devN = '0.0';
                  let devH = '0.0';

                  if (p.lat && p.lon) {
                     const utmCorr = latLonToUTM(p.lat, p.lon);
                     corrE = utmCorr.e.toFixed(3);
                     corrN = utmCorr.n.toFixed(3);

                     if (p.e_original && p.n_original) {
                        originalE = p.e_original.toFixed(3);
                        originalN = p.n_original.toFixed(3);

                        const dE = (utmCorr.e - p.e_original) * 1000;
                        const dN = (utmCorr.n - p.n_original) * 1000;
                        const dH = ((p.alt || 0) - (p.alt_original || 0)) * 1000;

                        devE = dE >= 0 ? '+' + dE.toFixed(1) : dE.toFixed(1);
                        devN = dN >= 0 ? '+' + dN.toFixed(1) : dN.toFixed(1);
                        devH = dH >= 0 ? '+' + dH.toFixed(1) : dH.toFixed(1);
                     }
                  }

                  return `
                    <tr class="hover:bg-white/[0.01] border-b border-white/5 font-mono text-[11px]">
                      <td class="px-4 py-2 font-bold text-white">${p.nome_vertice}</td>
                      <td class="px-2 py-2 text-right text-white/40">${originalE}<br/><span class="text-[9px]">${originalN}</span></td>
                      <td class="px-2 py-2 text-right text-mint-vibrant/90">${corrE}<br/><span class="text-[9px] text-mint-vibrant/70">${corrN}</span></td>
                      <td class="px-2 py-2 text-right font-bold ${parseFloat(devE) === 0 ? 'text-white/30' : 'text-blue-400'}">${devE}mm</td>
                      <td class="px-2 py-2 text-right font-bold ${parseFloat(devN) === 0 ? 'text-white/30' : 'text-blue-400'}">${devN}mm</td>
                      <td class="px-2 py-2 text-right font-bold ${parseFloat(devH) === 0 ? 'text-white/30' : 'text-blue-400'}">${devH}mm</td>
                    </tr>
                  `;
               }).join('');

               containerLateral.innerHTML = `
                 <table class="w-full text-left border-collapse">
                   <thead>
                     <tr class="bg-white/5 text-[9px] font-bold uppercase tracking-widest text-white/30 border-b border-white/5 sticky top-0 z-10">
                       <th class="px-4 py-3">Vértice</th>
                       <th class="px-2 py-3 text-right">Original (E/N)</th>
                       <th class="px-2 py-3 text-right">Corrigido (E/N)</th>
                       <th class="px-2 py-3 text-right">dE</th>
                       <th class="px-2 py-3 text-right">dN</th>
                       <th class="px-2 py-3 text-right">dH</th>
                     </tr>
                   </thead>
                   <tbody class="text-xs divide-y divide-white/5 text-white/60">
                     ${auditoriaHtml}
                   </tbody>
                 </table>
               `;
            }
         } else {
            // Renderiza Tabela de Segmentos/Divisas de Cartório
            if (segmentosMat.length === 0) {
               containerLateral.innerHTML = `
                 <table class="w-full text-left border-collapse">
                   <tbody class="text-xs text-white/30">
                     <tr><td class="px-4 py-8 text-center">Nenhum segmento atrelado a esta matrícula.</td></tr>
                   </tbody>
                 </table>
               `;
            } else {
               const segmentosHtml = segmentosMat.map(s => {
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

               containerLateral.innerHTML = `
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
                     ${segmentosHtml}
                   </tbody>
                 </table>
               `;

               // Atribuição de eventos de atualização real-time inline (PUT) de divisas
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
        const aviso = document.getElementById('aviso-matricula-fila');
        if (aviso) aviso.remove();
        return;
      }

      filaContainer?.classList.remove('hidden');
      btnProcessar?.classList.remove('hidden');

      // Remove aviso de matrícula se houver, pois agora não é mais obrigatória
      const antigoAviso = document.getElementById('aviso-matricula-fila');
      if (antigoAviso) antigoAviso.remove();

      if (btnProcessar) {
        (btnProcessar as HTMLButtonElement).disabled = false;
        btnProcessar.classList.remove('opacity-50', 'cursor-not-allowed');
        btnProcessar.innerHTML = `<i data-lucide="play" class="w-4 h-4"></i> Processar Lote em Segundo Plano`;
      }

      // Filtra possíveis bases para o seletor
      const basesPossiveis = pontosList.filter(p => p.tipo_ponto === 'M' || p.nome_vertice.toUpperCase().includes('BASE') || p.tipo_ponto === 'BASE');
      const basesParaRenderizar = basesPossiveis.length > 0 ? basesPossiveis : pontosList;

      filaContainer!.innerHTML = filesQueue.map((item, idx) => {
        const kbSize = (item.file.size / 1024).toFixed(1);
        
        // Define valores padrão se não existirem
        if (item.matricula_id === undefined || item.matricula_id === null) {
          item.matricula_id = currentMatriculaId;
        }

        const options = [
          `<option value="base" ${item.destination === 'base' ? 'selected' : ''}>[Base - Enviar ao PPP]</option>`,
          `<option value="rover_estatico_corrigido" ${item.destination === 'rover_estatico_corrigido' ? 'selected' : ''}>[Rover Estático - Relatório de Coordenadas Corrigidas]</option>`,
          `<option value="rover_estatico_bruto" ${item.destination === 'rover_estatico_bruto' ? 'selected' : ''}>[Rover Estático - Arquivo Bruto (Aguardando Baseline)]</option>`,
          `<option value="rover_rtk" ${item.destination === 'rover_rtk' ? 'selected' : ''}>[RTK - Ingestão de Pontos (Vincular à Base Selecionada)]</option>`
        ];

        let extraSelectorsHtml = '';

        if (item.destination === 'rover_rtk') {
          // Seletor de Base de Apoio
          extraSelectorsHtml += `
            <select class="glass-input text-[10px] py-1 px-2 select-file-base shrink-0 w-[160px]" data-idx="${idx}" title="Vincular à Base de Campo">
              <option value="">[Nenhuma Base (Autodetectar)]</option>
              ${basesParaRenderizar.map(p => `<option value="${p.id}" ${item.base_escolhida_id === p.id ? 'selected' : ''}>Base: ${p.nome_vertice}</option>`).join('')}
            </select>
          `;
        }

        return `
          <div class="flex flex-col md:flex-row items-start md:items-center justify-between p-3 bg-white/[0.02] border border-white/5 rounded-technical text-xs gap-3">
            <div class="min-w-0 flex-1">
              <p class="font-mono text-white truncate" title="${item.file.name}">${item.file.name}</p>
              <p class="text-[9px] text-white/30 font-mono mt-0.5">${kbSize} KB</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <select class="glass-input text-[10px] py-1 px-2 select-file-dest shrink-0 w-[220px]" data-idx="${idx}">
                ${options.join('')}
              </select>
              ${extraSelectorsHtml}
              <button class="text-white/30 hover:text-red-400 p-1 btn-remover-arquivo shrink-0" data-idx="${idx}">
                <i data-lucide="x" class="w-4 h-4"></i>
              </button>
            </div>
          </div>
        `;
      }).join('');

      initIcons();

      // Evento select destinação
      document.querySelectorAll('.select-file-dest').forEach(sel => {
        sel.addEventListener('change', (e) => {
          const idx = parseInt((e.target as HTMLSelectElement).getAttribute('data-idx') || '0');
          filesQueue[idx].destination = (e.target as HTMLSelectElement).value;
          renderFilaArquivos(); // Re-renderiza para exibir/ocultar seletores adicionais de matrícula e base!
        });
      });

      // Evento select matrícula
      document.querySelectorAll('.select-file-matricula').forEach(sel => {
        sel.addEventListener('change', (e) => {
          const idx = parseInt((e.target as HTMLSelectElement).getAttribute('data-idx') || '0');
          filesQueue[idx].matricula_id = parseInt((e.target as HTMLSelectElement).value);
        });
      });

      // Evento select base de campo
      document.querySelectorAll('.select-file-base').forEach(sel => {
        sel.addEventListener('change', (e) => {
          const idx = parseInt((e.target as HTMLSelectElement).getAttribute('data-idx') || '0');
          const val = (e.target as HTMLSelectElement).value;
          filesQueue[idx].base_escolhida_id = val ? parseInt(val) : null;
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

      let basesEnviadas = 0;
      let brutosEnviados = 0;
      let corrigidosProcessados = 0;
      let rtkProcessados = 0;

      for (const item of filesQueue) {
        if (item.destination === 'base') {
          // 1. Processamento de Base PPP
          const formData = new FormData();
          formData.append('files', item.file);
          try {
            const upRes = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData });
            const upData = await upRes.json();
            
            await fetch(`${API_BASE}/process/ppp`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(upData.files)
            });
            basesEnviadas++;
          } catch(err) {
            console.error("Erro ao enviar Base ao PPP:", err);
            alert(`Erro ao processar Base ${item.file.name}: ${err}`);
          }
        } 
        else if (item.destination === 'rover_estatico_bruto') {
          // 2. Upload de Rover Estático Bruto (Aguardando Baseline)
          const formData = new FormData();
          formData.append('categoria', 'Brutos');
          formData.append('file', item.file);
          try {
            const res = await fetch(`${API_BASE}/levantamentos/${currentLevId}/upload-arquivo`, {
              method: 'POST',
              body: formData
            });
            const data = await res.json();
            if (data.success) {
              brutosEnviados++;
            } else {
              alert(`Erro no arquivo ${item.file.name}: ${data.message || 'Erro no upload'}`);
            }
          } catch(err) {
            console.error("Erro ao enviar arquivo bruto:", err);
            alert(`Erro na comunicação ao subir ${item.file.name}`);
          }
        }
        else if (item.destination === 'rover_estatico_corrigido') {
          // 3. Importação de Rover Estático Corrigido (Matrícula é opcional no início)
          const mId = item.matricula_id || currentMatriculaId;
          const formData = new FormData();
          formData.append('file', item.file);
          if (mId) {
            formData.append('matricula_id', mId.toString());
          }
          try {
            const res = await fetch(`${API_BASE}/levantamentos/${currentLevId}/importar-txt`, {
              method: 'POST',
              body: formData
            });
            const data = await res.json();
            if (data.error) {
              alert(`Erro na importação de ${item.file.name}: ${data.error}`);
            } else {
              corrigidosProcessados++;
            }
          } catch(err) {
            console.error("Erro ao importar estático corrigido:", err);
            alert(`Erro na comunicação ao processar ${item.file.name}`);
          }
        }
        else if (item.destination === 'rover_rtk') {
          // 4. Ingestão de Rover RTK com vínculo à Base Selecionada (Matrícula é opcional no início)
          const mId = item.matricula_id || currentMatriculaId;
          const formData = new FormData();
          formData.append('file', item.file);
          if (mId) {
            formData.append('matricula_id', mId.toString());
          }
          if (item.base_escolhida_id) {
            formData.append('base_escolhida_id', item.base_escolhida_id.toString());
          }
          try {
            const res = await fetch(`${API_BASE}/levantamentos/${currentLevId}/importar-txt`, {
              method: 'POST',
              body: formData
            });
            const data = await res.json();
            if (data.error) {
              alert(`Erro na importação RTK de ${item.file.name}: ${data.error}`);
            } else {
              rtkProcessados++;
            }
          } catch(err) {
            console.error("Erro ao importar RTK:", err);
            alert(`Erro na comunicação ao processar ${item.file.name}`);
          }
        }
      }

      // Alerta de resumo unificado de processamento
      let msgAlerta = "Processamento do lote finalizado com sucesso!\n\n";
      if (basesEnviadas > 0) msgAlerta += `• ${basesEnviadas} Base(s) enviada(s) ao PPP IBGE.\n`;
      if (brutosEnviados > 0) msgAlerta += `• ${brutosEnviados} Rover(s) Estático(s) Bruto(s) salvos no Workspace.\n`;
      if (corrigidosProcessados > 0) msgAlerta += `• ${corrigidosProcessados} Rover(s) Estático(s) Corrigido(s) importados.\n`;
      if (rtkProcessados > 0) msgAlerta += `• ${rtkProcessados} RTK Rover(s) importado(s) e vinculado(s) à base.\n`;
      
      alert(msgAlerta);

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

    // Eventos de etapa 1, 2 e 3 (Diretriz V2.3/V2.4)
    document.getElementById('btn-etapa-geoprocessamento')?.addEventListener('click', () => {
      alternarEtapa('geoprocessamento');
    });

    document.getElementById('btn-etapa-cartorio')?.addEventListener('click', () => {
      alternarEtapa('cartorio');
    });

    document.getElementById('btn-etapa-auditoria')?.addEventListener('click', () => {
      alternarEtapa('auditoria');
    });

    document.getElementById('btn-atualizar-historico-campo')?.addEventListener('click', () => {
      renderHistoricoCampo();
    });

    // Evento de salvamento de ordem customizada perimetral
    document.getElementById('btn-salvar-perimetro-custom')?.addEventListener('click', async () => {
       if (!currentLevId || !currentMatriculaId) {
          alert("Nenhuma matrícula selecionada para salvar!");
          return;
       }

       // Filtra os pontos pertencentes exclusivamente à matrícula selecionada
       const pontosMat = pontosList.filter(p => p.matricula_id === currentMatriculaId);
       if (pontosMat.length === 0) {
          alert("Nenhum ponto para salvar!");
          return;
       }

       // Ordena e monta o payload rigorosamente
       pontosMat.sort((a, b) => (a.ordem_caminhamento || 0) - (b.ordem_caminhamento || 0));
       const payload = {
          pontos_ordem: pontosMat.map((p, idx) => ({
             id: p.id,
             ordem: idx + 1
          }))
       };

       try {
          const res = await fetch(`${API_BASE}/levantamentos/${currentLevId}/matriculas/${currentMatriculaId}/salvar-ordem`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify(payload)
          });
          const data = await res.json();
          if (data.sucesso) {
             alert(data.mensagem);
             const btnSalvar = document.getElementById('btn-salvar-perimetro-custom');
             if (btnSalvar) {
                btnSalvar.classList.remove('animate-pulse');
             }
             loadLevantamentoDetails(); // Recarrega para obter as divisas recalculadas
          } else {
             alert(`Erro ao salvar ordem: ${data.mensagem || 'Falha de validação no backend'}`);
          }
       } catch (err) {
          console.error("Erro ao salvar ordem perimetral:", err);
          alert("Falha de conexão com o servidor.");
       }
    });

    // Eventos do Modal Rápido de Matrículas (Ajuste Fino V2.3)
    document.getElementById('btn-fechar-modal-mat-rapido')?.addEventListener('click', () => {
       document.getElementById('modal-matricula-rapido')?.classList.add('hidden');
    });
    
    document.getElementById('btn-cancelar-mat-rapido')?.addEventListener('click', () => {
       document.getElementById('modal-matricula-rapido')?.classList.add('hidden');
    });

    document.getElementById('form-matricula-rapido')?.addEventListener('submit', async (e) => {
       e.preventDefault();
       if (!currentLevId) return;

       const numero_matricula = (document.getElementById('input-mat-numero') as HTMLInputElement).value;
       const area_ha = parseFloat((document.getElementById('input-mat-area') as HTMLInputElement).value);
       const ccir = (document.getElementById('input-mat-ccir') as HTMLInputElement).value || "";
       const itr = (document.getElementById('input-mat-itr') as HTMLInputElement).value || "";

       const payload = {
          numero_matricula,
          area_ha,
          ccir,
          itr
       };

       try {
          const res = await fetch(`${API_BASE}/levantamentos/${currentLevId}/matriculas`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify(payload)
          });
          const data = await res.json();
          if (data.error) {
             alert(`Erro ao cadastrar matrícula: ${data.error}`);
          } else {
             document.getElementById('modal-matricula-rapido')?.classList.add('hidden');
             // Recarrega todos os detalhes para obter a aba atualizada
             await loadLevantamentoDetails();
             alert("Matrícula cadastrada e sincronizada com sucesso!");
          }
       } catch(err) {
          console.error("Erro ao salvar matrícula rápida:", err);
          alert("Erro de comunicação com o servidor.");
       }
    });

    // --- MENU DE CONTEXTO E MODAL DE PONTO CUSTOMIZADO ---
    let pontoSelecionadoContextoId: number | null = null;

    const abrirModalEditarPonto = (pId: number) => {
      const pt = pontosList.find(x => x.id === pId);
      if (!pt) return;

      const modalPt = document.getElementById('modal-editar-ponto');
      if (!modalPt) return;

      pontoSelecionadoContextoId = pId;

      // Cabeçalho
      document.getElementById('modal-pt-titulo-nome')!.innerText = pt.nome_vertice;

      // Inputs
      (document.getElementById('input-pt-id') as HTMLInputElement).value = pt.id.toString();
      (document.getElementById('input-pt-nome') as HTMLInputElement).value = pt.nome_vertice;
      (document.getElementById('select-pt-tipo') as HTMLSelectElement).value = pt.tipo_ponto || 'P';
      (document.getElementById('select-pt-status') as HTMLSelectElement).value = pt.status_ponto || 'BRUTO';
      (document.getElementById('select-pt-metodo') as HTMLSelectElement).value = pt.metodo_posicionamento || 'PG1';
      
      (document.getElementById('input-pt-lat') as HTMLInputElement).value = pt.lat ? pt.lat.toString() : '';
      (document.getElementById('input-pt-lon') as HTMLInputElement).value = pt.lon ? pt.lon.toString() : '';
      (document.getElementById('input-pt-alt') as HTMLInputElement).value = pt.alt ? pt.alt.toString() : '';

      (document.getElementById('input-pt-sigma-lat') as HTMLInputElement).value = pt.sigma_lat ? pt.sigma_lat.toString() : '0';
      (document.getElementById('input-pt-sigma-lon') as HTMLInputElement).value = pt.sigma_lon ? pt.sigma_lon.toString() : '0';
      (document.getElementById('input-pt-sigma-alt') as HTMLInputElement).value = pt.sigma_alt ? pt.sigma_alt.toString() : '0';

      // Dados originais de ingestão
      document.getElementById('txt-pt-e-orig')!.innerText = pt.e_original ? pt.e_original.toFixed(4) + ' m' : 'N/A';
      document.getElementById('txt-pt-n-orig')!.innerText = pt.n_original ? pt.n_original.toFixed(4) + ' m' : 'N/A';
      document.getElementById('txt-pt-alt-orig')!.innerText = pt.alt_original ? pt.alt_original.toFixed(4) + ' m' : 'N/A';
      document.getElementById('txt-pt-arquivo-origem')!.innerText = pt.arquivo_rinex ? `Origem: ${pt.arquivo_rinex}` : 'Origem: Ingestão Manual';

      // Carregar combobox de Bases
      const selectBase = document.getElementById('select-pt-base') as HTMLSelectElement;
      if (selectBase) {
         const basesDoLev = pontosList.filter(x => x.tipo_ponto === 'M' && x.id !== pId);
         
         let baseOptionsHtml = '<option value="">[Sem Base Apoio]</option>';
         baseOptionsHtml += basesDoLev.map(b => `<option value="${b.id}" ${b.id === pt.ponto_base_id ? 'selected' : ''}>Base: ${b.nome_vertice}</option>`).join('');
         
         selectBase.innerHTML = baseOptionsHtml;
         
         // Habilita base apenas se o ponto não for do tipo Marco de Apoio 'M'
         selectBase.disabled = (pt.tipo_ponto === 'M');
      }

      modalPt.classList.remove('hidden');
      initIcons();
    };

    const confirmarExclusaoPonto = async (pId: number) => {
      const pt = pontosList.find(x => x.id === pId);
      if (!pt) return;

      if (!confirm(`ATENÇÃO: Tem certeza absoluta que deseja excluir definitivamente o vértice '${pt.nome_vertice}'? Esta operação é irreversível.`)) return;

      try {
         const res = await fetch(`${API_BASE}/pontos/${pId}`, { method: 'DELETE' });
         const data = await res.json();
         if (data.error) {
            alert(data.error);
         } else {
            alert(`Vértice ${pt.nome_vertice} excluído com sucesso!`);
            // Recarrega todos os dados
            await loadLevantamentoDetails();
         }
      } catch (err) {
         console.error("Erro ao excluir ponto:", err);
         alert("Erro de comunicação com o servidor API.");
      }
    };

    const salvarPontoModal = async () => {
      if (!pontoSelecionadoContextoId) return;

      const pId = pontoSelecionadoContextoId;
      const nome_vertice = (document.getElementById('input-pt-nome') as HTMLInputElement).value.trim();
      const tipo_ponto = (document.getElementById('select-pt-tipo') as HTMLSelectElement).value;
      const status_ponto = (document.getElementById('select-pt-status') as HTMLSelectElement).value;
      const metodo_posicionamento = (document.getElementById('select-pt-metodo') as HTMLSelectElement).value;
      const ponto_base_id_val = (document.getElementById('select-pt-base') as HTMLSelectElement).value;
      const ponto_base_id = ponto_base_id_val ? parseInt(ponto_base_id_val) : 0;

      const lat_val = (document.getElementById('input-pt-lat') as HTMLInputElement).value;
      const lon_val = (document.getElementById('input-pt-lon') as HTMLInputElement).value;
      const alt_val = (document.getElementById('input-pt-alt') as HTMLInputElement).value;

      const lat = lat_val ? parseFloat(lat_val) : null;
      const lon = lon_val ? parseFloat(lon_val) : null;
      const alt = alt_val ? parseFloat(alt_val) : null;

      const sigma_lat_val = (document.getElementById('input-pt-sigma-lat') as HTMLInputElement).value;
      const sigma_lon_val = (document.getElementById('input-pt-sigma-lon') as HTMLInputElement).value;
      const sigma_alt_val = (document.getElementById('input-pt-sigma-alt') as HTMLInputElement).value;

      const sigma_lat = sigma_lat_val ? parseFloat(sigma_lat_val) : 0;
      const sigma_lon = sigma_lon_val ? parseFloat(sigma_lon_val) : 0;
      const sigma_alt = sigma_alt_val ? parseFloat(sigma_alt_val) : 0;

      const payload = {
         nome_vertice,
         tipo_ponto,
         status_ponto,
         metodo_posicionamento,
         ponto_base_id,
         lat,
         lon,
         alt,
         sigma_lat,
         sigma_lon,
         sigma_alt
      };

      try {
         const res = await fetch(`${API_BASE}/pontos/${pId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
         });
         const data = await res.json();
         if (data.error || (data.detail && typeof data.detail === 'string')) {
            alert(`Erro ao salvar: ${data.error || data.detail}`);
         } else if (data.detail && typeof data.detail === 'object') {
            alert(`Erro ao salvar: ${JSON.stringify(data.detail)}`);
         } else {
            document.getElementById('modal-editar-ponto')?.classList.add('hidden');
            alert("Vértice geodésico atualizado com sucesso!");
            // Recarrega todos os detalhes reativamente
            await loadLevantamentoDetails();
         }
      } catch (err) {
         console.error("Erro ao salvar alterações no ponto:", err);
         alert("Erro de comunicação com o servidor.");
      }
    };

    const inicializarMenuContextoEPontoModal = () => {
      const menuCtx = document.getElementById('menu-contexto-ponto');
      const modalPt = document.getElementById('modal-editar-ponto');
      
      if (!menuCtx || !modalPt) return;

      // Evento contextmenu na tabela de pontos
      const tabelaCorpo = document.getElementById('tbl-pontos-triagem');
      if (tabelaCorpo) {
         tabelaCorpo.addEventListener('contextmenu', (e) => {
            const targetRow = (e.target as HTMLElement).closest('.linha-ponto-tbl');
            if (!targetRow) return;

            e.preventDefault();
            const pId = parseInt(targetRow.getAttribute('data-ponto-id') || '0');
            if (!pId) return;

            pontoSelecionadoContextoId = pId;
            selectPontoFromTabela(pId); // Destaca na tabela e mapa

            // Exibe e posiciona o menu flutuante no cursor do mouse
            menuCtx.style.left = `${e.pageX}px`;
            menuCtx.style.top = `${e.pageY}px`;
            menuCtx.classList.remove('hidden');
         });
      }

      // Ocultar menu ao clicar fora
      document.addEventListener('click', (e) => {
         if (!menuCtx.contains(e.target as Node)) {
            menuCtx.classList.add('hidden');
         }
      });

      // Ocultar menu ao rolar a página ou tabela
      document.addEventListener('scroll', () => {
         menuCtx.classList.add('hidden');
      }, true);

      // Evento "Editar Vértice" no menu
      document.getElementById('menu-ctx-editar')?.addEventListener('click', () => {
         menuCtx.classList.add('hidden');
         if (pontoSelecionadoContextoId) {
            abrirModalEditarPonto(pontoSelecionadoContextoId);
         }
      });

      // Evento "Excluir Vértice" no menu
      document.getElementById('menu-ctx-excluir')?.addEventListener('click', () => {
         menuCtx.classList.add('hidden');
         if (pontoSelecionadoContextoId) {
            confirmarExclusaoPonto(pontoSelecionadoContextoId);
         }
      });
      
      // Fechar modal de ponto
      document.getElementById('btn-fechar-modal-pt')?.addEventListener('click', () => {
         modalPt.classList.add('hidden');
      });
      document.getElementById('btn-cancelar-pt')?.addEventListener('click', () => {
         modalPt.classList.add('hidden');
      });

      // Salvar do modal de ponto
      document.getElementById('form-editar-ponto')?.addEventListener('submit', async (e) => {
         e.preventDefault();
         await salvarPontoModal();
      });

      // Botão excluir de dentro do modal de ponto
      document.getElementById('btn-excluir-ponto-modal')?.addEventListener('click', () => {
         if (pontoSelecionadoContextoId) {
            confirmarExclusaoPonto(pontoSelecionadoContextoId);
            modalPt.classList.add('hidden');
         }
      });

      // Listener para atualizar o combobox de bases caso o usuário mude o tipo no modal
      const selectTipo = document.getElementById('select-pt-tipo') as HTMLSelectElement;
      const selectBase = document.getElementById('select-pt-base') as HTMLSelectElement;
      selectTipo?.addEventListener('change', () => {
         if (selectBase && selectTipo) {
            const tipo = selectTipo.value;
            selectBase.disabled = (tipo === 'M');
            if (tipo === 'M') {
               selectBase.value = '';
            }
         }
      });
    };

    // Inicialização da lista e combobox
    loadLevantamentos();
    configurarComboboxPropriedades();
    inicializarMenuContextoEPontoModal();
  }
};
