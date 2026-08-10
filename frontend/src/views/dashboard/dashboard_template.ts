/**
 * dashboard_template.ts — Marcação HTML da tela Panorama Operacional / Dashboard.
 */
export function renderDashboardTemplate(): string {
  return `
    <div class="space-y-2.5 sm:space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col h-full">
      <!-- Topo Ultra Compacto (Altura Max ~45px) -->
      <div class="flex justify-between items-center h-8 sm:h-10 border-b border-white/5 pb-1.5 sm:pb-2 order-first shrink-0">
        <div>
          <h2 class="text-base sm:text-lg font-bold tracking-tight text-white leading-none">Panorama Operacional</h2>
          <p class="text-white/40 text-[9px] mt-1 hidden sm:block">Painel de comando GerenciGeo.</p>
        </div>
        <div class="flex items-center gap-2 text-right">
          <span class="text-[9px] font-mono text-white/20 uppercase tracking-widest hidden sm:inline">Status da API</span>
          <ui-badge id="api-status" variante="sucesso">Conectando...</ui-badge>
        </div>
      </div>

      <!-- Cards de KPIs Super Compactos -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 order-3 sm:order-2 shrink-0">
        <!-- Clientes -->
        <ui-card elevacao="baixa" class="h-12 sm:h-13 flex items-center">
          <div class="px-3 flex items-center gap-2.5 w-full">
            <div class="p-1 bg-mint-vibrant/10 rounded-technical shrink-0">
              <i data-lucide="database" class="w-3.5 h-3.5 text-mint-vibrant"></i>
            </div>
            <div class="min-w-0">
              <p class="text-white/40 text-[8px] sm:text-[9px] uppercase tracking-wider font-semibold truncate">Clientes</p>
              <h3 class="text-sm sm:text-base font-bold tracking-tight text-white leading-none mt-0.5" id="stat-clientes">--</h3>
            </div>
          </div>
        </ui-card>

        <!-- Propriedades -->
        <ui-card elevacao="baixa" class="h-12 sm:h-13 flex items-center">
          <div class="px-3 flex items-center gap-2.5 w-full">
            <div class="p-1 bg-blue-500/10 rounded-technical shrink-0">
              <i data-lucide="map-pin" class="w-3.5 h-3.5 text-blue-500"></i>
            </div>
            <div class="min-w-0">
              <p class="text-white/40 text-[8px] sm:text-[9px] uppercase tracking-wider font-semibold truncate">Propriedades</p>
              <h3 class="text-sm sm:text-base font-bold tracking-tight text-white leading-none mt-0.5" id="stat-prop">--</h3>
            </div>
          </div>
        </ui-card>

        <!-- Profissionais -->
        <ui-card elevacao="baixa" class="h-12 sm:h-13 flex items-center">
          <div class="px-3 flex items-center gap-2.5 w-full">
            <div class="p-1 bg-purple-500/10 rounded-technical shrink-0">
              <i data-lucide="activity" class="w-3.5 h-3.5 text-purple-500"></i>
            </div>
            <div class="min-w-0">
              <p class="text-white/40 text-[8px] sm:text-[9px] uppercase tracking-wider font-semibold truncate">Profissionais</p>
              <h3 class="text-sm sm:text-base font-bold tracking-tight text-white leading-none mt-0.5" id="stat-prof">--</h3>
            </div>
          </div>
        </ui-card>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 flex-1 lg:h-[calc(100vh-140px)] lg:max-h-[calc(100vh-140px)] order-2 sm:order-3">
        <!-- Leaflet Map Container -->
        <div class="lg:col-span-2 glass-card h-[400px] sm:h-[450px] lg:h-full relative overflow-hidden border-white/5" id="map-container">
           <div id="map" class="w-full h-full"></div>
        </div>

        <!-- Action Center -->
        <ui-card elevacao="baixa" class="h-full flex flex-col min-h-0 overflow-hidden" style="height: 100%;">
          <div class="p-3 sm:p-4 border-b border-white/5 flex justify-between items-center shrink-0">
             <h4 class="text-sm sm:text-base font-bold flex items-center gap-2">
               <i data-lucide="bell" class="w-4 h-4 text-mint-vibrant"></i>
               Action Center
             </h4>
             <a href="#pendencias" class="text-[11px] text-mint-vibrant hover:underline cursor-pointer">Ver Tudo</a>
          </div>
          <div class="p-2 sm:p-3 overflow-y-auto space-y-2 flex-1 min-h-0 max-h-[350px] lg:max-h-[calc(100vh-210px)]" id="alerts-container">
             <div class="text-center text-white/40 text-xs py-4">Carregando alertas...</div>
          </div>
        </ui-card>
      </div>
    </div>

    <!-- Modal de Detalhes de Parcela SIGEF -->
    <ui-modal id="parcel-modal" titulo="Informações da Parcela SIGEF" tamanho="medio">
      <div id="modal-content" class="p-4 text-xs space-y-4">
         <p class="text-white/40 text-center py-4">Carregando dados da parcela...</p>
      </div>
      <div id="modal-footer" slot="rodape" class="flex justify-end gap-2 hidden">
         <a id="sigef-link" target="_blank" class="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5">
            <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
            Abrir no SIGEF/INCRA
         </a>
      </div>
    </ui-modal>
  `;
}
