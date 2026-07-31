export const renderCompartilhado = (): string => {
  return `
    <div class="workspace-wrapper animate-in fade-in duration-300 h-screen w-full flex flex-col bg-[#0a100d] text-white overflow-hidden">
      <header class="ribbon-master-container fluent-ribbon-theme shrink-0">
        <div id="ribbon-layer1" class="ribbon-layer1 flex items-center px-4 py-2 bg-black/40 border-b border-white/10" style="height: 38px;">
           <div class="rl1-qat flex items-center gap-3">
               <i data-lucide="share-2" class="text-mint-vibrant"></i>
               <span class="font-bold text-sm tracking-wider uppercase">GerenciGeo Online <span class="text-white/40 text-xs ml-2 normal-case">Visualização Pública</span></span>
           </div>
           <div class="rl1-spacer flex-1"></div>
           <div class="rl1-context flex items-center gap-3">
             <label class="text-[10px] text-white/40 uppercase font-bold">Matrícula</label>
             <select id="select-matricula-publico" class="glass-input text-xs py-1 px-2 pr-8 border border-white/10 rounded bg-[#0a100d] text-white" style="min-width:140px">
                <option value="">Carregando...</option>
             </select>
           </div>
        </div>
        <div id="ribbon-layer2" class="ribbon-layer2 flex items-center px-4 py-1.5 bg-black/20 border-b border-white/5 text-xs" style="height: 32px;">
           <span class="font-bold text-mint-vibrant truncate max-w-[300px]" id="txt-nome-propriedade-publico">Carregando...</span>
           <div class="h-4 w-px bg-white/20 mx-3"></div>
           <span class="text-white/40 flex items-center gap-1">
             <i data-lucide="users" class="w-3.5 h-3.5"></i> Proprietário(s):
             <span class="text-white ml-1 truncate max-w-[250px]" id="txt-nome-cliente-publico">—</span>
           </span>
           <div class="h-4 w-px bg-white/20 mx-3"></div>
           <span class="text-white/40 flex items-center gap-1">
             CAR:
             <span class="text-white font-mono ml-1" id="txt-codigo-car-publico">—</span>
           </span>
           <div class="h-4 w-px bg-white/20 mx-3"></div>
           <span class="text-white/40 flex items-center gap-1">
             Município:
             <span class="text-white ml-1" id="txt-municipio-publico">—</span>
           </span>
        </div>
      </header>

      <main class="workspace-body" style="height: calc(100vh - 70px) !important; display: grid !important; grid-template-columns: 280px 1fr !important;">
        <!-- PAINEL DE PROPRIEDADES LATERAL (Esquerda) -->
        <aside class="props-panel flex flex-col bg-[#0a100d]/90 border-r border-white/10" id="painel-lateral-propriedades" style="width: 280px;">
          <div class="props-panel-header p-3 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
             <h3 class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <i data-lucide="info" class="w-4 h-4 text-mint-vibrant"></i>
                Propriedades
             </h3>
          </div>
          
          <div class="props-panel-body p-4 space-y-4 text-xs flex-1 overflow-y-auto" id="container-props-ponto">
             <div class="text-center text-white/30 italic mt-8">Selecione um vértice ou segmento no mapa ou tabela.</div>
          </div>
        </aside>

        <!-- ÁREA DE TRABALHO PRINCIPAL (Centro / Direita) -->
        <div class="workspace-main-content flex flex-col h-full overflow-hidden">

          <!-- Superior: Mapa Leaflet -->
          <div class="map-container-wrapper relative flex-1 min-h-[200px]" id="container-mapa-publico">
             <div id="map-container" class="mapa-leaflet-canvas w-full h-full"></div>
          </div>

          <!-- Splitter de redimensionamento -->
          <div class="row-splitter" id="resizer-tabelas-inferior"></div>

          <!-- ABA: Tabelas em baixo -->
          <div id="painel-inferior-tabelas" class="flex flex-col shrink-0 bg-[#0a100d] border-t border-white/10" style="height: 240px; min-height: 120px; max-height: 60vh;">
             <div class="flex border-b border-white/5 bg-white/[0.01]">
                 <button class="px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 border-mint-vibrant text-mint-vibrant tab-btn-publico" data-target="tab-content-organizador">Organizador Perimetral</button>
                 <button class="px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 border-transparent text-white/40 hover:text-white tab-btn-publico" data-target="tab-content-todos-pontos">Todos os Pontos</button>
             </div>
             
             <div class="flex-1 overflow-hidden relative">
                 <div id="tab-content-organizador" class="absolute inset-0 overflow-auto tab-pane-publico">
                    <table class="w-full text-left text-xs border-collapse">
                       <thead class="bg-black/40 sticky top-0 z-10">
                         <tr class="text-[10px] text-white/50 uppercase border-b border-white/10">
                            <th class="px-3 py-2 font-bold w-14 text-center">Ord</th>
                            <th class="px-3 py-2 font-bold w-28">Vértice</th>
                            <th class="px-3 py-2 font-bold w-36">Norte (Y)</th>
                            <th class="px-3 py-2 font-bold w-36">Este (X)</th>
                            <th class="px-3 py-2 font-bold">Confrontante</th>
                            <th class="px-3 py-2 font-bold w-28 text-center">Dist (m)</th>
                         </tr>
                       </thead>
                       <tbody id="tbody-organizador-publico" class="divide-y divide-white/5 text-white/80"></tbody>
                    </table>
                 </div>
                 
                 <div id="tab-content-todos-pontos" class="absolute inset-0 overflow-auto hidden tab-pane-publico">
                    <table class="w-full text-left text-xs border-collapse">
                       <thead class="bg-black/40 sticky top-0 z-10">
                         <tr class="text-[10px] text-white/50 uppercase border-b border-white/10">
                            <th class="px-3 py-2 font-bold w-28">Vértice</th>
                            <th class="px-3 py-2 font-bold w-24 text-center">Tipo</th>
                            <th class="px-3 py-2 font-bold w-36">Norte (Y)</th>
                            <th class="px-3 py-2 font-bold w-36">Este (X)</th>
                            <th class="px-3 py-2 font-bold w-24">Altitude (m)</th>
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
