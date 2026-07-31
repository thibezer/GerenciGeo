export const renderCompartilhado = (): string => {
  return `
    <div class="workspace-wrapper animate-in fade-in duration-300 h-screen w-full flex flex-col bg-[#080d0a] text-white overflow-hidden font-sans">
      <!-- HEADER COMPACTO E CLEAN (SEM MATRÍCULA E SEM TEXTOS DESNECESSÁRIOS) -->
      <header class="bg-[#101713] border-b border-white/10 shrink-0 px-4 flex items-center justify-between shadow-md relative z-20" style="height: 46px; min-height: 46px;">
        <div class="flex items-center gap-3 text-xs text-white/70 truncate w-full">
           <div class="flex items-center gap-1.5 text-mint-vibrant font-bold shrink-0 text-sm" id="txt-nome-propriedade-publico">
              <i data-lucide="map-pin" class="w-4 h-4 shrink-0 text-mint-vibrant"></i>
              <span class="truncate">Carregando imóvel...</span>
           </div>
           <span class="text-white/20">•</span>
           <div class="flex items-center gap-1 truncate max-w-[320px]">
             <span class="text-white/40">Proprietário(s):</span>
             <span class="text-white font-medium truncate" id="txt-nome-cliente-publico">—</span>
           </div>
           <span class="text-white/20">•</span>
           <div class="flex items-center gap-1 shrink-0">
             <span class="text-white/40">CAR:</span>
             <span class="text-white/90 font-mono text-[11px]" id="txt-codigo-car-publico">—</span>
           </div>
           <span class="text-white/20">•</span>
           <div class="flex items-center gap-1 shrink-0">
             <span class="text-white/40">Município:</span>
             <span class="text-white/90" id="txt-municipio-publico">—</span>
           </div>
        </div>
      </header>

      <!-- ÁREA PRINCIPAL DA MESA DE TRABALHO -->
      <main class="workspace-body flex-1 relative overflow-hidden" style="height: calc(100vh - 46px) !important; display: grid !important; grid-template-columns: 290px 1fr !important;">
        <!-- PAINEL DE PROPRIEDADES LATERAL (Esquerda) -->
        <aside class="props-panel flex flex-col bg-[#0a100d]/95 border-r border-white/10 shadow-2xl z-10" id="painel-lateral-propriedades" style="width: 290px;">
          <div class="props-panel-header p-3 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
             <h3 class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <i data-lucide="info" class="w-4 h-4 text-mint-vibrant"></i>
                Detalhes do Vértice
             </h3>
             <span id="badge-total-vertices" class="text-[10px] font-mono text-mint-vibrant bg-mint-vibrant/10 border border-mint-vibrant/20 px-2 py-0.5 rounded-full">0 Vértices</span>
          </div>
          
          <div class="props-panel-body p-4 space-y-4 text-xs flex-1 overflow-y-auto" id="container-props-ponto">
             <div class="flex flex-col items-center justify-center text-center text-white/30 italic py-12 px-4 gap-3">
                <div class="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/20">
                    <i data-lucide="crosshair" class="w-6 h-6"></i>
                </div>
                <span>Clique em um vértice no mapa ou na tabela abaixo para inspecionar as coordenadas e confrontações.</span>
             </div>
          </div>
        </aside>

        <!-- ÁREA DO MAPA E TABELAS (Direita) -->
        <div class="workspace-main-content flex flex-col h-full overflow-hidden relative">

          <!-- Superior: Canvas do Mapa Leaflet -->
          <div class="map-container-wrapper relative flex-1 min-h-[220px]" id="container-mapa-publico">
             <div id="map-container" class="mapa-leaflet-canvas w-full h-full"></div>
          </div>

          <!-- Splitter de redimensionamento de tabelas -->
          <div class="row-splitter cursor-row-resize h-1.5 bg-white/10 hover:bg-mint-vibrant transition-colors shrink-0" id="resizer-tabelas-inferior"></div>

          <!-- ABA INFERIOR: TABELAS E LOCALIZADOR DE PONTO -->
          <div id="painel-inferior-tabelas" class="flex flex-col shrink-0 bg-[#080d0a] border-t border-white/10" style="height: 250px; min-height: 120px; max-height: 60vh;">
             
             <!-- BARRA SUPERIOR DAS TABELAS COM CAMPO LOCALIZADOR -->
             <div class="flex items-center justify-between px-3 py-1.5 border-b border-white/10 bg-[#0d1410] shrink-0 gap-2">
                 <div class="flex items-center gap-1">
                     <button class="px-3 py-1 text-xs font-bold uppercase tracking-wider border-b-2 border-mint-vibrant text-mint-vibrant tab-btn-publico transition-all" data-target="tab-content-organizador">Organizador Perimetral</button>
                     <button class="px-3 py-1 text-xs font-bold uppercase tracking-wider border-b-2 border-transparent text-white/40 hover:text-white tab-btn-publico transition-all" data-target="tab-content-todos-pontos">Todos os Vértices</button>
                 </div>
                 
                 <!-- LOCALIZADOR DE PONTO (PESQUISA EM TEMPO REAL) -->
                 <div class="flex items-center gap-2">
                    <div class="relative flex items-center">
                        <i data-lucide="search" class="w-3.5 h-3.5 absolute left-2.5 text-white/40 pointer-events-none"></i>
                        <input id="input-busca-ponto-publico" type="text" placeholder="Localizar vértice (ex: XRXR-V-0036)..." 
                               class="bg-black/40 border border-white/15 rounded-md pl-8 pr-7 py-1 text-xs text-white placeholder-white/30 focus:outline-none focus:border-mint-vibrant focus:ring-1 focus:ring-mint-vibrant/50 transition-all w-64 font-mono" />
                        <button id="btn-limpar-busca-publico" class="absolute right-2 text-white/30 hover:text-white hidden">
                            <i data-lucide="x" class="w-3.5 h-3.5"></i>
                        </button>
                    </div>
                 </div>
             </div>
             
             <!-- CONTEÚDO DAS TABELAS -->
             <div class="flex-1 overflow-hidden relative">
                 <!-- TABELA 1: ORGANIZADOR PERIMETRAL -->
                 <div id="tab-content-organizador" class="absolute inset-0 overflow-auto tab-pane-publico">
                    <table class="w-full text-left text-xs border-collapse">
                       <thead class="bg-black/80 backdrop-blur sticky top-0 z-10">
                         <tr class="text-[10px] text-white/50 uppercase border-b border-white/10 tracking-wider">
                            <th class="px-3 py-2 font-bold w-12 text-center">Ord</th>
                            <th class="px-3 py-2 font-bold w-32">Vértice</th>
                            <th class="px-3 py-2 font-bold w-36">Norte (Y)</th>
                            <th class="px-3 py-2 font-bold w-36">Este (X)</th>
                            <th class="px-3 py-2 font-bold">Confrontante</th>
                            <th class="px-3 py-2 font-bold w-28 text-center">Dist (m)</th>
                         </tr>
                       </thead>
                       <tbody id="tbody-organizador-publico" class="divide-y divide-white/5 text-white/80"></tbody>
                    </table>
                 </div>
                 
                 <!-- TABELA 2: TODOS OS PONTOS -->
                 <div id="tab-content-todos-pontos" class="absolute inset-0 overflow-auto hidden tab-pane-publico">
                    <table class="w-full text-left text-xs border-collapse">
                       <thead class="bg-black/80 backdrop-blur sticky top-0 z-10">
                         <tr class="text-[10px] text-white/50 uppercase border-b border-white/10 tracking-wider">
                            <th class="px-3 py-2 font-bold w-32">Vértice</th>
                            <th class="px-3 py-2 font-bold w-20 text-center">Tipo</th>
                            <th class="px-3 py-2 font-bold w-36">Norte (Y)</th>
                            <th class="px-3 py-2 font-bold w-36">Este (X)</th>
                            <th class="px-3 py-2 font-bold w-28 text-center">Altitude (m)</th>
                         </tr>
                       </thead>
                       <tbody id="tbody-todos-pontos-publico" class="divide-y divide-white/5 text-white/80"></tbody>
                    </table>
                 </div>
             </div>
          </div>

        </div>
      </main>
    </div>
  `;
};
