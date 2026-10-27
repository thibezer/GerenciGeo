/**
 * dashboard_template.ts — Marcação HTML da tela Panorama Operacional / Dashboard.
 */
export function renderDashboardTemplate(): string {
  return `
    <div class="space-y-2 animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col h-full">
      <!-- Topo Comprimido (Ultra Baixo) -->
      <div class="flex justify-between items-center h-7 sm:h-8 border-b border-white/5 pb-1 sm:pb-1.5 order-first shrink-0">
        <div class="flex items-center gap-2">
          <h2 class="text-sm sm:text-base font-bold tracking-tight text-white leading-none">Panorama Operacional</h2>
        </div>
        <div class="flex items-center gap-2 text-right">
          <span class="text-[9px] font-mono text-white/20 uppercase tracking-widest hidden sm:inline">Status da API</span>
          <ui-badge id="api-status" variante="sucesso">Conectando...</ui-badge>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-2.5 sm:gap-3 flex-1 lg:h-[calc(100vh-80px)] lg:max-h-[calc(100vh-80px)] order-2">
        <!-- Leaflet Map Container -->
        <div class="lg:col-span-2 glass-card h-[400px] sm:h-[450px] lg:h-full relative overflow-hidden border-white/5" id="map-container">
           <div id="map" class="w-full h-full"></div>
        </div>

        <!-- Action Center Híbrido -->
        <div class="glass-card h-full flex flex-col min-h-0 overflow-hidden">
          <!-- Header do Action Center -->
          <div class="px-3.5 py-3 sm:px-4 sm:py-3.5 border-b border-white/5 flex justify-between items-center shrink-0 bg-white/[0.02]">
             <div class="flex items-center gap-2.5 min-w-0">
               <div class="w-7 h-7 rounded-lg bg-mint-vibrant/10 border border-mint-vibrant/25 flex items-center justify-center text-mint-vibrant shrink-0 shadow-sm">
                 <i data-lucide="zap" class="w-3.5 h-3.5"></i>
               </div>
               <div class="min-w-0">
                 <h4 class="text-xs sm:text-sm font-bold text-white tracking-wide truncate flex items-center gap-2 leading-none">
                   Action Center
                   <span id="action-center-badge" class="text-[9.5px] font-mono px-2 py-0.5 rounded-full font-bold bg-mint-vibrant/15 text-mint-vibrant border border-mint-vibrant/30">0</span>
                 </h4>
               </div>
             </div>
             <div class="flex items-center gap-1.5 shrink-0">
               <button id="btn-nova-tarefa-rapida" class="h-7.5 px-2.5 bg-mint-vibrant/15 hover:bg-mint-vibrant/25 border border-mint-vibrant/30 hover:border-mint-vibrant/50 text-mint-vibrant hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm" title="Criar nova tarefa rápida">
                 <i data-lucide="plus" class="w-3.5 h-3.5"></i>
                 <span class="hidden sm:inline">Nova Tarefa</span>
               </button>
               <button id="btn-recarregar-alertas" class="w-7.5 h-7.5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 rounded-lg transition-all cursor-pointer" title="Recarregar alertas">
                 <i data-lucide="refresh-cw" class="w-3.5 h-3.5" id="icon-recarregar-alertas"></i>
               </button>
             </div>
          </div>

          <!-- Abas de Navegação -->
          <div class="px-3.5 py-2 sm:px-4 sm:py-2.5 border-b border-white/5 flex items-center justify-between gap-2 shrink-0 bg-white/[0.01]">
             <div class="flex items-center gap-1 p-1 bg-black/40 rounded-lg border border-white/10 text-xs">
               <button id="tab-action-alertas" class="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-md font-semibold transition-all text-mint-vibrant bg-white/10 shadow-sm cursor-pointer flex items-center gap-1.5">
                 <i data-lucide="bell" class="w-3.5 h-3.5"></i>
                 <span>Auditoria</span>
                 <span id="tab-badge-alertas" class="text-[9px] px-1.5 py-0.5 rounded-full bg-mint-vibrant/20 text-mint-vibrant font-mono font-bold leading-none">0</span>
               </button>
               <button id="tab-action-rapidas" class="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-md font-semibold transition-all text-white/50 hover:text-white cursor-pointer flex items-center gap-1.5">
                 <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i>
                 <span>Ações Rápidas</span>
               </button>
             </div>
             <a href="#pendencias" class="text-xs text-mint-vibrant/80 hover:text-mint-vibrant hover:underline cursor-pointer flex items-center gap-1 py-1 font-medium transition-colors">
               <span>Ver Agenda</span>
               <i data-lucide="chevron-right" class="w-3 h-3"></i>
             </a>
          </div>

          <!-- Painel 1: Alertas e Auditoria -->
          <div id="painel-alertas" class="flex flex-col flex-1 min-h-0">
             <!-- Filtros Rápidos por Severidade -->
             <div class="px-3.5 py-2 sm:px-4 sm:py-2.5 border-b border-white/5 flex items-center gap-1.5 sm:gap-2 shrink-0 overflow-x-auto text-xs">
               <button class="filtro-alerta-btn px-2.5 py-1 rounded-md border border-mint-vibrant/40 bg-mint-vibrant/10 text-mint-vibrant font-semibold transition-all cursor-pointer whitespace-nowrap shadow-sm active" data-filtro="TODOS">
                 Todos (<span id="count-todos">0</span>)
               </button>
               <button class="filtro-alerta-btn px-2.5 py-1 rounded-md border border-white/5 hover:border-white/15 bg-white/[0.02] hover:bg-white/[0.05] text-white/50 hover:text-white font-medium transition-all cursor-pointer whitespace-nowrap" data-filtro="CRITICO">
                 Críticos (<span id="count-criticos">0</span>)
               </button>
               <button class="filtro-alerta-btn px-2.5 py-1 rounded-md border border-white/5 hover:border-white/15 bg-white/[0.02] hover:bg-white/[0.05] text-white/50 hover:text-white font-medium transition-all cursor-pointer whitespace-nowrap" data-filtro="ALERTA">
                 Avisos (<span id="count-avisos">0</span>)
               </button>
               <button class="filtro-alerta-btn px-2.5 py-1 rounded-md border border-white/5 hover:border-white/15 bg-white/[0.02] hover:bg-white/[0.05] text-white/50 hover:text-white font-medium transition-all cursor-pointer whitespace-nowrap" data-filtro="MANUAL">
                 Tarefas (<span id="count-tarefas">0</span>)
               </button>
             </div>

             <!-- Lista de Alertas -->
             <div class="p-3 sm:p-3.5 overflow-y-auto space-y-2.5 flex-1 min-h-0 max-h-[350px] lg:max-h-[calc(100vh-250px)]" id="alerts-container">
               <div class="text-center text-white/40 text-xs py-8">Carregando auditoria...</div>
             </div>
          </div>

          <!-- Painel 2: Ações Rápidas (Grid Operacional) -->
          <div id="painel-acoes-rapidas" class="p-3 sm:p-3.5 overflow-y-auto space-y-3 flex-1 min-h-0 hidden">
             <p class="text-[9.5px] text-white/40 font-mono uppercase tracking-wider mb-1">Atalhos Operacionais</p>
             <div class="grid grid-cols-2 gap-2">
               <!-- Novo Levantamento -->
               <button id="btn-quick-levantamento" class="p-2.5 bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 hover:border-mint-vibrant/40 rounded-xl flex flex-col items-start gap-1.5 transition-all group text-left cursor-pointer">
                 <div class="w-7 h-7 rounded-lg bg-mint-vibrant/10 border border-mint-vibrant/20 flex items-center justify-center text-mint-vibrant group-hover:scale-105 transition-transform">
                   <i data-lucide="map-pin" class="w-3.5 h-3.5"></i>
                 </div>
                 <div>
                   <strong class="text-xs text-white group-hover:text-mint-vibrant font-bold block leading-snug">Levantamentos</strong>
                   <span class="text-[9.5px] text-white/40 block leading-tight">Projetos & RINEX</span>
                 </div>
               </button>

               <!-- Novo Cliente -->
               <button id="btn-quick-cliente" class="p-2.5 bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 hover:border-blue-500/40 rounded-xl flex flex-col items-start gap-1.5 transition-all group text-left cursor-pointer">
                 <div class="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-105 transition-transform">
                   <i data-lucide="users" class="w-3.5 h-3.5"></i>
                 </div>
                 <div>
                   <strong class="text-xs text-white group-hover:text-blue-400 font-bold block leading-snug">Clientes</strong>
                   <span class="text-[9.5px] text-white/40 block leading-tight">Cadastros & Docs</span>
                 </div>
               </button>

               <!-- Nova Propriedade -->
               <button id="btn-quick-propriedade" class="p-2.5 bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 hover:border-purple-500/40 rounded-xl flex flex-col items-start gap-1.5 transition-all group text-left cursor-pointer">
                 <div class="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 group-hover:scale-105 transition-transform">
                   <i data-lucide="home" class="w-3.5 h-3.5"></i>
                 </div>
                 <div>
                   <strong class="text-xs text-white group-hover:text-purple-400 font-bold block leading-snug">Propriedades</strong>
                   <span class="text-[9.5px] text-white/40 block leading-tight">Imóveis & Matrículas</span>
                 </div>
               </button>

               <!-- Nuvem Hub -->
               <button id="btn-quick-nuvem-sync" class="p-2.5 bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 hover:border-emerald-500/40 rounded-xl flex flex-col items-start gap-1.5 transition-all group text-left cursor-pointer">
                 <div class="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
                   <i data-lucide="cloud" class="w-3.5 h-3.5"></i>
                 </div>
                 <div>
                   <strong class="text-xs text-white group-hover:text-emerald-400 font-bold block leading-snug">Nuvem Hub</strong>
                   <span class="text-[9.5px] text-white/40 block leading-tight">Sincronizar tempo real</span>
                 </div>
               </button>

               <!-- Organizador HGO -->
               <button id="btn-quick-hgo" class="p-2.5 bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 hover:border-amber-500/40 rounded-xl flex flex-col items-start gap-1.5 transition-all group text-left cursor-pointer">
                 <div class="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
                   <i data-lucide="folder-tree" class="w-3.5 h-3.5"></i>
                 </div>
                 <div>
                   <strong class="text-xs text-white group-hover:text-amber-400 font-bold block leading-snug">Organizador HGO</strong>
                   <span class="text-[9.5px] text-white/40 block leading-tight">Triagem GNSS & RPA</span>
                 </div>
               </button>

               <!-- Banco CCIR -->
               <button id="btn-quick-ccir" class="p-2.5 bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 hover:border-cyan-500/40 rounded-xl flex flex-col items-start gap-1.5 transition-all group text-left cursor-pointer">
                 <div class="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
                   <i data-lucide="database" class="w-3.5 h-3.5"></i>
                 </div>
                 <div>
                   <strong class="text-xs text-white group-hover:text-cyan-400 font-bold block leading-snug">Banco CCIR</strong>
                   <span class="text-[9.5px] text-white/40 block leading-tight">Acervo cadastral</span>
                 </div>
               </button>
             </div>

             <!-- Banner de Dica Técnica -->
             <div class="mt-3 p-2.5 bg-white/[0.015] border border-white/5 rounded-xl text-[10.5px] text-white/50 flex items-start gap-2">
               <i data-lucide="shield-check" class="w-3.5 h-3.5 text-mint-vibrant shrink-0 mt-0.5"></i>
               <p class="leading-relaxed">
                 O <strong>Action Center</strong> audita em tempo real arquivos RINEX, divisas órfãs, dados cartoriais e sincronização com a Nuvem Hub.
               </p>
             </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Rápido de Criação de Tarefa/Pendência -->
    <ui-modal id="modal-nova-tarefa-rapida" titulo="Nova Tarefa Operacional" tamanho="medio">
      <div class="p-4 space-y-3.5 text-xs">
        <div>
          <label class="block font-semibold text-white/80 mb-1">Título da Tarefa <span class="text-red-400">*</span></label>
          <input type="text" id="input-nova-tarefa-titulo" placeholder="Ex: Conferir confrontantes da Fazenda Santa Maria" class="glass-input w-full text-xs py-2 px-3">
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-semibold text-white/80 mb-1">Prioridade</label>
            <select id="select-nova-tarefa-prioridade" class="glass-input w-full text-xs py-2 px-3">
              <option value="ALTA">Alta (Urgente)</option>
              <option value="MEDIA" selected>Média</option>
              <option value="BAIXA">Baixa</option>
            </select>
          </div>
          <div>
            <label class="block font-semibold text-white/80 mb-1">Prazo (opcional)</label>
            <input type="date" id="input-nova-tarefa-prazo" class="glass-input w-full text-xs py-2 px-3">
          </div>
        </div>
        <div>
          <label class="block font-semibold text-white/80 mb-1">Descrição / Detalhes (opcional)</label>
          <textarea id="textarea-nova-tarefa-descricao" rows="3" placeholder="Informações adicionais para a equipe de campo ou escritório..." class="glass-input w-full text-xs p-3"></textarea>
        </div>
      </div>
      <div slot="rodape" class="flex items-center justify-end gap-2 p-3 border-t border-white/5 w-full">
        <button id="btn-cancelar-nova-tarefa" class="btn-secondary text-xs py-1.5 px-3">Cancelar</button>
        <button id="btn-salvar-nova-tarefa" class="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5">
          <i data-lucide="check" class="w-3.5 h-3.5"></i>
          Salvar Tarefa
        </button>
      </div>
    </ui-modal>

    <!-- Modal de Detalhes de Parcela SIGEF -->
    <ui-modal id="parcel-modal" titulo="Informações da Parcela SIGEF" tamanho="medio">
      <div id="modal-content" class="p-4 text-xs space-y-4">
         <p class="text-white/40 text-center py-4">Carregando dados da parcela...</p>
      </div>
      <div id="modal-footer" slot="rodape" class="flex items-center justify-between w-full gap-2 hidden">
         <a id="sigef-shp-link" target="_blank" rel="noopener noreferrer" class="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 text-mint-vibrant border-mint-vibrant/30 hover:bg-mint-vibrant/10">
            <i data-lucide="download" class="w-3.5 h-3.5"></i>
            Shapefile (.ZIP)
         </a>
         <a id="sigef-link" target="_blank" rel="noopener noreferrer" class="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5">
            <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
            Abrir no SIGEF/INCRA
         </a>
      </div>
    </ui-modal>

  `;
}
