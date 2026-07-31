export const renderCompartilhado = (): string => {
  return `
    <div class="workspace-wrapper animate-in fade-in duration-300 h-screen w-full flex flex-col bg-[#0a100d] text-white">
      <header class="ribbon-master-container fluent-ribbon-theme shrink-0">
        <div id="ribbon-layer1" class="ribbon-layer1 flex items-center px-4 py-2 bg-black/40 border-b border-white/10">
           <div class="rl1-qat flex items-center gap-3">
               <i data-lucide="share-2" class="text-mint-vibrant"></i>
               <span class="font-bold text-sm tracking-wider uppercase">GerenciGeo Online <span class="text-white/40 text-xs ml-2 normal-case">Visualização Pública</span></span>
           </div>
           <div class="rl1-spacer flex-1"></div>
           <div class="rl1-context flex items-center gap-3">
             <label class="text-[10px] text-white/40 uppercase font-bold">Matrícula</label>
             <select id="select-matricula-publico" class="glass-input text-xs py-1 px-2 pr-8 border border-white/10 rounded bg-[#0a100d]" style="min-width:140px">
                <option value="">Carregando...</option>
             </select>
           </div>
        </div>
        <div id="ribbon-layer2" class="ribbon-layer2 flex items-center px-4 py-1.5 bg-black/20 border-b border-white/5 text-xs">
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

      <div class="workspace-body flex flex-col relative overflow-hidden flex-1">
         <div class="flex-1 flex overflow-hidden w-full max-w-full relative">
            <main class="flex-1 relative flex flex-col overflow-hidden min-w-0" id="main-content-area">
               <div id="map-container" class="absolute inset-0 z-0 bg-[#0a100d]"></div>
            </main>
            
            <div id="resizer-propriedades" class="w-1.5 bg-black/40 hover:bg-mint-vibrant/50 cursor-col-resize z-20 shrink-0 transition-colors"></div>
            <aside id="painel-lateral-propriedades" class="w-80 border-l border-white/10 flex flex-col shrink-0 z-10 bg-[#0a100d]/90 backdrop-blur" style="min-width:280px; max-width:600px;">
               <div class="p-3 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                  <h3 class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                     <i data-lucide="info" class="w-4 h-4 text-mint-vibrant"></i>
                     Propriedades
                  </h3>
               </div>
               <div class="flex-1 overflow-y-auto p-4 space-y-4 text-xs" id="container-props-ponto">
                  <div class="text-center text-white/30 italic mt-8">Selecione um vértice ou segmento no mapa ou tabela.</div>
               </div>
            </aside>
         </div>
         
         <div id="resizer-tabelas-inferior" class="h-1.5 bg-black/40 hover:bg-mint-vibrant/50 cursor-row-resize z-20 w-full shrink-0 transition-colors"></div>
         <div id="painel-inferior-tabelas" class="h-64 border-t border-white/10 flex flex-col shrink-0 z-10 bg-[#0a100d]" style="min-height: 150px; max-height: 60vh;">
            <div class="flex border-b border-white/5 bg-white/[0.01]">
                <button class="px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 border-mint-vibrant text-mint-vibrant tab-btn-publico" data-target="tab-content-organizador">Organizador Perimetral</button>
                <button class="px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 border-transparent text-white/40 hover:text-white tab-btn-publico" data-target="tab-content-todos-pontos">Todos os Pontos</button>
            </div>
            
            <div class="flex-1 overflow-hidden relative">
                <div id="tab-content-organizador" class="absolute inset-0 overflow-auto tab-pane-publico">
                   <table class="w-full text-left text-xs border-collapse">
                      <thead class="bg-black/40 sticky top-0 z-10">
                        <tr class="text-[10px] text-white/50 uppercase">
                           <th class="px-3 py-2 font-bold w-12 text-center">Ord</th>
                           <th class="px-3 py-2 font-bold w-24">Vértice</th>
                           <th class="px-3 py-2 font-bold w-28">Norte (Y)</th>
                           <th class="px-3 py-2 font-bold w-28">Este (X)</th>
                           <th class="px-3 py-2 font-bold">Confrontante</th>
                           <th class="px-3 py-2 font-bold w-24 text-center">Azimute</th>
                           <th class="px-3 py-2 font-bold w-20 text-center">Dist (m)</th>
                        </tr>
                      </thead>
                      <tbody id="tbody-organizador-publico" class="divide-y divide-white/5 text-white/80"></tbody>
                   </table>
                </div>
                
                <div id="tab-content-todos-pontos" class="absolute inset-0 overflow-auto hidden tab-pane-publico">
                   <table class="w-full text-left text-xs border-collapse">
                      <thead class="bg-black/40 sticky top-0 z-10">
                        <tr class="text-[10px] text-white/50 uppercase">
                           <th class="px-3 py-2 font-bold w-24">Vértice</th>
                           <th class="px-3 py-2 font-bold w-16 text-center">Tipo</th>
                           <th class="px-3 py-2 font-bold w-28">Norte (Y)</th>
                           <th class="px-3 py-2 font-bold w-28">Este (X)</th>
                           <th class="px-3 py-2 font-bold w-24">Altitude</th>
                        </tr>
                      </thead>
                      <tbody id="tbody-todos-pontos-publico" class="divide-y divide-white/5 text-white/80"></tbody>
                   </table>
                </div>
            </div>
         </div>
      </div>
    </div>
  `;
};
