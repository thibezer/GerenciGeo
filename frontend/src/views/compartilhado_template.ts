export const renderCompartilhado = (): string => {
  return `
    <style>
      .pub-root { position: fixed; inset: 0; z-index: 40; }
      .pub-main { display: grid; grid-template-columns: 300px 1fr; height: calc(100% - 52px); }
      .pub-painel-tabelas { height: 260px; min-height: 120px; max-height: 60vh; }
      .pub-fechar-tabelas { display: none; }
      @media (max-width: 767px) {
        .pub-main { display: flex; flex-direction: column; }
        .pub-content { position: static !important; order: 1; min-height: 0; flex: 1 1 auto; }
        .pub-side { order: 2; width: 100% !important; max-height: 46%; flex: 0 1 auto; border-right: 0 !important; border-top: 1px solid rgba(255,255,255,.12); border-radius: 16px 16px 0 0; margin-top: -12px; box-shadow: 0 -8px 24px rgba(0,0,0,.45); padding-bottom: env(safe-area-inset-bottom); }
        .pub-side #badge-total-vertices { display: none; }
        .pub-header-extra { display: none !important; }
        /* Tabelas viram uma folha em tela cheia sobre o mapa */
        #area-tabelas-publico { position: absolute; inset: 0; z-index: 30; background: #080d0a; }
        #area-tabelas-publico .row-splitter { display: none; }
        #area-tabelas-publico .pub-painel-tabelas { height: 100%; max-height: none; flex: 1 1 auto; border-top: 0; }
        #area-tabelas-publico table { min-width: 560px; }
        #input-busca-ponto-publico { width: 100%; }
        .pub-busca { flex: 1 1 100%; }
        .pub-fechar-tabelas { display: inline-flex; }
      }
    </style>
    <div class="pub-root workspace-wrapper animate-in fade-in duration-300 w-full flex flex-col bg-[#080d0a] text-white overflow-hidden font-sans relative">

      <!-- CABEÇALHO -->
      <header class="bg-[#101713] border-b border-white/10 shrink-0 px-4 flex items-center justify-between gap-3 shadow-md relative z-20" style="height: 52px; min-height: 52px;">
        <div class="flex items-center gap-2 min-w-0">
          <i data-lucide="map-pin" class="w-4 h-4 shrink-0 text-mint-vibrant"></i>
          <div class="min-w-0 leading-tight">
            <div class="text-sm font-bold text-white truncate" id="txt-nome-propriedade-publico">Carregando imóvel...</div>
            <div class="text-[11px] text-white/50 truncate">
              <span id="txt-municipio-publico">—</span>
              <span class="pub-header-extra"> • Proprietário(s): <span id="txt-nome-cliente-publico" class="text-white/80">—</span></span>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button id="btn-alternar-tabelas" class="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-white/80 border border-white/15 rounded text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer">
            <i data-lucide="list" class="w-3.5 h-3.5"></i>
            <span class="hidden sm:inline">Tabela de vértices</span><span class="sm:hidden">Vértices</span>
          </button>
          <button id="btn-exportar-csv-publico" title="Baixar planilha de vértices em CSV" aria-label="Baixar planilha de vértices em CSV"
                  class="px-2.5 py-1.5 bg-mint-vibrant/10 hover:bg-mint-vibrant/20 text-mint-vibrant border border-mint-vibrant/30 rounded text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer">
            <i data-lucide="download" class="w-3.5 h-3.5"></i>
            <span class="hidden sm:inline">Baixar CSV</span>
          </button>
        </div>
      </header>

      <main class="pub-main flex-1 relative overflow-hidden">
        <!-- PAINEL LATERAL: RESUMO DO IMÓVEL / DETALHE DO VÉRTICE -->
        <aside class="pub-side flex flex-col bg-[#0a100d]/95 border-r border-white/10 shadow-2xl z-10 overflow-hidden" id="painel-lateral-propriedades" style="width: 300px;">
          <div class="p-3 border-b border-white/10 bg-white/[0.02] flex items-center justify-between shrink-0">
            <h3 class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2" id="titulo-painel-lateral">
              <i data-lucide="info" class="w-4 h-4 text-mint-vibrant"></i>
              Resumo do imóvel
            </h3>
            <span id="badge-total-vertices" class="text-[10px] font-mono text-mint-vibrant bg-mint-vibrant/10 border border-mint-vibrant/20 px-2 py-0.5 rounded-full">0 vértices</span>
          </div>
          <div class="p-3 space-y-3 text-xs flex-1 overflow-y-auto" id="container-props-ponto"></div>
        </aside>

        <!-- MAPA + TABELAS -->
        <div class="pub-content flex flex-col h-full overflow-hidden relative">
          <div class="relative flex-1 min-h-[200px]" id="container-mapa-publico">
            <ui-canvas-cad id="map-container" class="mapa-leaflet-canvas w-full h-full" canal-configuracao="gerencigeo_map_config"></ui-canvas-cad>
          </div>

          <!-- Tabelas recolhidas por padrão: o cliente vê primeiro o mapa -->
          <div id="area-tabelas-publico" class="hidden flex-col shrink-0">
            <div class="row-splitter cursor-row-resize h-1.5 bg-white/10 hover:bg-mint-vibrant transition-colors shrink-0" id="resizer-tabelas-inferior"></div>
            <div id="painel-inferior-tabelas" class="pub-painel-tabelas flex flex-col bg-[#080d0a] border-t border-white/10">
              <div class="flex items-center justify-between px-3 py-1.5 border-b border-white/10 bg-[#0d1410] shrink-0 gap-2 flex-wrap">
                <div class="flex items-center gap-1">
                  <button id="btn-fechar-tabelas" class="pub-fechar-tabelas items-center gap-1 mr-1 px-2 py-1 rounded bg-white/10 text-xs font-semibold text-white" aria-label="Voltar ao mapa"><i data-lucide="map" class="w-3.5 h-3.5"></i>Mapa</button>
                  <button class="px-3 py-1 text-xs font-bold uppercase tracking-wider border-b-2 border-mint-vibrant text-mint-vibrant tab-btn-publico transition-all" data-target="tab-content-organizador">Perímetro</button>
                  <button class="px-3 py-1 text-xs font-bold uppercase tracking-wider border-b-2 border-transparent text-white/40 hover:text-white tab-btn-publico transition-all" data-target="tab-content-todos-pontos">Todos os vértices</button>
                </div>
                <div class="relative flex items-center pub-busca">
                  <i data-lucide="search" class="w-3.5 h-3.5 absolute left-2.5 text-white/40 pointer-events-none"></i>
                  <input id="input-busca-ponto-publico" type="text" placeholder="Localizar vértice..."
                         class="bg-black/40 border border-white/15 rounded-md pl-8 pr-7 py-1 text-xs text-white placeholder-white/30 focus:outline-none focus:border-mint-vibrant w-52 font-mono" />
                  <button id="btn-limpar-busca-publico" class="absolute right-2 text-white/30 hover:text-white hidden" aria-label="Limpar busca">
                    <i data-lucide="x" class="w-3.5 h-3.5"></i>
                  </button>
                </div>
              </div>
              <div class="flex-1 overflow-hidden relative">
                <div id="tab-content-organizador" class="absolute inset-0 overflow-auto tab-pane-publico">
                  <table class="w-full text-left text-xs border-collapse">
                    <thead class="bg-black/80 backdrop-blur sticky top-0 z-10">
                      <tr class="text-[11px] text-white/60 uppercase border-b border-white/10 tracking-wider">
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
                <div id="tab-content-todos-pontos" class="absolute inset-0 overflow-auto hidden tab-pane-publico">
                  <table class="w-full text-left text-xs border-collapse">
                    <thead class="bg-black/80 backdrop-blur sticky top-0 z-10">
                      <tr class="text-[11px] text-white/60 uppercase border-b border-white/10 tracking-wider">
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
        </div>
      </main>

      <!-- TELA DE ESTADO: PIN, LINK EXPIRADO/INVÁLIDO, ERRO -->
      <div id="pub-estado" class="hidden absolute inset-0 z-50 bg-[#080d0a] flex items-center justify-center p-6">
        <div class="w-full max-w-sm text-center space-y-4" id="pub-estado-conteudo"></div>
      </div>
    </div>
  `;
};
