/**
 * Componente de Template Estático para a Mesa de Trabalho do GerenciGeo
 * 
 * Contém todo o layout HTML inicial, cabeçalho sticky, mapa Leaflet, dropzones,
 * barras de ferramentas, tabelas inferiores e modais de override e controle.
 */
export const METODOS_SIGEF_OPTIONS = `
    <option value="PG1">PG1 - Posicionamento GNSS - Relativo</option>
    <option value="PG2">PG2 - Posicionamento GNSS - Absoluto</option>
    <option value="PT1">PT1 - Poligonação</option>
    <option value="PT2">PT2 - Irradiação</option>
`;

export const REGIMES_BENS_OPTIONS = `
    <option value="Comunhão Parcial de Bens">Comunhão Parcial de Bens</option>
    <option value="Comunhão Universal de Bens">Comunhão Universal de Bens</option>
    <option value="Separação Total de Bens">Separação Total de Bens</option>
    <option value="Separação Obrigatória de Bens">Separação Obrigatória de Bens</option>
`;

export const renderMesaTrabalho = (): string => {
   return `
    <div class="space-y-6 animate-in fade-in duration-300">
      <!-- DETALHES DO PROJETO E TRIAGEM -->
      <div id="painel-detalhe-projeto" class="space-y-4">
        <!-- Cabeçalho de Ação Sticky e Condensado -->
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-forest-deep/80 backdrop-blur-md border border-white/5 py-2.5 px-4 rounded-xl shadow-lg flex-wrap" id="mesa-trabalho-header">
          <div class="flex items-center gap-3.5">
            <button class="btn-secondary px-2.5 py-1.5 text-xs flex items-center gap-1 hover:bg-white/10 active:scale-95 transition-all duration-200" id="btn-voltar-lista">
              <i data-lucide="chevron-left" class="w-4 h-4"></i>
              Voltar
            </button>
            <div class="w-[1px] h-7 bg-white/10 self-center hidden sm:block"></div>
            <div>
              <h3 class="text-sm md:text-base font-bold flex items-center gap-2 leading-snug">
                <span id="txt-nome-propriedade" class="text-white hover:text-mint-vibrant transition-colors">Carregando...</span>
                <span class="text-[9px] bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/25 px-2 py-0.5 rounded-full font-mono uppercase tracking-wider font-semibold" id="badge-status-lev">-</span>
              </h3>
              <p class="text-xs text-white/40 mt-1 dados-secundarios-cliente leading-snug flex items-center flex-wrap gap-x-3 gap-y-1">
                <span class="flex items-center gap-1">
                  <span class="text-white/30 uppercase tracking-widest text-[9px]">Cliente:</span>
                  <span class="text-white/75 font-medium" id="txt-nome-cliente">-</span>
                </span>
                <span class="text-white/10 hidden sm:inline">•</span>
                <span class="flex items-center gap-1">
                  <span class="text-white/30 uppercase tracking-widest text-[9px]">CAR:</span>
                  <span class="text-white/75 font-mono" id="txt-codigo-car">-</span>
                </span>
              </p>
            </div>
          </div>
          
          <!-- Seletor de Matrículas (Abas de Triagem) -->
          <div class="flex bg-white/5 border border-white/10 p-0.5 rounded-md overflow-x-auto self-start md:self-auto" id="container-abas-matriculas">
            <!-- Abas carregadas dinamicamente -->
          </div>

          <!-- Seletor de Etapas de Trabalho (Ajuste Fino V2.3) -->
          <div class="flex bg-white/[0.02] border border-white/10 p-1 rounded-xl gap-1.5 shrink-0 overflow-x-auto" id="container-abas-etapas">
            <button class="flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/25 shadow-[0_0_12px_rgba(0,245,160,0.06)] flex items-center justify-center gap-2 whitespace-nowrap active:scale-95" id="btn-etapa-geoprocessamento" type="button">
              <i data-lucide="cpu" class="w-4 h-4"></i>
              Mesa Geodésica
            </button>
            <button class="flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95" id="btn-etapa-cartorio" type="button">
              <i data-lucide="database" class="w-4 h-4"></i>
              Organizador de Perímetro
            </button>
            <button class="flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95" id="btn-etapa-documentos" type="button">
              <i data-lucide="file-text" class="w-4 h-4"></i>
              Peças de Cartório
            </button>
            <button class="flex-grow py-3 px-4 md:py-1.5 md:px-3.5 text-xs font-bold text-center rounded-lg transition-all btn-etapa-tab text-white/40 hover:text-white hover:bg-white/[0.03] border border-transparent flex items-center justify-center gap-2 whitespace-nowrap active:scale-95" id="btn-etapa-auditoria" type="button">
              <i data-lucide="history" class="w-4 h-4"></i>
              Histórico de Auditoria
            </button>
          </div>
        </div>

        <!-- Banner de Numeração Sugerida INCRA -->
        <div id="banner-sugestao-numeracao" class="bg-forest-deep/40 border border-mint-vibrant/20 px-4 py-2 rounded-xl flex items-center justify-between text-xs hidden animate-in slide-in-from-top duration-300">
          <div class="flex items-center gap-2 text-white/80">
            <i data-lucide="lightbulb" class="w-4 h-4 text-mint-vibrant animate-pulse"></i>
            <span><strong>Próximos Vértices Sugeridos (INCRA):</strong> Marcos: <span id="sugestao-m" class="font-mono text-mint-vibrant font-bold">-</span> | Pontos: <span id="sugestao-p" class="font-mono text-mint-vibrant font-bold">-</span> | Virtuais: <span id="sugestao-v" class="font-mono text-mint-vibrant font-bold">-</span></span>
          </div>
          <span class="text-[9px] font-mono text-white/30 uppercase tracking-widest">Baseado no Banco de Pontos</span>
        </div>

        <!-- Grid Superior (Mapa + Ingestão Drag-and-Drop) -->
        <div class="flex flex-col lg:flex-row gap-4 lg:gap-0 relative w-full h-auto lg:h-[480px]" id="grid-superior-detalhe">
          <!-- Coluna 1: Mapa Leaflet -->
          <div class="glass-card h-[350px] lg:h-full relative overflow-hidden flex flex-col flex-1 min-w-[300px]" id="container-mapa-leaflet-parent">
            <div class="px-4 py-2 border-b border-white/5 flex justify-between items-center bg-white/[0.02] z-[1000]">
              <span class="text-[10px] font-bold uppercase tracking-widest text-white/40">Visualização Espacial e Auditoria</span>
              <span class="text-[9px] font-mono text-mint-vibrant uppercase" id="txt-mapa-status">SIGEF WMS ATIVO</span>
            </div>
            <div id="mapa-triagem" class="flex-1 w-full h-full"></div>
          </div>

          <!-- Splitter Superior Arrastável -->
          <div id="splitter-superior" class="w-2 hover:w-3 bg-transparent hover:bg-mint-vibrant/10 cursor-col-resize transition-all self-stretch flex items-center justify-center rounded shrink-0 hidden lg:flex group" title="Arraste para ajustar largura">
            <div class="w-[2px] h-10 bg-white/10 group-hover:bg-mint-vibrant/40 rounded transition-colors"></div>
          </div>

          <!-- Coluna 2: Ingestão Drag-and-Drop (Inicia Colapsada) -->
          <div class="glass-card p-4 flex flex-col h-auto lg:h-full ingestao-collapsed shrink-0" id="container-ingestao-arquivos">
            <div class="flex justify-between items-center mb-4">
              <h4 class="font-bold text-sm">Mesa de Ingestão de Arquivos</h4>
              <div class="flex items-center gap-1.5">
                 <button class="flex items-center gap-1 text-[10px] font-bold bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/25 hover:border-red-500/40 px-2 py-1 rounded transition-all" id="btn-colapsar-ingestao" title="Recolher painel" type="button">
                    <i data-lucide="minimize-2" class="w-3 h-3 text-red-400"></i>
                    Recolher
                 </button>
                 <span class="text-[9px] font-mono bg-white/5 border border-white/10 px-2 py-0.5 rounded text-white/40">Drag-and-Drop</span>
              </div>
            </div>
            
            <!-- Zona Drop -->
            <div class="border-2 border-dashed border-white/10 hover:border-mint-vibrant/40 rounded-xl p-4 text-center cursor-pointer transition-colors flex-1 flex flex-col justify-center items-center group relative overflow-hidden" id="triagem-dropzone">
              <input type="file" id="triagem-file-input" class="hidden" multiple accept=".gns,.GNS,.txt,.TXT" />
              <div class="w-10 h-10 bg-mint-vibrant/10 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform" id="triagem-dropzone-icon">
                <i data-lucide="upload" class="w-5 h-5 text-mint-vibrant"></i>
              </div>
              <p class="text-xs font-bold" id="triagem-dropzone-title">Arraste múltiplos arquivos para triagem</p>
              <p class="text-[9px] text-white/30 mt-1 uppercase tracking-widest" id="triagem-dropzone-desc">Suporta binários .GNS or relatórios .TXT</p>
            </div>

            <!-- Fila de arquivos selecionados -->
            <div class="mt-4 flex-1 overflow-y-auto space-y-2 hidden max-h-[160px]" id="triagem-fila-container">
              <!-- Lista de arquivos com seletor -->
            </div>

            <button class="btn-primary w-full py-2.5 mt-4 text-xs font-bold hidden flex items-center justify-center gap-1.5" id="btn-processar-lote">
              <i data-lucide="play" class="w-4 h-4"></i>
              Processar Lote em Segundo Plano
            </button>

            <!-- Mini View (Exibida somente no estado colapsado) -->
            <div class="mini-ingestao-view animate-in fade-in duration-300">
               <div class="w-12 h-12 bg-mint-vibrant/10 border border-mint-vibrant/20 rounded-full flex items-center justify-center text-mint-vibrant">
                  <i data-lucide="upload-cloud" class="w-6 h-6"></i>
               </div>
               <span class="text-[10px] font-bold uppercase tracking-wider text-mint-vibrant">Ingestão</span>
               <span class="text-[8px] text-white/30 leading-snug">Clique ou arraste arquivos</span>
            </div>
          </div>

          <!-- Coluna 2.1: Ordenador Perimetral Manual Premium (Alternativo para Ingestão) -->
          <div class="glass-card p-6 flex flex-col h-auto lg:h-full hidden shrink-0" id="container-reordenar-manual">
            <div class="flex justify-between items-center mb-4">
              <h4 class="font-bold text-sm flex items-center gap-2">
                <i data-lucide="arrow-up-down" class="w-4 h-4 text-mint-vibrant"></i>
                Ordenador Manual
              </h4>
              <button class="flex items-center gap-1 text-[10px] font-bold bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/25 hover:border-red-500/40 px-2 py-1 rounded transition-all" id="btn-fechar-reordenar" title="Fechar Ordenador" type="button">
                <i data-lucide="x" class="w-3.5 h-3.5"></i>
                Fechar
              </button>
            </div>
            
            <!-- Barra de Busca no Ordenador Manual -->
            <div class="relative w-full mb-2 shrink-0" id="container-search-ordenador">
              <input type="text" id="input-search-ordenador" placeholder="Pesquisar ponto no ordenador..." class="w-full bg-white/5 border border-white/10 hover:border-mint-vibrant/30 focus:border-mint-vibrant focus:ring-mint-vibrant/20 rounded px-2.5 py-1.5 text-[11px] text-white placeholder-white/30 focus:outline-none transition-all font-mono" />
              <span class="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/20 hover:text-mint-vibrant cursor-pointer transition-colors font-bold text-xs" id="btn-clear-search-ordenador" title="Limpar pesquisa">×</span>
            </div>

            <!-- Controles Avançados do Ordenador -->
            <div class="flex items-center justify-between gap-2 mb-3 shrink-0 bg-white/[0.02] border border-white/5 rounded-technical p-2 text-[10px]">
              <button class="flex items-center gap-1 bg-white/5 hover:bg-mint-vibrant/10 text-white hover:text-mint-vibrant px-2.5 py-1 rounded transition-all font-bold border border-white/10" id="btn-toggle-clique-sequencial" type="button" title="Ativar clique sequencial no mapa para enfileirar pontos">
                <i data-lucide="play" class="w-3.5 h-3.5 text-mint-vibrant" id="icon-clique-sequencial"></i>
                <span id="txt-clique-sequencial" class="font-mono">Caminhar por Clique</span>
              </button>
              <div class="flex items-center gap-1.5 text-white/50 font-mono text-[9px]">
                <span>Travados:</span>
                <span id="txt-faixa-travada" class="text-mint-vibrant font-bold">Nenhum</span>
              </div>
            </div>
            
            <!-- Listagem Simplificada -->
            <div class="flex-1 overflow-y-auto space-y-2 pr-1 border border-white/5 bg-[#0c1510]/20 rounded-xl p-3" id="lista-reordenar-simplificada">
              <!-- Preenchido dinamicamente com Nome e Ordem + Chevrons -->
              <div class="text-white/20 p-8 text-center">Nenhum ponto para ordenar.</div>
            </div>

            <!-- Rodapé com Salvamento -->
            <div class="mt-4 pt-3 border-t border-white/5 flex gap-2">
              <button class="btn-primary flex-grow py-2 text-xs font-bold flex items-center justify-center gap-1.5" id="btn-salvar-ordem-simplificada" type="button">
                <i data-lucide="save" class="w-4 h-4"></i>
                Salvar Ordem Caminhamento
              </button>
            </div>
          </div>
        </div>

        <!-- Painel Técnico e Arquivos Físicos do Workspace -->
        <div class="glass-card p-0 space-y-1" id="painel-workspace-gnss">
          <div class="flex justify-between items-center border-b border-white/5 pb-2.5 cursor-pointer select-none" id="btn-toggle-workspace-collapse">
            <h4 class="font-bold text-sm flex items-center gap-2">
              <i data-lucide="chevron-right" class="w-5 h-5 text-mint-vibrant transition-transform duration-200 rotate-90" id="seta-workspace-collapse"></i>
              <i data-lucide="folder-open" class="w-5 h-5 text-mint-vibrant"></i>
              Workspace GNSS (Repositório Físico do Windows)
            </h4>
             <div class="flex items-center gap-2" onclick="event.stopPropagation()">
               <!-- Ghost: ação de suporte — deve recuar (Design_UI §7.3) -->
               <button class="text-xs py-1 px-2.5 flex items-center gap-1 text-white/40 hover:text-white/75 hover:bg-white/5 rounded-md transition-all font-medium" id="btn-atualizar-arquivos-list">
                 <i data-lucide="refresh-cw" class="w-3.5 h-3.5 mr-1"></i>
                 Atualizar
               </button>
               <!-- Secondary Warning: ação importante mas não a principal (Design_UI §7.3) -->
               <button class="btn-secondary text-xs py-1 px-3 flex items-center gap-1 hover:border-yellow-500/40 bg-yellow-500/10 border-yellow-500/20 text-yellow-400 hover:text-yellow-300 font-bold" id="btn-testar-busca-rinex" type="button">
                 <i data-lucide="play" class="w-3.5 h-3.5 mr-1"></i>
                 Testar HGO
               </button>
               <!-- Primary: ação principal desta seção — capsule verde preenchido (Design_UI §7.3) -->
               <button class="bg-mint-vibrant text-forest-deep font-bold text-xs px-4 py-1.5 rounded-full flex items-center gap-1.5 hover:brightness-110 active:scale-95 transition-all shrink-0" id="btn-download-rinex-zip" type="button">
                 <i data-lucide="archive" class="w-3.5 h-3.5"></i>
                 Baixar RINEX .ZIP
               </button>
            </div>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-5 gap-1 transition-all duration-300" id="container-workspace-arquivos">
             <div class="text-white/20 p-8 text-center col-span-full">Carregando arquivos do Workspace...</div>
          </div>
        </div>

        <!-- Barra de Ferramentas Técnicas -->
        <div class="flex flex-col sm:flex-row justify-between sm:items-center gap-3 py-1">
          <div class="flex items-center gap-2 overflow-x-auto pr-2 pb-1 scrollbar-thin">
            <button class="btn-secondary text-xs px-3.5 py-2.5 md:text-[11px] md:px-2 md:py-1 flex items-center gap-1 shrink-0 active:scale-95 transition-all" id="btn-exportar-kml">
              <i data-lucide="map-icon" class="w-3.5 h-3.5 text-mint-vibrant"></i>
              KML
            </button>
            <button class="btn-secondary text-xs px-3.5 py-2.5 md:text-[11px] md:px-2 md:py-1 flex items-center gap-1 shrink-0 active:scale-95 transition-all" id="btn-unificar-sigef">
              <i data-lucide="file-spreadsheet" class="w-3.5 h-3.5 text-mint-vibrant"></i>
              Unificar SIGEF (1A)
            </button>
            <button class="btn-secondary text-xs px-3.5 py-2.5 md:text-[11px] md:px-2 md:py-1 flex items-center gap-1 shrink-0 active:scale-95 transition-all" id="btn-consolidar-pontos-utm">
              <i data-lucide="download" class="w-3.5 h-3.5 text-mint-vibrant"></i>
              Exportar
            </button>
            <button class="btn-secondary text-xs px-3.5 py-2.5 md:text-[11px] md:px-2 md:py-1 flex items-center gap-1 shrink-0 text-sky-400 hover:bg-sky-500/10 border-sky-500/20 active:scale-95 transition-all" id="btn-sincronizar-nuvem" type="button" title="Sincronizar perímetro consolidado com o Hub de Consulta na Nuvem">
              <i data-lucide="cloud-lightning" class="w-3.5 h-3.5"></i>
              Sincronizar Nuvem
            </button>
            <button class="btn-secondary text-xs px-3.5 py-2.5 md:text-[11px] md:px-2 md:py-1 flex items-center gap-1 shrink-0 active:scale-95 transition-all" id="btn-reordenar-caminhamento">
               <i data-lucide="refresh-cw" class="w-3.5 h-3.5 text-mint-vibrant"></i>
               Reordenar pontos
            </button>
            <button class="btn-secondary text-xs px-3.5 py-2.5 md:text-[11px] md:px-2 md:py-1 flex items-center gap-1 shrink-0 text-yellow-400 hover:bg-yellow-500/10 border-yellow-500/20 active:scale-95 transition-all" id="btn-override-base-manual" type="button">
                <i data-lucide="shield-alert" class="w-3.5 h-3.5"></i>
                Base manual
             </button>
            <button class="btn-secondary text-xs px-3.5 py-2.5 md:text-[11px] md:px-2 md:py-1 flex items-center gap-1 shrink-0 active:scale-95 transition-all" id="btn-gerar-requerimento-cri">
               <i data-lucide="file-text" class="w-3.5 h-3.5 text-mint-vibrant"></i>
               Requerimento
            </button>
            <button class="btn-secondary text-xs px-3.5 py-2.5 md:text-[11px] md:px-2 md:py-1 text-red-400 hover:bg-red-500/10 border-red-500/20 shrink-0 active:scale-95 transition-all" id="btn-arquivar-projeto-seguro">
               <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
               Arquivar
            </button>
          </div>
          <div class="text-left sm:text-right shrink-0" id="container-info-matricula-ativa">
            <span class="text-[10px] text-white/40 font-mono">MATRÍCULA ATIVA: <span class="text-mint-vibrant font-bold font-mono" id="txt-nome-matricula-ativa">-</span></span>
          </div>
        </div>
        <!-- Tabelas Inferiores (Pontos vs Divisas) -->
        <div class="flex flex-col lg:flex-row gap-0 relative w-full" id="container-tabelas-inferiores">
          <!-- Tabela 1: Vértices -->
          <div class="glass-card flex flex-col h-[400px] overflow-hidden flex-1 min-w-[300px] shrink" id="container-tabela-vertices">
             <div class="px-4 sm:px-6 py-2.5 sm:py-2 border-b border-white/5 bg-white/[0.01] flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
               <div class="flex flex-wrap items-center gap-2 sm:gap-3">
                 <h4 class="text-xs font-bold uppercase tracking-widest text-white/40 w-full sm:w-auto mb-1 sm:mb-0" id="lbl-titulo-vertices">Vértices Geodésicos</h4>
                 <button class="text-xs px-3 py-2 sm:text-[9px] sm:px-2 sm:py-1 font-bold bg-white/5 border border-white/10 hover:bg-white/10 hover:border-mint-vibrant/40 rounded transition-all text-mint-vibrant active:scale-95" id="btn-toggle-coordenadas" type="button">
                   Ver em Geodésico
                 </button>
                 <button class="text-xs px-3 py-2 sm:text-[9px] sm:px-2 sm:py-1 font-bold bg-white/5 border border-white/10 hover:bg-white/10 hover:border-mint-vibrant/40 rounded transition-all text-mint-vibrant active:scale-95" id="btn-toggle-ocultar-ignorados" type="button">
                   Ocultar Fora da Poligonal
                 </button>
                 <button class="text-xs px-3 py-2 sm:text-[9px] sm:px-2 sm:py-1 font-bold bg-white/5 border border-white/10 hover:bg-white/10 hover:border-mint-vibrant/40 rounded transition-all text-mint-vibrant active:scale-95" id="btn-ativar-reordenacao" type="button">
                   Reordenar Manual
                 </button>
                 <button class="btn-primary text-xs py-2 px-3 sm:text-[10px] sm:py-1 sm:px-3 font-bold hidden flex items-center gap-1 hover:scale-105 transition-all bg-emerald-600 border-emerald-500 hover:bg-emerald-500 active:scale-95" id="btn-salvar-perimetro-custom" type="button">
                   <i data-lucide="play" class="w-3.5 h-3.5"></i>
                   Salvar Perímetro & Recomputar
                 </button>
               </div>
               <div class="flex items-center gap-2 w-full sm:w-auto">
                 <div class="relative w-full sm:w-[150px] shrink-0" id="container-search-ponto">
                   <input type="text" id="input-search-ponto" placeholder="Pesquisar ponto..." class="w-full bg-white/5 border border-white/10 hover:border-mint-vibrant/30 focus:border-mint-vibrant focus:ring-mint-vibrant/20 rounded px-2.5 py-2 sm:py-1 text-xs sm:text-[11px] text-white placeholder-white/30 focus:outline-none transition-all font-mono" />
                   <span class="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/20 hover:text-mint-vibrant cursor-pointer transition-colors font-bold text-xs" id="btn-clear-search" title="Limpar pesquisa">×</span>
                 </div>
                 <button class="p-2.5 sm:p-1.5 bg-white/5 border border-white/10 hover:bg-mint-vibrant/10 hover:text-mint-vibrant hover:border-mint-vibrant/30 rounded text-white/75 transition-all flex items-center justify-center shrink-0 active:scale-95" id="btn-exportar-tabela-csv" title="Exportar tabela para CSV" type="button">
                   <i data-lucide="download" class="w-3.5 h-3.5"></i>
                 </button>
               </div>
             </div>
            
            <!-- Barra de Filtros Rápidos -->
            <div class="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-2 border-b border-white/5 bg-white/[0.005]" id="container-filtros-rapidos-tabela">
              <span class="text-[9px] text-white/30 uppercase tracking-wider font-semibold mr-1.5 w-full sm:w-auto">Filtros rápidos:</span>
              <button class="px-3.5 py-2 sm:px-2 sm:py-0.5 rounded text-xs sm:text-[10px] font-semibold bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/20 btn-filtro-rapido transition-all active:scale-95" data-filtro="todos">Todos</button>
              <button class="px-3.5 py-2 sm:px-2 sm:py-0.5 rounded text-xs sm:text-[10px] font-semibold bg-white/5 text-white/50 border border-transparent hover:text-white hover:bg-white/[0.08] btn-filtro-rapido transition-all active:scale-95" data-filtro="bases">Bases (M/B)</button>
              <button class="px-3.5 py-2 sm:px-2 sm:py-0.5 rounded text-xs sm:text-[10px] font-semibold bg-white/5 text-white/50 border border-transparent hover:text-white hover:bg-white/[0.08] btn-filtro-rapido transition-all active:scale-95" data-filtro="rovers">Rovers (P/V)</button>
              <button class="px-3.5 py-2 sm:px-2 sm:py-0.5 rounded text-xs sm:text-[10px] font-semibold bg-white/5 text-white/50 border border-transparent hover:text-white hover:bg-white/[0.08] btn-filtro-rapido transition-all active:scale-95" data-filtro="brutos">Brutos</button>
              <button class="px-3.5 py-2 sm:px-2 sm:py-0.5 rounded text-xs sm:text-[10px] font-semibold bg-white/5 text-white/50 border border-transparent hover:text-white hover:bg-white/[0.08] btn-filtro-rapido transition-all active:scale-95" data-filtro="corrigidos">Corrigidos</button>
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
                <tbody id="tbl-pontos-triagem" class="text-xs divide-y divide-white/5 text-white/80 font-sans font-normal">
                  <tr>
                    <td colspan="6" class="px-4 py-8 text-center text-white/30">Nenhum ponto atrelado a esta matrícula.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Splitter Inferior Arrastável -->
          <div id="splitter-inferior" class="w-2 hover:w-3 bg-transparent hover:bg-mint-vibrant/10 cursor-col-resize transition-all self-stretch flex items-center justify-center rounded shrink-0 hidden lg:flex group" title="Arraste para ajustar largura">
            <div class="w-[2px] h-10 bg-white/10 group-hover:bg-mint-vibrant/40 rounded transition-colors"></div>
          </div>

          <!-- Tabela 2: Lateral Dinâmica (Divisas ou Auditoria de Translação) -->
          <div class="glass-card flex flex-col h-[400px] overflow-hidden w-full lg:w-[48%] lg:shrink-0 lg:min-w-[300px]" id="container-tabela-divisas">
            <div class="px-6 py-4 border-b border-white/5 bg-white/[0.02] flex justify-between items-center bg-white/[0.01]">
              <h4 class="text-xs font-bold uppercase tracking-widest text-white/40" id="lbl-titulo-tabela-lateral">Segmentos de Divisa (Confrontantes)</h4>
              <span class="text-[9px] text-mint-vibrant font-mono bg-mint-vibrant/10 px-2 py-0.5 rounded-full font-bold" id="badge-tabela-lateral">EDICAO REAL-TIME</span>
            </div>
            <!-- Formulário Rápido de Inclusão de Confrontante -->
            <div class="px-6 py-2 border-b border-white/5 bg-white/[0.005] flex gap-2 items-center" id="container-confrontante-rapido">
              <input type="text" id="input-confrontante-nome-rapido" placeholder="Nome do novo confrontante..." class="flex-grow bg-white/5 border border-white/10 hover:border-mint-vibrant/30 focus:border-mint-vibrant focus:ring-mint-vibrant/20 rounded px-2.5 py-1.5 text-[11px] text-white placeholder-white/30 focus:outline-none transition-all" />
              <button class="px-2.5 py-1.5 text-[10px] font-bold bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/25 hover:bg-mint-vibrant/20 rounded transition-all flex items-center gap-1 shrink-0 active:scale-95 animate-pulse" id="btn-confrontante-adicionar-rapido" type="button">
                <i data-lucide="plus" class="w-3.5 h-3.5 mr-0.5"></i>
                + Confrontante
              </button>
            </div>
            <div class="flex-1 overflow-auto" id="container-tabela-lateral-content">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="bg-white/5 text-[9px] font-bold uppercase tracking-widest text-white/30 border-b border-white/5 sticky top-0 z-10">
                    <th class="px-3 py-2.5 resizable-col" data-col-id="col_segmento_de_para">De ➔ Para</th>
                    <th class="px-2 py-2.5 text-right resizable-col" data-col-id="col_segmento_dist">Dist (m)</th>
                    <th class="px-2 py-2.5 text-right resizable-col" data-col-id="col_segmento_azim">Azimute</th>
                    <th class="px-3 py-2.5 resizable-col" data-col-id="col_segmento_confrontante">Confrontante Oficial / Divisa</th>
                    <th class="px-2 py-2.5 text-center resizable-col" data-col-id="col_segmento_anuencia">Anuên</th>
                    <th class="px-3 py-2.5 text-center resizable-col" data-col-id="col_segmento_acoes">Peças Técnicas</th>
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

        <!-- SEÇÃO FINAL: HOMOLOGAÇÃO INCRA / BANCO DE PONTOS -->
        <div class="glass-card p-6 space-y-6" id="panel-homologacao-incra">
          <div class="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-white/5 pb-4">
            <div>
              <h4 class="font-bold text-sm flex items-center gap-2">
                <i data-lucide="shield-check" class="w-5 h-5 text-mint-vibrant"></i>
                Homologação de Pontos Aprovados no INCRA / SIGEF
              </h4>
              <p class="text-xs text-white/40 mt-1">Envie o arquivo final de vértices homologados pelo SIGEF para registrá-los no seu Banco de Pontos.</p>
            </div>
            <span class="text-[9px] font-mono bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/25 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">Módulo Regulatório</span>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Esquerda: Dropzone de Upload -->
            <div class="lg:col-span-1 flex flex-col justify-between space-y-4">
              <div class="border-2 border-dashed border-white/10 hover:border-mint-vibrant/40 rounded-xl p-5 text-center cursor-pointer transition-colors flex-1 flex flex-col justify-center items-center group relative overflow-hidden" id="homologacao-dropzone">
                <input type="file" id="homologacao-file-input" class="hidden" accept=".txt,.csv,.ods" multiple />
                <div class="w-10 h-10 bg-mint-vibrant/10 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <i data-lucide="file-check" class="w-5 h-5 text-mint-vibrant"></i>
                </div>
                <p class="text-xs font-bold text-white">Lançar TXT/CSV/ODS Homologado</p>
                <p class="text-[9px] text-white/30 mt-1 uppercase tracking-widest">Suporta relatórios .TXT, .CSV ou planilhas .ODS (múltiplos)</p>
              </div>

              <!-- Container de Mapeamento de Abas/Arquivos -->
              <div id="container-mapeamento-abas-homologacao" class="hidden space-y-3 bg-white/5 border border-white/10 rounded-xl p-4 mt-2">
                <h5 class="text-xs font-bold text-mint-vibrant uppercase tracking-wider flex items-center gap-1.5">
                  <i data-lucide="layers" class="w-4 h-4"></i>
                  Mapeamento de Abas ➔ Matrículas
                </h5>
                <p class="text-[10px] text-white/40">Selecione qual matrícula corresponde a cada trecho/aba identificado:</p>
                <div id="lista-abas-mapeamento" class="space-y-3 max-h-[300px] overflow-y-auto pr-1"></div>
              </div>

              <button class="btn-primary w-full py-2 text-xs font-bold flex items-center justify-center gap-1.5 opacity-55 cursor-not-allowed" id="btn-processar-homologacao" disabled type="button">
                <i data-lucide="upload" class="w-4 h-4"></i>
                Importar Pontos no Banco
              </button>
            </div>

            <!-- Centro/Direita: Painel de Rastreabilidade e Pontos -->
            <div class="lg:col-span-2 space-y-4 bg-forest-deep/20 border border-white/5 rounded-xl p-5 flex flex-col min-h-[150px]">
              <!-- Seção 1: Planilhas Importadas (Rastreabilidade) -->
              <div class="space-y-2">
                <div class="flex justify-between items-center border-b border-white/5 pb-2">
                  <span class="text-[10px] font-bold text-white/40 uppercase tracking-wider">Arquivos / Planilhas Importadas</span>
                </div>
                <div id="container-planilhas-homologadas" class="overflow-x-auto text-xs">
                  <div class="text-white/20 italic py-2 text-center">Nenhuma planilha cadastrada.</div>
                </div>
              </div>
              
              <!-- Seção 2: Vértices Homologados da Matrícula Ativa -->
              <div class="space-y-2 flex-grow flex flex-col">
                <div class="flex justify-between items-center border-b border-white/5 pb-2">
                  <span class="text-[10px] font-bold text-white/40 uppercase tracking-wider">Vértices da Matrícula Ativa</span>
                  <span id="txt-qtd-homologados" class="text-[9px] font-mono bg-white/5 border border-white/10 px-2 py-0.5 rounded text-white/40">0 Pontos</span>
                </div>
                <div id="container-vertices-homologados" class="flex-grow overflow-y-auto max-h-[120px] space-y-1.5 text-xs font-mono">
                  <div class="text-white/20 italic py-4 text-center">Selecione uma matrícula com pontos homologados para listar seus vértices.</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Painel Colapsável de Auditoria de Pontos no Banco -->
          <div class="border-t border-white/5 pt-4 space-y-4">
            <button class="w-full flex justify-between items-center text-xs font-bold uppercase tracking-wider text-white/50 bg-white/5 hover:bg-white/10 px-4 py-2.5 rounded-lg border border-white/10 transition-all active:scale-[0.99]" id="btn-toggle-auditoria-banco" type="button">
              <span class="flex items-center gap-2">
                <i data-lucide="scan" class="w-4 h-4 text-amber-400"></i>
                Auditoria de Pontos no Banco (Controle de Duplicatas e Arquivos)
              </span>
              <i data-lucide="chevron-down" class="w-4 h-4 transition-transform duration-200" id="icon-chevron-auditoria"></i>
            </button>
            
            <div class="hidden space-y-4 bg-forest-deep/10 border border-white/5 rounded-xl p-4" id="container-auditoria-banco">
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div class="bg-white/5 border border-white/10 p-3 rounded-lg flex flex-col justify-between">
                  <span class="text-white/40 font-bold uppercase tracking-wider text-[9px]">Total de Pontos no Banco</span>
                  <span class="text-xl font-bold text-white mt-1" id="auditoria-total-pontos">0</span>
                </div>
                <div class="bg-white/5 border border-white/10 p-3 rounded-lg flex flex-col justify-between">
                  <span class="text-white/40 font-bold uppercase tracking-wider text-[9px]">Grupos/Arquivos Distintos</span>
                  <span class="text-xl font-bold text-white mt-1" id="auditoria-total-grupos">0</span>
                </div>
                <div class="bg-white/5 border border-white/10 p-3 rounded-lg flex flex-col justify-between">
                  <span class="text-white/40 font-bold uppercase tracking-wider text-[9px]">Pontos Duplicados Detectados</span>
                  <span class="text-xl font-bold text-amber-400 mt-1" id="auditoria-total-duplicados">0</span>
                </div>
              </div>

              <div id="lista-grupos-auditoria" class="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                <div class="text-white/20 italic py-4 text-center">Nenhum ponto no banco para auditar.</div>
              </div>
            </div>
          </div>

          <!-- Linha de Peças Técnicas de Cartório (SIGEF) -->
          <div class="border-t border-white/5 pt-4 space-y-4 hidden" id="container-pecas-cartorio">
            <div class="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
              <h5 class="text-xs font-bold uppercase tracking-wider text-white/50 flex items-center gap-2">
                <i data-lucide="file-text" class="w-4 h-4 text-mint-vibrant"></i>
                Peças Técnicas e Documentos para Cartório (Registro de Imóveis)
              </h5>
              <div class="flex items-center gap-2">
                <span class="text-[10px] text-white/40 font-mono">Exibir Poligonal no Mapa:</span>
                <button class="px-2.5 py-1 text-[9px] font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/25 rounded transition-all active:scale-95 flex items-center gap-1.5" id="btn-toggle-mapa-banco" type="button">
                  <i data-lucide="eye" class="w-3.5 h-3.5" id="icon-toggle-mapa-banco"></i>
                  <span id="txt-toggle-mapa-banco">Exibir Poligonal</span>
                </button>
              </div>
            </div>

            <!-- Grid de Botões de Emissão -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <button class="btn-secondary py-2 px-3 text-xs font-bold flex items-center justify-center gap-2 border-white/10 hover:border-mint-vibrant/30 hover:bg-mint-vibrant/5 text-white active:scale-95" id="btn-emitir-req-cartorio" type="button">
                <i data-lucide="file-edit" class="w-4 h-4 text-mint-vibrant"></i>
                Requerimento de Retificação
              </button>
              <button class="btn-secondary py-2 px-3 text-xs font-bold flex items-center justify-center gap-2 border-white/10 hover:border-mint-vibrant/30 hover:bg-mint-vibrant/5 text-white active:scale-95" id="btn-emitir-decl-resp" type="button">
                <i data-lucide="user-check" class="w-4 h-4 text-mint-vibrant"></i>
                Declaração de Responsabilidade
              </button>
              <button class="btn-secondary py-2 px-3 text-xs font-bold flex items-center justify-center gap-2 border-white/10 hover:border-mint-vibrant/30 hover:bg-mint-vibrant/5 text-white active:scale-95" id="btn-emitir-laudo-tec" type="button">
                <i data-lucide="file-signature" class="w-4 h-4 text-mint-vibrant"></i>
                Laudo Técnico Descritivo
              </button>
              <div class="flex gap-2">
                <select id="select-confrontante-anuencia" class="flex-grow bg-white/5 border border-white/10 hover:border-mint-vibrant/30 focus:border-mint-vibrant rounded px-2 text-xs text-white focus:outline-none transition-all">
                  <option value="" class="bg-[#0c1510]">Anuência Confrontante...</option>
                </select>
                <button class="btn-secondary py-2 px-3 text-xs font-bold flex items-center justify-center gap-2 border-white/10 hover:border-mint-vibrant/30 hover:bg-mint-vibrant/5 text-white active:scale-95 shrink-0" id="btn-emitir-anuencia" type="button">
                  <i data-lucide="check" class="w-4 h-4 text-mint-vibrant"></i>
                  Gerar
                </button>
              </div>
            </div>

            <!-- Formulário de Edição do Confrontante Selecionado -->
            <div id="container-form-confrontante" class="bg-forest-deep/20 border border-white/5 rounded-xl p-4 space-y-4 hidden animate-in fade-in slide-in-from-top-4 duration-300">
               <div class="flex justify-between items-center border-b border-white/5 pb-2">
                  <span class="text-xs font-bold text-mint-vibrant uppercase tracking-wider">Qualificação do Confrontante Selecionado</span>
                  <span class="text-[10px] text-white/40 font-mono" id="txt-conf-id-edicao">ID: -</span>
               </div>
               
               <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                     <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Nome Completo / Descritivo *</label>
                     <input type="text" id="input-conf-nome" class="glass-input w-full text-xs" placeholder="Nome do vizinho" />
                  </div>
                  <div>
                     <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">CPF / CNPJ</label>
                     <input type="text" id="input-conf-cpf" class="glass-input w-full text-xs" placeholder="Ex: 000.000.000-00" />
                  </div>
                  <div>
                     <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">RG / IE</label>
                     <input type="text" id="input-conf-rg" class="glass-input w-full text-xs" placeholder="Registro Geral" />
                  </div>
               </div>

               <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                     <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Nacionalidade</label>
                     <input type="text" id="input-conf-nacionalidade" class="glass-input w-full text-xs" placeholder="brasileiro(a)" />
                  </div>
                  <div>
                     <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Profissão</label>
                     <input type="text" id="input-conf-profissao" class="glass-input w-full text-xs" placeholder="Ex: produtor rural" />
                  </div>
                  <div>
                     <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Estado Civil</label>
                     <select id="conf-estado-civil" class="glass-input w-full text-xs">
                        <option value="solteiro">Solteiro(a)</option>
                        <option value="casado">Casado(a)</option>
                        <option value="divorciado">Divorciado(a)</option>
                        <option value="viuvo">Viúvo(a)</option>
                        <option value="uniao_estavel">União Estável</option>
                     </select>
                  </div>
                  <div>
                     <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Regime de Bens</label>
                     <select id="conf-regime-bens" class="glass-input w-full text-xs">
                        <option value="">Não Aplicável</option>
                        ${REGIMES_BENS_OPTIONS}
                     </select>
                  </div>
               </div>

               <div id="group-dados-conjuge" class="grid grid-cols-1 md:grid-cols-3 gap-4 hidden">
                  <div>
                     <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Cônjuge (Nome)</label>
                     <input type="text" id="input-conf-conjuge-nome" class="glass-input w-full text-xs campos-extra-conjuge" placeholder="Nome do cônjuge" />
                  </div>
                  <div>
                     <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Cônjuge CPF</label>
                     <input type="text" id="input-conf-conjuge-cpf" class="glass-input w-full text-xs campos-extra-conjuge" placeholder="CPF do cônjuge" />
                  </div>
                  <div>
                     <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Cônjuge RG</label>
                     <input type="text" id="input-conf-conjuge-rg" class="glass-input w-full text-xs campos-extra-conjuge" placeholder="RG do cônjuge" />
                  </div>
               </div>

               <div>
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Endereço Completo</label>
                  <input type="text" id="input-conf-endereco" class="glass-input w-full text-xs" placeholder="Rua, Número, Bairro, Cidade-UF" />
               </div>

               <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                     <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Matrícula Confrontante (Opcional)</label>
                     <input type="text" id="input-conf-matricula-imovel" class="glass-input w-full text-xs font-mono" placeholder="Ex: 5196" />
                  </div>
                  <div>
                     <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Anexo da Certidão/Matrícula (PDF/Imagem)</label>
                     <div class="flex items-center gap-2 min-h-[34px] bg-white/[0.02] border border-white/5 rounded-technical px-3 py-1.5" id="wrapper-anexo-matricula-conf">
                        <!-- Injetado via Javascript -->
                     </div>
                     <input type="file" id="file-matricula-conf" class="hidden" accept=".pdf,image/*" />
                  </div>
               </div>

               <div class="flex justify-end gap-2 border-t border-white/5 pt-4">
                  <button class="btn-primary py-2 px-6 text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95" id="btn-salvar-confrontante-qualificacao" type="button">
                     <i data-lucide="save" class="w-4 h-4"></i>
                     Salvar Confrontante
                  </button>
                  <button class="btn-secondary py-2 px-3 text-xs font-bold text-white border-white/10 hover:bg-white/5 active:scale-95" id="btn-cancelar-confrontante-qualificacao" type="button">
                     Cancelar
                  </button>
               </div>
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
                        <option value="B">Base Física de Campo (B)</option>
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
               <div class="space-y-3" id="section-pt-ajustadas-geo">
                  <span class="block text-[10px] font-bold text-white/40 uppercase tracking-wider border-b border-white/5 pb-1">Coordenadas Ajustadas (SIRGAS 2000)</span>
                  
                  <div class="grid grid-cols-3 gap-4">
                     <div>
                        <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Latitude (Dec)</label>
                        <input type="number" step="any" id="input-pt-lat" class="glass-input w-full text-xs font-mono" placeholder="-23.123456789" />
                     </div>
                     <div>
                        <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Longitude (Dec)</label>
                        <input type="number" step="any" id="input-pt-lon" class="glass-input w-full text-xs font-mono" placeholder="-53.123456789" />
                     </div>
                     <div>
                        <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Altitude H (m)</label>
                        <input type="number" step="any" id="input-pt-alt" class="glass-input w-full text-xs font-mono" placeholder="320.456" />
                     </div>
                  </div>

                  <!-- 4. INCERTEZAS / PRECISION SIGMAS (± METROS) -->
                  <div class="grid grid-cols-3 gap-4 pt-2">
                     <div>
                        <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Incerteza Lat (Sigma ± m)</label>
                        <input type="number" step="any" id="input-pt-sigma-lat" class="glass-input w-full text-xs font-mono" placeholder="0.0050" />
                     </div>
                     <div>
                        <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Incerteza Lon (Sigma ± m)</label>
                        <input type="number" step="any" id="input-pt-sigma-lon" class="glass-input w-full text-xs font-mono" placeholder="0.0050" />
                     </div>
                     <div>
                        <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Incerteza Alt (Sigma ± m)</label>
                        <input type="number" step="any" id="input-pt-sigma-alt" class="glass-input w-full text-xs font-mono" placeholder="0.0100" />
                     </div>
                  </div>
               </div>

               <!-- 3.1. COORDENADAS OFICIAIS DE CONTROLE DA BASE (EXCLUSIVO TIPO 'M') -->
               <div class="space-y-3 hidden" id="section-pt-base-controle">
                  <span class="block text-[10px] font-bold text-mint-vibrant uppercase tracking-wider border-b border-mint-vibrant/20 pb-1">Coordenadas Oficiais do Ponto de Controle (Base Corrigida)</span>
                  
                  <div class="grid grid-cols-3 gap-4">
                     <div>
                        <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Norte Corrigido (m) *</label>
                        <input type="number" step="any" id="input-pt-n-corr-base" class="glass-input w-full text-xs font-mono" placeholder="7432100.123" />
                     </div>
                     <div>
                        <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Este Corrigido (m) *</label>
                        <input type="number" step="any" id="input-pt-e-corr-base" class="glass-input w-full text-xs font-mono" placeholder="345600.456" />
                     </div>
                     <div>
                        <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Alt Corrigida H (m) *</label>
                        <input type="number" step="0.001" id="input-pt-alt-corr-base" class="glass-input w-full text-xs font-mono" placeholder="320.123" />
                     </div>
                  </div>

                  <div class="grid grid-cols-2 gap-4">
                     <div>
                        <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Fuso UTM *</label>
                        <select id="select-pt-fuso-base" class="glass-input w-full text-xs">
                           <option value="21S">21S (EPSG:31981)</option>
                           <option value="22S" selected>22S (EPSG:31982)</option>
                           <option value="23S">23S (EPSG:31983)</option>
                           <option value="24S">24S (EPSG:31984)</option>
                        </select>
                     </div>
                     <div>
                        <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Hemisfério</label>
                        <input type="text" value="Sul (SIRGAS 2000)" readonly disabled class="glass-input w-full text-xs opacity-50 cursor-not-allowed" />
                     </div>
                  </div>

                  <!-- PAINEL DE FEEDBACK DE DELTA EM TEMPO REAL -->
                  <div class="bg-[#0c1510]/60 border border-mint-vibrant/20 rounded-technical p-4 mt-2">
                     <span class="block text-[9px] font-bold text-mint-vibrant uppercase tracking-wider mb-2">Vetor de Translação do Lote (Tempo Real)</span>
                     <div class="grid grid-cols-4 gap-3 text-center text-xs font-mono">
                        <div class="bg-white/[0.02] border border-white/5 p-2 rounded">
                           <span class="block text-[8px] text-white/30 uppercase">dN (Norte)</span>
                           <span class="text-white font-bold text-xs" id="lbl-pt-dn-base">-</span>
                        </div>
                        <div class="bg-white/[0.02] border border-white/5 p-2 rounded">
                           <span class="block text-[8px] text-white/30 uppercase">dE (Este)</span>
                           <span class="text-white font-bold text-xs" id="lbl-pt-de-base">-</span>
                        </div>
                        <div class="bg-white/[0.02] border border-white/5 p-2 rounded">
                           <span class="block text-[8px] text-white/30 uppercase">dH (Alt)</span>
                           <span class="text-white font-bold text-xs" id="lbl-pt-dh-base">-</span>
                        </div>
                        <div class="bg-mint-vibrant/10 border border-mint-vibrant/20 p-2 rounded">
                           <span class="block text-[8px] text-mint-vibrant/60 uppercase font-bold">d3D (Total)</span>
                           <span class="text-mint-vibrant font-bold text-xs" id="lbl-pt-d3d-base">-</span>
                        </div>
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
      
      <!-- MODAL OVERRIDE MANUAL DE BASE (V.L.A.E.G. CONTINGENCIAL) -->
      <div id="modal-override-base" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] hidden flex items-center justify-center p-4">
         <div class="glass-card w-full max-w-xl overflow-hidden flex flex-col max-h-[95vh]">
            <div class="p-5 border-b border-white/5 flex justify-between items-center bg-white/[0.02] shrink-0">
               <h3 class="text-base font-bold flex items-center gap-2">
                  <i data-lucide="shield-alert" class="w-5 h-5 text-mint-vibrant"></i>
                  Override de Coordenadas de Base (V.L.A.E.G. Contingencial)
               </h3>
               <button class="text-white/40 hover:text-white" id="btn-fechar-modal-override" type="button">
                  <i data-lucide="x" class="w-5 h-5"></i>
               </button>
            </div>
            
            <form id="form-override-base" class="flex-1 overflow-y-auto p-6 space-y-6">
               <!-- Seletor de Lote/Arquivo de Origem -->
               <div>
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Selecione o Lote de Campo (Arquivo Origem) *</label>
                  <select id="select-override-arquivo" required class="glass-input w-full text-xs font-mono">
                     <!-- Preenchido dinamicamente com arquivos do levantamento -->
                  </select>
               </div>

               <!-- Nome do Vértice Base -->
               <div>
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Nome do Vértice Base no Campo *</label>
                  <input type="text" id="input-override-nome-base" required class="glass-input w-full text-xs font-mono uppercase text-mint-vibrant bg-white/5 border border-white/10" placeholder="Ex: M-0100 ou BASE-01" value="BASE-MANUAL" />
               </div>

               <!-- Bloco A: Coordenadas Brutas de Campo -->
               <div class="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-3">
                  <span class="block text-[10px] font-bold text-white/50 uppercase tracking-wider border-b border-white/5 pb-1">Bloco A: Coordenadas Brutas de Campo (Base Bruta)</span>
                  <div class="grid grid-cols-3 gap-4">
                     <div>
                        <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Norte Bruto (m) *</label>
                        <input type="number" step="0.001" id="input-override-n-bruto" required class="glass-input w-full text-xs font-mono" placeholder="7432100.123" />
                     </div>
                     <div>
                        <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Este Bruto (m) *</label>
                        <input type="number" step="0.001" id="input-override-e-bruto" required class="glass-input w-full text-xs font-mono" placeholder="345600.456" />
                     </div>
                     <div>
                        <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Alt Bruta (H - m) *</label>
                        <input type="number" step="0.001" id="input-override-alt-bruta" required class="glass-input w-full text-xs font-mono" placeholder="320.123" />
                     </div>
                  </div>
               </div>

               <!-- Bloco B: Coordenadas Homologadas/Corrigidas -->
               <div class="bg-[#0c1510]/40 border border-white/5 rounded-xl p-4 space-y-3">
                  <div class="flex justify-between items-center border-b border-white/5 pb-1">
                     <span class="text-[10px] font-bold text-mint-vibrant uppercase tracking-wider">Bloco B: Coordenadas Oficiais (Base Corrigida)</span>
                     <div class="flex gap-2">
                        <button type="button" id="tab-override-geodesica" class="px-2 py-0.5 text-[9px] font-bold rounded bg-mint-vibrant text-forest-deep border border-mint-vibrant/20 transition-all">Geodésica</button>
                        <button type="button" id="tab-override-plana" class="px-2 py-0.5 text-[9px] font-bold rounded bg-white/5 text-white/60 border border-white/10 hover:text-white transition-all">Plana UTM</button>
                     </div>
                  </div>

                  <!-- Campos Geodésicos -->
                  <div id="panel-override-geodesico" class="space-y-3">
                     <div class="grid grid-cols-3 gap-4">
                        <div>
                           <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Latitude (Dec) *</label>
                           <input type="number" step="0.0000000001" id="input-override-lat-corr" class="glass-input w-full text-xs font-mono" placeholder="-23.12345678" />
                        </div>
                        <div>
                           <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Longitude (Dec) *</label>
                           <input type="number" step="0.0000000001" id="input-override-lon-corr" class="glass-input w-full text-xs font-mono" placeholder="-53.12345678" />
                        </div>
                        <div>
                           <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Altitude H (m) *</label>
                           <input type="number" step="0.001" id="input-override-alt-corr-geo" class="glass-input w-full text-xs font-mono" placeholder="320.123" />
                        </div>
                      </div>
                      
                      <!-- Incertezas Geodésicas -->
                      <div class="grid grid-cols-3 gap-4 pt-1">
                         <div>
                            <label class="block text-[8px] text-white/30 uppercase mb-0.5">Sigma Lat (m)</label>
                            <input type="number" step="0.0001" id="input-override-sig-lat" class="glass-input w-full text-[11px] font-mono" value="0.0050" />
                         </div>
                         <div>
                            <label class="block text-[8px] text-white/30 uppercase mb-0.5">Sigma Lon (m)</label>
                            <input type="number" step="0.0001" id="input-override-sig-lon" class="glass-input w-full text-[11px] font-mono" value="0.0050" />
                         </div>
                         <div>
                            <label class="block text-[8px] text-white/30 uppercase mb-0.5">Sigma Alt (m)</label>
                            <input type="number" step="0.0001" id="input-override-sig-alt-geo" class="glass-input w-full text-[11px] font-mono" value="0.0100" />
                         </div>
                      </div>
                   </div>

                   <!-- Campos Planos UTM -->
                   <div id="panel-override-plana" class="space-y-3 hidden">
                      <div class="grid grid-cols-3 gap-4">
                         <div>
                            <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Norte Corrigido (m) *</label>
                            <input type="number" step="0.001" id="input-override-n-corr" class="glass-input w-full text-xs font-mono" placeholder="7432101.450" />
                         </div>
                         <div>
                            <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Este Corrigido (m) *</label>
                            <input type="number" step="0.001" id="input-override-e-corr" class="glass-input w-full text-xs font-mono" placeholder="345601.890" />
                         </div>
                         <div>
                            <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Altitude H (m) *</label>
                            <input type="number" step="0.001" id="input-override-alt-corr-plana" class="glass-input w-full text-xs font-mono" placeholder="320.123" />
                         </div>
                      </div>
                      <div class="grid grid-cols-2 gap-4">
                         <div>
                            <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Fuso UTM (Zona) *</label>
                            <select id="select-override-fuso" class="glass-input w-full text-xs">
                               <option value="21S">21S (EPSG:31981)</option>
                               <option value="22S" selected>22S (EPSG:31982)</option>
                               <option value="23S">23S (EPSG:31983)</option>
                               <option value="24S">24S (EPSG:31984)</option>
                            </select>
                         </div>
                         <div>
                            <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Hemisfério</label>
                            <input type="text" value="Sul" readonly disabled class="glass-input w-full text-xs opacity-50 cursor-not-allowed" />
                         </div>
                      </div>
                   </div>
                </div>

                <!-- Botões do Form -->
                <div class="flex justify-end gap-3 pt-4 border-t border-white/5">
                   <button type="button" class="btn-secondary text-xs" id="btn-cancelar-override">Cancelar</button>
                   <button type="submit" class="btn-primary text-xs" id="btn-submit-override">Aplicar Correção Reativa</button>
                </div>
             </form>
          </div>
       </div>
    </div>

    <!-- MODAL UNIFICAR SIGEF (1A) -->
    <div id="modal-unificar-sigef" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] hidden flex items-center justify-center p-4">
       <div class="glass-card w-full max-w-md overflow-hidden flex flex-col">
          <div class="p-5 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
             <h3 class="text-base font-bold flex items-center gap-2">
                <i data-lucide="file-spreadsheet" class="w-5 h-5 text-mint-vibrant"></i>
                Unificar Arquivos SIGEF (1A)
             </h3>
             <button class="text-white/40 hover:text-white" id="btn-fechar-modal-sigef" type="button">
                <i data-lucide="x" class="w-5 h-5"></i>
             </button>
          </div>
          
          <form id="form-unificar-sigef" class="p-6 space-y-4">
             <div>
                <label class="block text-[10px] text-white/40 uppercase font-bold mb-1.5">1. Arquivo de Vértices (.csv) *</label>
                <input type="file" id="input-sigef-vertices" accept=".csv" required class="glass-input w-full text-xs" />
             </div>
             <div>
                <label class="block text-[10px] text-white/40 uppercase font-bold mb-1.5">2. Arquivo de Limites (.csv) *</label>
                <input type="file" id="input-sigef-limites" accept=".csv" required class="glass-input w-full text-xs" />
             </div>
             <div class="bg-mint-vibrant/5 border border-mint-vibrant/10 p-3 rounded-lg text-[10px] text-white/60 space-y-1">
                <p class="font-bold text-mint-vibrant">Instruções:</p>
                <p>• O arquivo de Vértices deve conter as colunas CODIGO, SIGMA_X, SIGMA_Y, SIGMA_Z, Z e GEOMETRIA_WKT.</p>
                <p>• O arquivo de Limites deve conter as colunas DO_VERTICE e CONFRONTANTE_DESC.</p>
                <p>• O sistema fará a conversão para coordenadas UTM Zone 22S (EPSG:31982) automaticamente.</p>
             </div>
             <div class="flex justify-end gap-3 pt-2">
                <button type="button" class="btn-secondary text-xs" id="btn-cancelar-sigef">Cancelar</button>
                <button type="submit" class="btn-primary text-xs" id="btn-submit-sigef">Unificar e Salvar</button>
             </div>
          </form>
       </div>
    </div>

    <!-- BARRA DE AÇÕES EM LOTE DE VÉRTICES (MESA) -->
    <div id="batch-action-bar-mesa" class="fixed bottom-6 left-1/2 -translate-x-1/2 glass-card border border-mint-vibrant/20 bg-[#0c1510]/95 backdrop-blur-md px-6 py-3 shadow-2xl flex items-center gap-6 z-40 hidden animate-in fade-in slide-in-from-bottom-6 duration-300">
       <div class="flex items-center gap-2 border-r border-white/10 pr-6 shrink-0">
          <span class="w-5 h-5 rounded-full bg-mint-vibrant text-forest-deep flex items-center justify-center text-xs font-bold font-mono" id="batch-selection-count-mesa">0</span>
          <span class="text-xs font-medium text-white/70">Vértices selecionados</span>
       </div>
       <div class="flex items-center gap-3 flex-wrap">
          <button class="px-3 py-1.5 rounded bg-rose-500/20 hover:bg-rose-500 border border-rose-500/30 hover:border-transparent text-rose-300 hover:text-white text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer" id="btn-batch-delete-mesa">
             <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
             Excluir Selecionados
          </button>
          <button class="px-3 py-1.5 rounded bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 text-[11px] font-medium transition-all cursor-pointer" id="btn-batch-clear-mesa">
             Limpar Seleção
          </button>
       </div>
    </div>
  `;
};
