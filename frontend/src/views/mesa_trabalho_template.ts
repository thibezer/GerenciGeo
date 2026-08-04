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
    <div class="workspace-wrapper animate-in fade-in duration-300">
      <header class="ribbon-master-container fluent-ribbon-theme">
        <!-- Camada 1 — App Bar (Application Menu Bar) com Fluent UI -->
        <div id="ribbon-layer1" class="ribbon-layer1">

          <div class="rl1-qat">
            <fluent-button appearance="transparent" class="rl1-btn" id="btn-voltar-lista" title="Voltar para levantamentos (Esc)" type="button">
              <i data-lucide="chevron-left"></i><span>Voltar</span>
            </fluent-button>
            <fluent-button appearance="transparent" class="rl1-btn" id="btn-salvar-rascunho" title="Salvar rascunho (Ctrl+S)" type="button">
              <i data-lucide="save"></i><span>Salvar</span>
            </fluent-button>
            
            <fluent-divider orientation="vertical" class="rl1-separator"></fluent-divider>
            
            <!-- Botões de Navegação Global Fluent UI -->
            <fluent-button appearance="transparent" class="rl1-btn" id="nav-btn-dashboard" title="Dashboard" type="button">
              <i data-lucide="layout-dashboard"></i><span>Dashboard</span>
            </fluent-button>
            <fluent-button appearance="transparent" class="rl1-btn" id="nav-btn-clientes" title="Clientes" type="button">
              <i data-lucide="users"></i><span>Clientes</span>
            </fluent-button>
            <fluent-button appearance="primary" class="rl1-btn active" id="nav-btn-levantamentos" title="Levantamentos" type="button">
              <i data-lucide="map-pin"></i><span>Levantamentos</span>
            </fluent-button>
            <fluent-button appearance="transparent" class="rl1-btn" id="nav-btn-propriedades" title="Propriedades" type="button">
              <i data-lucide="home"></i><span>Propriedades</span>
            </fluent-button>
            <fluent-button appearance="transparent" class="rl1-btn" id="nav-btn-hgo" title="Organizador HGO" type="button">
              <i data-lucide="folder-tree"></i><span>HGO</span>
            </fluent-button>
            <fluent-button appearance="transparent" class="rl1-btn" id="nav-btn-fronteira" title="Área de Fronteira" type="button">
              <i data-lucide="file-check"></i><span>Fronteira</span>
            </fluent-button>
            <fluent-button appearance="transparent" class="rl1-btn" id="nav-btn-ccir" title="Banco CCIR" type="button">
              <i data-lucide="database"></i><span>CCIR</span>
            </fluent-button>
            <fluent-button appearance="transparent" class="rl1-btn" id="nav-btn-configuracoes" title="Configurações" type="button">
              <i data-lucide="settings"></i><span>Configurações</span>
            </fluent-button>
          </div>
          <div class="rl1-spacer"></div>
          <div class="rl1-context">
            <label class="rl1-select-label" for="select-fuso-ribbon">Fuso</label>
            <select id="select-fuso-ribbon" class="rl1-select bg-[#0c1510] text-white" title="Fuso UTM">
              <option value="21" class="bg-[#0c1510]">21S</option>
              <option value="22" class="bg-[#0c1510]" selected>22S</option>
              <option value="23" class="bg-[#0c1510]">23S</option>
              <option value="24" class="bg-[#0c1510]">24S</option>
              <option value="25" class="bg-[#0c1510]">25S</option>
            </select>
            <label class="rl1-select-label" for="select-matricula-ribbon">Matrícula</label>
            <select id="select-matricula-ribbon" class="rl1-select bg-[#0c1510] text-white" style="min-width:140px" title="Matrícula Ativa">
              <option value="" class="bg-[#0c1510]">Selecione...</option>
            </select>
          </div>
          <fluent-divider orientation="vertical" class="rl1-separator"></fluent-divider>
          <div class="rl1-user">
            <fluent-avatar class="rl1-avatar" id="avatar-user" name="Administrador" initials="AD" color="colorful" title="Administrador"></fluent-avatar>
          </div>
        </div>

        <!-- Camada 2 — Metadados do Projeto com Fluent UI Badge -->
        <div id="ribbon-layer2" class="ribbon-layer2">
          <span class="rl2-prop-name" id="txt-nome-propriedade">Carregando...</span>
          <fluent-badge appearance="filled" color="success" class="rl2-badge status-ativo" id="badge-status-lev">—</fluent-badge>
          <fluent-divider orientation="vertical" class="rl2-sep"></fluent-divider>
          <span class="rl2-meta-item">
            <span class="rl2-meta-label">Cliente:</span>
            <span class="rl2-meta-value" id="txt-nome-cliente">—</span>
          </span>
          <fluent-divider orientation="vertical" class="rl2-sep"></fluent-divider>
          <span class="rl2-meta-item">
            <span class="rl2-meta-label">CAR:</span>
            <span class="rl2-meta-value font-mono" id="txt-codigo-car">—</span>
          </span>
          <fluent-divider orientation="vertical" class="rl2-sep"></fluent-divider>
          <span class="rl2-meta-item">
            <span class="rl2-meta-label">TRT:</span>
            <span class="rl2-meta-value font-mono" id="txt-numero-trt">—</span>
          </span>
        </div>

        <!-- Camada 3 — Abas de Ferramentas (Tool Tabs) com Fluent UI Tablist -->
        <div id="ribbon-layer3" class="ribbon-layer3">
          <!-- Sub-camada 3a: Abas de navegação Fluent Tablist -->
          <fluent-tablist class="rl3-tabs" role="tablist">
            <fluent-tab class="rl3-tab active" id="tab-geoprocessamento" role="tab" aria-selected="true" aria-controls="panel-geoprocessamento" data-tab="geoprocessamento">
              <div class="flex items-center justify-center gap-1.5 w-full h-full"><i data-lucide="cpu" aria-hidden="true"></i><span>Mesa Geodésica</span></div>
            </fluent-tab>
            <fluent-tab class="rl3-tab" id="tab-perimetro" role="tab" aria-selected="false" aria-controls="panel-perimetro" data-tab="cartorio">
              <div class="flex items-center justify-center gap-1.5 w-full h-full"><i data-lucide="pentagon" aria-hidden="true"></i><span>Org. de Perímetro</span></div>
            </fluent-tab>
            <fluent-tab class="rl3-tab" id="tab-cartorio" role="tab" aria-selected="false" aria-controls="panel-cartorio" data-tab="documentos">
              <div class="flex items-center justify-center gap-1.5 w-full h-full"><i data-lucide="file-text" aria-hidden="true"></i><span>Peças de Cartório</span></div>
            </fluent-tab>
            <fluent-tab class="rl3-tab" id="tab-auditoria" role="tab" aria-selected="false" aria-controls="panel-auditoria" data-tab="auditoria">
              <div class="flex items-center justify-center gap-1.5 w-full h-full"><i data-lucide="history" aria-hidden="true"></i><span>Histórico de Auditoria</span></div>
            </fluent-tab>
          </fluent-tablist>

          <!-- Sub-camada 3b: Painéis de ferramentas -->
          <div class="rl3-panels">
            <!-- PAINEL: Mesa Geodésica -->
            <div class="rl3-panel" id="panel-geoprocessamento" role="tabpanel">
              <!-- Grupo: Ingestão -->
              <div class="rl3-group" data-group-id="grp-ingestao">
                <div class="rl3-group-tools">
                  <fluent-button appearance="subtle" class="rl3-tool-btn rl3-btn-lg" id="btn-drop-arquivos" title="Arraste ou selecione arquivos .GNS/.TXT" type="button">
                    <i data-lucide="upload-cloud"></i>
                    <span>Ingestão</span>
                  </fluent-button>
                  <fluent-button appearance="primary" class="rl3-tool-btn rl3-btn-lg" id="btn-processar-lote" title="Processar todos os arquivos na fila (F5)" type="button">
                    <i data-lucide="play"></i>
                    <span>Processar Lote</span>
                  </fluent-button>
                </div>
                <div class="rl3-group-label">Ingestão</div>
              </div>
              <fluent-divider orientation="vertical" class="rl3-divider"></fluent-divider>

              <!-- Grupo: Vizinhos (SIGEF) -->
              <div class="rl3-group" data-group-id="grp-vizinhos">
                <div class="rl3-group-tools">
                  <fluent-button appearance="subtle" class="rl3-tool-btn rl3-btn-lg" id="btn-importar-csv-vizinho" title="Importar confrontante (CSV do SIGEF)" type="button">
                    <i data-lucide="download"></i>
                    <span>Importar Vizinhos</span>
                  </fluent-button>
                  <input type="file" id="input-csv-vizinho" class="hidden" accept=".csv,.CSV" multiple />
                  <fluent-button appearance="outline" class="rl3-tool-btn rl3-btn-lg rl3-btn-danger" id="btn-limpar-vizinhos" title="Limpar confrontantes importados" type="button">
                    <i data-lucide="trash-2"></i>
                    <span>Limpar Camada</span>
                  </fluent-button>
                </div>
                <div class="rl3-group-label">Vizinhos (SIGEF)</div>
              </div>
              <fluent-divider orientation="vertical" class="rl3-divider"></fluent-divider>

              <!-- Grupo: Coordenadas -->
              <div class="rl3-group" data-group-id="grp-coordenadas">
                <div class="rl3-group-tools">
                  <div class="rl3-toggle-row">
                    <span class="rl3-toggle-label">Modo:</span>
                    <fluent-button appearance="primary" class="rl3-toggle-btn active" id="btn-modo-utm" data-mode="utm" type="button">UTM</fluent-button>
                    <fluent-button appearance="transparent" class="rl3-toggle-btn" id="btn-modo-geo" data-mode="geodesico" type="button">Geo</fluent-button>
                  </div>
                  <fluent-button appearance="subtle" class="rl3-tool-btn rl3-btn-lg" id="btn-download-rinex-zip" title="Baixar todos os RINEX do workspace como ZIP" type="button">
                    <i data-lucide="archive"></i>
                    <span>RINEX .ZIP</span>
                  </fluent-button>
                  <fluent-button appearance="subtle" class="rl3-tool-btn rl3-btn-lg border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10" id="btn-toggle-fonte-pontos" title="Alternar entre Pontos de Campo (Processamento) e Pontos Homologados da Planilha (SIGEF/INCRA)" type="button">
                    <i data-lucide="layers" class="text-amber-400" id="icon-fonte-pontos"></i>
                    <span id="txt-fonte-pontos" class="text-amber-300 font-semibold">Fonte: Campo</span>
                  </fluent-button>
                </div>
                <div class="rl3-group-label">Coordenadas</div>
              </div>
              <fluent-divider orientation="vertical" class="rl3-divider"></fluent-divider>

              <!-- Grupo: Exportar -->
              <div class="rl3-group" data-group-id="grp-exportar">
                <div class="rl3-group-tools">
                  <!-- Coluna 1 (Botões pequenos) -->
                  <div class="rl3-tool-col">
                    <fluent-button appearance="transparent" class="rl3-tool-btn rl3-btn-small" id="btn-exportar-kml" type="button">
                      <i data-lucide="map-pin"></i>
                      <span>KML</span>
                    </fluent-button>
                    <fluent-button appearance="transparent" class="rl3-tool-btn rl3-btn-small" id="btn-unificar-sigef" type="button">
                      <i data-lucide="file-spreadsheet"></i>
                      <span>Unificar SIGEF</span>
                    </fluent-button>
                  </div>
                  
                  <!-- Botão Grande -->
                  <fluent-button appearance="primary" class="rl3-tool-btn rl3-btn-lg" id="btn-consolidar-pontos-utm" type="button">
                    <i data-lucide="upload"></i>
                    <span>Exportar Dados</span>
                  </fluent-button>

                  <!-- Coluna 2 (Botões pequenos) -->
                  <div class="rl3-tool-col">
                    <fluent-button appearance="transparent" class="rl3-tool-btn rl3-btn-small" id="btn-exportar-tabela-csv" title="Exportar tabela de vértices filtrados em CSV" type="button">
                      <i data-lucide="download"></i>
                      <span>Exportar CSV</span>
                    </fluent-button>
                    <fluent-button appearance="transparent" class="rl3-tool-btn rl3-btn-small" id="btn-exportar-cad" title="Copiar vértices para colar no AutoCAD" type="button">
                      <i data-lucide="copy"></i>
                      <span>Copiar CAD</span>
                    </fluent-button>
                  </div>
                </div>
                <div class="rl3-group-label">Exportar</div>
              </div>
              <fluent-divider orientation="vertical" class="rl3-divider"></fluent-divider>

              <!-- Grupo: Edição -->
              <div class="rl3-group" data-group-id="grp-edicao">
                <div class="rl3-group-tools">
                  <fluent-button appearance="subtle" class="rl3-tool-btn rl3-btn-lg" id="btn-reordenar-caminhamento" title="Ativar modo de reordenação manual do caminhamento" type="button">
                    <i data-lucide="arrow-up-down"></i>
                    <span>Reordenar</span>
                  </fluent-button>
                  <fluent-button appearance="outline" class="rl3-tool-btn rl3-btn-lg rl3-btn-warn" id="btn-override-base-manual" title="Sobrescrever ponto base manualmente" type="button">
                    <i data-lucide="shield-alert"></i>
                    <span>Base Manual</span>
                  </fluent-button>
                </div>
                <div class="rl3-group-label">Edição</div>
              </div>
              <fluent-divider orientation="vertical" class="rl3-divider"></fluent-divider>

              <!-- Grupo: Projeto -->
              <div class="rl3-group" data-group-id="grp-projeto">
                <div class="rl3-group-tools">
                  <fluent-button appearance="subtle" class="rl3-tool-btn rl3-btn-lg" id="btn-sincronizar-nuvem" type="button">
                    <i data-lucide="cloud-lightning"></i>
                    <span>Nuvem</span>
                  </fluent-button>
                  <fluent-button appearance="outline" class="rl3-tool-btn rl3-btn-lg rl3-btn-danger" id="btn-arquivar-projeto-seguro" title="Arquivar este levantamento" type="button">
                    <i data-lucide="archive-x"></i>
                    <span>Arquivar</span>
                  </fluent-button>
                </div>
                <div class="rl3-group-label">Projeto</div>
              </div>
            </div>

            <!-- PAINEL: Organizador de Perímetro -->
            <div class="rl3-panel hidden" id="panel-perimetro" role="tabpanel">
              <div class="rl3-group" data-group-id="grp-topografia">
                <div class="rl3-group-tools">
                  <fluent-button appearance="primary" class="rl3-tool-btn rl3-btn-lg" id="btn-calcular-confrontantes" type="button">
                    <i data-lucide="cpu"></i>
                    <span>Calcular Lados</span>
                  </fluent-button>
                </div>
                <div class="rl3-group-label">Topografia</div>
              </div>
            </div>

            <!-- PAINEL: Peças de Cartório -->
            <div class="rl3-panel hidden" id="panel-cartorio" role="tabpanel">
              <div class="rl3-group" data-group-id="grp-documentos">
                <div class="rl3-group-tools">
                  <fluent-button appearance="primary" class="rl3-tool-btn" id="btn-gerar-requerimento-cri" type="button">
                    <i data-lucide="file-text"></i>
                    <span>Requerimento</span>
                  </fluent-button>
                </div>
                <div class="rl3-group-label">Documentos</div>
              </div>
            </div>

            <!-- PAINEL: Histórico de Auditoria -->
            <div class="rl3-panel hidden" id="panel-auditoria" role="tabpanel">
              <div class="rl3-group" data-group-id="grp-auditoria">
                <div class="rl3-group-tools">
                  <fluent-button appearance="primary" class="rl3-tool-btn rl3-btn-lg" id="btn-verificar-sigmas" type="button">
                    <i data-lucide="shield-check"></i>
                    <span>Validar INCRA</span>
                  </fluent-button>
                </div>
                <div class="rl3-group-label">Auditoria</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main class="workspace-body">
        <!-- PAINEL DE PROPRIEDADES LATERAL (AutoCAD Style) -->
        <aside class="props-panel" id="painel-propriedades">
          <div class="props-panel-header">
            <span class="props-panel-title"> Propriedades</span>
            <button class="props-panel-toggle" id="btn-toggle-props" title="Recolher painel" type="button">
              <i data-lucide="chevron-left"></i>
            </button>
          </div>
          
          <div class="props-panel-body" id="props-panel-content">
            <!-- Renderizado dinamicamente via JS de acordo com a seleção -->
          </div>

          <!-- ORDENADOR MANUAL (Exibido na barra lateral durante a etapa Organizador de Perímetro) -->
          <div class="props-panel-body" id="props-panel-ordenador" style="display: none; flex: 1; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; padding: 8px;">
            <div class="flex flex-col flex-1 min-h-0" id="container-reordenar-manual" style="display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden;">
              <div class="relative w-full mb-1.5 shrink-0">
                <input type="text" id="input-search-ordenador" placeholder="Pesquisar ponto..." class="w-full bg-white/5 border border-white/10 hover:border-mint-vibrant/30 focus:border-mint-vibrant focus:ring-mint-vibrant/20 rounded px-2 py-0.5 text-[11px] text-white placeholder-white/30 focus:outline-none transition-all font-mono" />
                <span class="absolute right-2 top-1/2 -translate-y-1/2 text-white/20 hover:text-mint-vibrant cursor-pointer transition-colors font-bold text-xs" id="btn-clear-search-ordenador" title="Limpar pesquisa">×</span>
              </div>

              <div class="flex items-center justify-between gap-1.5 mb-1.5 shrink-0 text-[9px]">
                <button class="flex items-center gap-1 bg-white/5 hover:bg-mint-vibrant/10 text-white hover:text-mint-vibrant px-2 py-0.5 rounded transition-all font-bold border border-white/10" id="btn-toggle-clique-sequencial" type="button" title="Ativar clique sequencial no mapa para enfileirar pontos">
                  <i data-lucide="play" class="w-3 h-3 text-mint-vibrant" id="icon-clique-sequencial"></i>
                  <span id="txt-clique-sequencial" class="font-mono text-[8.5px]">Caminhar Clique</span>
                </button>
                <div class="flex items-center gap-1 text-white/50 font-mono text-[8.5px]">
                  <span>Travados:</span>
                  <span id="txt-faixa-travada" class="text-mint-vibrant font-bold">Nenhum</span>
                </div>
              </div>

              <div class="flex items-center justify-between gap-1.5 mb-1.5 shrink-0 text-[9px]">
                <button class="flex items-center gap-1 bg-white/5 hover:bg-mint-vibrant/10 text-white hover:text-mint-vibrant px-1.5 py-0.5 rounded transition-all font-bold border border-white/10 w-1/2 justify-center" id="btn-inverter-sentido-ordenador" type="button" title="Inverter a ordem de caminhamento do perímetro inteiro">
                  <i data-lucide="rotate-cw" class="w-3 h-3 text-mint-vibrant"></i>
                  <span class="font-mono text-[8.5px]">Inverter Sentido</span>
                </button>
                <button class="flex items-center gap-1 bg-white/5 hover:bg-mint-vibrant/10 text-white hover:text-mint-vibrant px-1.5 py-0.5 rounded transition-all font-bold border border-white/10 w-1/2 justify-center" id="btn-auto-ordenar-vizinho" type="button" title="Sugerir ordem automática baseada em distância (Nearest Neighbor)">
                  <i data-lucide="sparkles" class="w-3 h-3 text-mint-vibrant"></i>
                  <span class="font-mono text-[8.5px]">Sugerir Ordem</span>
                </button>
              </div>
              
              <div class="flex items-center justify-between gap-1.5 mb-1.5 shrink-0 text-[9px]" id="painel-acoes-travamento">
                <button class="flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 hover:text-amber-100 px-1.5 py-0.5 rounded transition-all font-bold border border-amber-500/20 w-1/2 justify-center" id="btn-travar-sequencia-pontos" type="button" title="Travar os pontos selecionados em uma sequência fixa contígua">
                  <i data-lucide="lock" class="w-3 h-3 text-amber-400"></i>
                  <span class="font-mono text-[8.5px]">Travar Sequência</span>
                </button>
                <button class="flex items-center gap-1 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white px-1.5 py-0.5 rounded transition-all font-bold border border-white/10 w-1/2 justify-center" id="btn-destravar-sequencia-pontos" type="button" title="Destravar pontos selecionados de suas sequências">
                  <i data-lucide="unlock" class="w-3 h-3 text-white/50"></i>
                  <span class="font-mono text-[8.5px]">Destravar</span>
                </button>
              </div>
              
              <div class="overflow-y-auto space-y-0.5 pr-1 border border-white/5 bg-[#0c1510]/20 rounded p-1 flex-1 min-h-0" id="lista-reordenar-simplificada" style="flex: 1; overflow-y: auto; min-height: 120px;">
                <div class="text-white/20 p-4 text-center text-xs">Carregando pontos...</div>
              </div>

              <button class="btn-primary w-full py-1 mt-1.5 text-[11px] font-bold flex items-center justify-center gap-1 shrink-0" id="btn-salvar-ordem-simplificada" type="button">
                <i data-lucide="save" class="w-3.5 h-3.5"></i>
                Salvar Ordem
              </button>
            </div>
          </div>
          
          <div class="props-panel-footer hidden" id="props-panel-actions">
            <button class="btn-primary text-xs w-full" id="btn-props-salvar" type="button">Salvar Alterações</button>
            <button class="btn-secondary text-xs w-full" id="btn-props-descartar" type="button">Descartar</button>
          </div>
          <!-- Alça de Redimensionamento Lateral (Resizer) -->
          <div class="props-panel-resizer" id="props-panel-resizer"></div>
        </aside>

        <!-- ÁREA DE TRABALHO PRINCIPAL (Centro/Direita) -->
        <div class="workspace-main-content">

          <!-- Superior: Mapa Leaflet (Comum a Geoprocessamento e Cartório) -->
          <div class="map-container-wrapper relative" id="container-mapa-leaflet-parent">
             <!-- Banner de Numeração Sugerida INCRA -->
             <div id="banner-sugestao-numeracao" class="bg-forest-deep/40 border border-white/5 px-4 py-1.5 text-[10px] flex items-center justify-between text-xs hidden animate-in slide-in-from-top duration-300">
               <div class="flex items-center gap-2 text-white/80">
                 <i data-lucide="lightbulb" class="w-3.5 h-3.5 text-mint-vibrant animate-pulse"></i>
                 <span><strong>Próximos Vértices INCRA:</strong> Marcos: <span id="sugestao-m" class="font-mono text-mint-vibrant font-bold">-</span> | Pontos: <span id="sugestao-p" class="font-mono text-mint-vibrant font-bold">-</span> | Virtuais: <span id="sugestao-v" class="font-mono text-mint-vibrant font-bold">-</span></span>
               </div>
               <span class="text-[8px] font-mono text-white/20 uppercase tracking-widest">Baseado no Banco de Pontos</span>
             </div>
             <!-- Botão flutuante removido e realocado no header superior -->
             <div id="mapa-triagem" class="mapa-leaflet-canvas"></div>
          </div>

          <!-- Splitter de redimensionamento -->
          <div class="row-splitter" id="splitter-mapa-tabela"></div>

          <!-- ABA 1: Mesa Geodésica (Tabela de Vértices) -->
          <div class="view-panel active-view" id="view-mesa-geodesica">
             <!-- Inferior: Tabela de Vértices Geodésicos -->
             <div class="table-container-wrapper" id="container-tabela-vertices">
                <div class="vtx-filter-bar">
                  <span class="text-[9px] text-white/30 uppercase tracking-wider font-semibold mr-1.5">Filtros:</span>
                  <button class="vtx-filter-chip active" data-filtro="todos">Todos</button>
                  <button class="vtx-filter-chip" data-filtro="bases">Bases (M/B)</button>
                  <button class="vtx-filter-chip" data-filtro="rovers">Rovers (P/V)</button>
                  <button class="vtx-filter-chip" data-filtro="brutos">Brutos</button>
                  <button class="vtx-filter-chip" data-filtro="corrigidos">Corrigidos</button>
                  
                  <button class="text-[9px] px-2 py-0.5 font-bold bg-white/5 border border-white/10 hover:bg-white/10 hover:border-mint-vibrant/40 rounded transition-all text-mint-vibrant ml-2" id="btn-toggle-coordenadas" type="button">
                    Ver em Geodésico
                  </button>
                  <button class="text-[9px] px-2 py-0.5 font-bold bg-white/5 border border-white/10 hover:bg-white/10 hover:border-mint-vibrant/40 rounded transition-all text-mint-vibrant ml-1" id="btn-toggle-ocultar-ignorados" type="button">
                    Ocultar Fora da Poligonal
                  </button>
                  <button class="text-[9px] px-2 py-0.5 font-bold bg-white/5 border border-white/10 hover:bg-white/10 hover:border-mint-vibrant/40 rounded transition-all text-mint-vibrant ml-1" id="btn-ativar-reordenacao" type="button">
                    Reordenar Manual
                  </button>
                  <div class="relative inline-block ml-1" id="dropdown-filtro-arquivos-parent">
                    <button class="text-[9px] px-2.5 py-0.5 font-bold bg-white/5 border border-white/10 hover:bg-white/10 hover:border-mint-vibrant/40 rounded transition-all text-mint-vibrant flex items-center gap-1" id="btn-filtro-arquivos" type="button">
                      <i data-lucide="filter" class="w-3 h-3"></i>
                      Filtrar por Arquivo
                    </button>
                    <!-- Popover flutuante absoluto -->
                    <div class="absolute left-0 mt-1 w-56 bg-[#0e1b14] border border-mint-vibrant/20 rounded shadow-2xl p-3 z-[var(--geo-z-dropdown)] hidden flex flex-col space-y-2 max-h-60 overflow-y-auto" id="popover-filtro-arquivos">
                      <!-- Checkboxes injetadas dinamicamente via JS -->
                    </div>
                  </div>
                  
                  <div class="vtx-filter-spacer"></div>

                  <div class="vtx-search">
                     <i data-lucide="search"></i>
                     <input type="text" id="input-search-ponto" placeholder="Filtrar ponto..." />
                  </div>
                </div>

                <div class="vtx-table-container">
                  <table class="vtx-table">
                    <thead>
                      <tr id="tbl-pontos-header">
                        <th style="width: 36px;">Ord</th>
                        <th style="width: 100px;">Vértice</th>
                        <th style="width: 42px;">Tipo</th>
                        <th class="text-right" style="width: 130px;" id="th-coord1">Este (E)</th>
                        <th class="text-right" style="width: 130px;" id="th-coord2">Norte (N)</th>
                        <th class="text-right" style="width: 62px;" id="th-delta1">Δ E (mm)</th>
                        <th class="text-right" style="width: 62px;" id="th-delta2">Δ N (mm)</th>
                        <th class="text-right" style="width: 72px;">Alt. (m)</th>
                        <th class="text-center" style="width: 36px;">Políg.</th>
                        <th class="text-center" style="width: 75px;">Status</th>
                        <th class="text-left" style="width: 130px;">Origem</th>
                      </tr>
                    </thead>
                    <tbody id="tbl-pontos-triagem">
                      <tr>
                        <td colspan="11" class="text-center py-8 text-white/30">Nenhum ponto carregado.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <!-- Batch Bar Flutuante na tabela -->
                <div class="vtx-batch-bar hidden" id="vtx-batch-bar">
                  <span class="text-[10px] text-white/70 font-mono"><strong id="vtx-batch-count">0</strong> selecionados</span>
                  <div class="rl1-separator"></div>
                  <button class="vtx-filter-chip hover:bg-yellow-500/10 hover:text-yellow-400 border-yellow-500/20" id="btn-batch-ignorar" type="button">Alternar Polígono</button>
                  <button class="vtx-filter-chip hover:bg-red-500/10 hover:text-red-400 border-red-500/20 font-bold" id="btn-batch-deletar" type="button">Apagar Pontos</button>
                  <button class="vtx-filter-chip" id="btn-batch-limpar" type="button">Cancelar</button>
                </div>
             </div>
          </div>

          <!-- ABA 2: Org. de Perímetro (Tabela de Divisas / Segmentos + Ordenador Manual + Workspace GNSS) -->
          <div class="view-panel hidden" id="view-org-perimetro">
             <div class="flex flex-col lg:flex-row gap-0 h-full w-full overflow-hidden">
                <!-- Esquerda: Ordenador Perimetral -->
                <div class="flex flex-col flex-1 h-full overflow-hidden" id="container-ordenador-manual-parent">
                    <div class="flex flex-col h-full p-1.5 space-y-1.5 overflow-y-auto">
                       <!-- Ordenador Manual -->
                       
                       <!-- Workspace GNSS Oculto para compatibilidade com o JS legada -->
                       <div class="hidden" style="display: none !important;">
                          <div id="painel-workspace-gnss">
                            <button id="btn-atualizar-arquivos-list"></button>
                            <button id="btn-testar-busca-rinex"></button>
                            <div id="container-workspace-arquivos"></div>
                            <div id="btn-toggle-workspace-collapse"></div>
                          </div>
                       </div>

                       <!-- MODAL DE INGESTÃO E TRIAGEM DE ARQUIVOS (Auto-Detect Drag & Drop) -->
                       <div id="container-ingestao-arquivos" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[var(--geo-z-modal)] hidden flex items-center justify-center p-4">
                         <div class="bg-[#0e1b14]/95 border border-mint-vibrant/20 w-full max-w-2xl rounded-technical shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
                           <div class="px-6 py-4 border-b border-white/5 flex justify-between items-center shrink-0">
                             <h3 class="text-base font-bold text-white flex items-center gap-2">
                               <i data-lucide="upload-cloud" class="text-mint-vibrant animate-pulse"></i>
                               Triagem e Ingestão de Arquivos GNSS
                             </h3>
                             <button class="text-white/40 hover:text-white transition-colors text-xl font-bold font-mono" id="btn-fechar-modal-ingestao" type="button">×</button>
                           </div>
                           
                           <div class="p-6 overflow-y-auto flex-1 space-y-4">
                             <p class="text-xs text-white/60 leading-relaxed">
                               Defina os vínculos de base e configure a destinação para cada arquivo importado antes de processá-los na Mesa Geodésica.
                             </p>

                             <!-- Dropzone interna para clique/arraste adicional -->
                             <div id="triagem-dropzone" class="border border-dashed border-white/10 hover:border-mint-vibrant/40 rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col justify-center items-center group relative overflow-hidden min-h-[120px]">
                               <i id="triagem-dropzone-icon" data-lucide="upload-cloud" class="w-8 h-8 text-white/30 mb-2"></i>
                               <span id="triagem-dropzone-title" class="text-xs font-bold text-white/70">Arraste múltiplos arquivos para triagem</span>
                               <span id="triagem-dropzone-desc" class="text-[10px] text-white/40">Suporta arquivos .GNS, .TXT, .CSV, .XLSX, .ODS</span>
                             </div>
                             
                             <input type="file" id="triagem-file-input" class="hidden" multiple accept=".gns,.GNS,.txt,.TXT,.csv,.CSV,.xlsx,.XLSX,.ods,.ODS" />
                             
                             <!-- Fila de Arquivos -->
                             <div id="triagem-fila-container" class="space-y-2 max-h-[300px] overflow-y-auto pr-1 hidden">
                               <!-- Injetado dinamicamente -->
                             </div>
                             
                             <!-- Opções Globais -->
                             <div class="bg-white/[0.02] border border-white/5 p-4 rounded flex flex-col md:flex-row gap-4 justify-between items-center hidden" id="triagem-opcoes-lote">
                               <div class="flex items-center gap-2">
                                 <input type="checkbox" id="chk-inverter-ne-mesa" class="rounded bg-white/5 border-white/10 text-mint-vibrant focus:ring-mint-vibrant" />
                                 <label for="chk-inverter-ne-mesa" class="text-xs text-white/70 select-none font-bold">Inverter coordenadas (Norte/Este) na importação</label>
                               </div>
                             </div>
                           </div>
                           
                           <div class="px-6 py-4 border-t border-white/5 flex justify-end gap-3 shrink-0">
                             <button class="btn-secondary text-xs px-4 py-2" id="btn-cancelar-ingestao-modal" type="button">Cancelar</button>
                             <button class="btn-primary text-xs px-5 py-2 flex items-center gap-2 font-bold hidden" id="btn-processar-lote-modal" type="button">
                               <i data-lucide="play" class="w-4 h-4"></i>
                               Iniciar Processamento
                             </button>
                           </div>
                         </div>
                       </div>
                    </div>
                </div>

                <!-- Splitter de redimensionamento inferior -->
                <div class="col-splitter" id="splitter-inferior"></div>

                <!-- Direita: Tabela de Segmentos/Divisas -->
                <div class="flex flex-col shrink-0 h-full overflow-hidden bg-white/[0.005]" id="container-tabela-divisas" style="width: 480px; min-width: 250px;">
                   <div class="px-4 py-3 border-b border-white/5 bg-white/[0.01] flex justify-between items-center shrink-0">
                     <h4 class="text-xs font-bold uppercase tracking-widest text-white/40" id="lbl-titulo-tabela-lateral">Segmentos de Divisa (Confrontantes)</h4>
                     <span class="text-[9px] text-mint-vibrant font-mono bg-mint-vibrant/10 px-2 py-0.5 rounded-full font-bold" id="badge-tabela-lateral">EDICAO REAL-TIME</span>
                   </div>
                   <!-- Formulário Rápido de Inclusão de Confrontante -->
                   <div class="px-4 py-2 border-b border-white/5 bg-white/[0.002] flex gap-2 items-center shrink-0" id="container-confrontante-rapido">
                     <input type="text" id="input-confrontante-nome-rapido" placeholder="Nome do novo confrontante..." class="flex-grow bg-white/5 border border-white/10 hover:border-mint-vibrant/30 focus:border-mint-vibrant focus:ring-mint-vibrant/20 rounded px-2.5 py-1 text-xs text-white placeholder-white/30 focus:outline-none transition-all" />
                     <button class="px-2.5 py-1 text-[10px] font-bold bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/25 hover:bg-mint-vibrant/20 rounded transition-all flex items-center gap-1 shrink-0 active:scale-95" id="btn-confrontante-adicionar-rapido" type="button">
                       <i data-lucide="plus" class="w-3.5 h-3.5"></i>
                       Adicionar
                     </button>
                   </div>
                   <div class="flex-1 overflow-auto" id="container-tabela-lateral-content">
                     <table class="w-full text-left border-collapse text-xs">
                       <thead>
                         <tr class="bg-white/5 text-[9px] font-bold uppercase tracking-widest text-white/30 border-b border-white/5 sticky top-0 z-[var(--geo-z-sticky)]">
                           <th class="px-3 py-2">De ➔ Para</th>
                           <th class="px-2 py-2 text-right">Dist (m)</th>
                           <th class="px-2 py-2 text-right">Azimute</th>
                           <th class="px-3 py-2">Confrontante Oficial / Divisa</th>
                           <th class="px-2 py-2 text-center">Anuên</th>
                           <th class="px-3 py-2 text-center">Peças</th>
                         </tr>
                       </thead>
                       <tbody id="tbl-segmentos-triagem" class="divide-y divide-white/5 text-white/60">
                         <tr>
                           <td colspan="6" class="px-4 py-8 text-center text-white/30">Nenhum segmento atrelado a esta matrícula.</td>
                         </tr>
                       </tbody>
                     </table>
                   </div>
                </div>
             </div>
          </div>

          <!-- ABA 3: Peças de Cartório (Homologação INCRA / SIGEF + Gerador de Peças) -->
          <div class="view-panel hidden" id="view-cartorio">
             <div class="p-6 overflow-y-auto h-full space-y-6" id="panel-homologacao-incra">
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
                     <div id="lista-abas-mapeamento" class="space-y-3 max-h-[200px] overflow-y-auto pr-1"></div>
                   </div>

                   <button class="btn-primary w-full py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 opacity-55 cursor-not-allowed" id="btn-processar-homologacao" disabled type="button">
                     <i data-lucide="upload" class="w-4 h-4"></i>
                     Importar Pontos no Banco
                   </button>
                 </div>

                 <!-- Centro/Direita: Painel de Rastreabilidade e Pontos -->
                 <div class="lg:col-span-2 space-y-4 bg-forest-deep/20 border border-white/5 rounded-xl p-5 flex flex-col min-h-[150px]">
                   <div class="space-y-2">
                     <div class="flex justify-between items-center border-b border-white/5 pb-2">
                       <span class="text-[10px] font-bold text-white/40 uppercase tracking-wider">Arquivos / Planilhas Importadas</span>
                     </div>
                     <div id="container-planilhas-homologadas" class="overflow-x-auto text-xs">
                       <div class="text-white/20 italic py-2 text-center">Nenhuma planilha cadastrada.</div>
                     </div>
                   </div>
                   
                   <div class="space-y-2 flex-grow flex flex-col">
                     <div class="flex justify-between items-center border-b border-white/5 pb-2">
                       <span class="text-[10px] font-bold text-white/40 uppercase tracking-wider">Vértices da Matrícula Ativa</span>
                       <span id="txt-qtd-homologados" class="text-[9px] font-mono bg-white/5 border border-white/10 px-2 py-0.5 rounded text-white/40">0 Pontos</span>
                     </div>
                     <div id="container-vertices-homologados" class="flex-grow overflow-y-auto max-h-[200px] space-y-1.5 text-xs font-mono">
                       <div class="text-white/20 italic py-4 text-center">Selecione uma matrícula com pontos homologados para listar seus vértices.</div>
                     </div>
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
                 <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
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
                   <button class="btn-secondary py-2 px-3 text-xs font-bold flex items-center justify-center gap-2 border-white/10 hover:border-mint-vibrant/30 hover:bg-mint-vibrant/5 text-white active:scale-95" id="btn-emitir-termo-sigef" type="button">
                     <i data-lucide="file-check" class="w-4 h-4 text-mint-vibrant"></i>
                     Termo Resp. SIGEF
                   </button>
                   <button class="btn-secondary py-2 px-3 text-xs font-bold flex items-center justify-center gap-2 border-white/10 hover:border-mint-vibrant/30 hover:bg-mint-vibrant/5 text-white active:scale-95" id="btn-emitir-manual-proprietario" type="button">
                     <i data-lucide="book-open" class="w-4 h-4 text-mint-vibrant"></i>
                     Manual Proprietário
                   </button>
                   <button class="btn-secondary py-2 px-3 text-xs font-bold flex items-center justify-center gap-2 border-white/10 hover:border-mint-vibrant/30 hover:bg-mint-vibrant/5 text-white active:scale-95" id="btn-emitir-anuencia-desmembramento" type="button">
                     <i data-lucide="scissors" class="w-4 h-4 text-mint-vibrant"></i>
                     Anuência Desmembramento
                   </button>
                   <div class="flex gap-2 sm:col-span-2 lg:col-span-1">
                     <select id="select-confrontante-anuencia" class="flex-grow bg-white/5 border border-white/10 hover:border-mint-vibrant/30 focus:border-mint-vibrant rounded px-2 text-xs text-white focus:outline-none transition-all font-medium">
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
                    <div class="flex justify-between items-center border-b border-white/5 pb-2.5">
                       <h6 class="font-bold text-xs text-white/50 uppercase tracking-wider">
                          Qualificação Completa do Confrontante
                       </h6>
                       <span class="text-[9px] font-mono text-white/20" id="txt-conf-id-edicao">ID: -</span>
                    </div>
                    
                    <form id="form-edicao-confrontante" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs" onsubmit="event.preventDefault();">
                       <!-- Bloco 1: Dados Básicos -->
                       <div>
                          <label class="block text-[10px] text-white/30 uppercase font-bold mb-1">CPF / CNPJ</label>
                          <input type="text" id="input-conf-cpf" class="glass-input w-full" placeholder="000.000.000-00" />
                       </div>
                       <div class="lg:col-span-2">
                          <label class="block text-[10px] text-white/30 uppercase font-bold mb-1">Nome Completo / Razão Social *</label>
                          <input type="text" id="input-conf-nome" class="glass-input w-full" placeholder="Nome completo do confrontante" required />
                       </div>
                       <div>
                          <label class="block text-[10px] text-white/30 uppercase font-bold mb-1">RG / Inscrição Estadual</label>
                          <input type="text" id="input-conf-rg" class="glass-input w-full" placeholder="RG ou I.E." />
                       </div>
                       
                       <!-- Bloco 2: Dados Pessoais -->
                       <div>
                          <label class="block text-[10px] text-white/30 uppercase font-bold mb-1">Nacionalidade</label>
                          <input type="text" id="input-conf-nacionalidade" class="glass-input w-full" placeholder="brasileiro(a)" value="brasileiro(a)" />
                       </div>
                       <div>
                          <label class="block text-[10px] text-white/30 uppercase font-bold mb-1">Profissão</label>
                          <input type="text" id="input-conf-profissao" class="glass-input w-full" placeholder="Ex: Pecuarista" />
                       </div>
                       <div>
                          <label class="block text-[10px] text-white/30 uppercase font-bold mb-1">Estado Civil</label>
                          <select id="conf-estado-civil" class="glass-input w-full appearance-none">
                             <option value="solteiro">Solteiro(a)</option>
                             <option value="casado">Casado(a)</option>
                             <option value="divorciado">Divorciado(a)</option>
                             <option value="viuvo">Viúvo(a)</option>
                             <option value="uniao_estavel">União Estável</option>
                          </select>
                       </div>
                       <div>
                          <label class="block text-[10px] text-white/30 uppercase font-bold mb-1">Regime de Bens</label>
                          <select id="conf-regime-bens" class="glass-input w-full appearance-none">
                             <option value="">Não se aplica</option>
                             <option value="comunhao_parcial">Comunhão Parcial</option>
                             <option value="comunhao_universal">Comunhão Universal</option>
                             <option value="separacao_total">Separação Total</option>
                             <option value="participacao_final">Participação Final nos Aquestos</option>
                          </select>
                       </div>
                       
                       <!-- Bloco 3: Dados do Cônjuge (Reativo) -->
                       <div class="col-span-1 lg:col-span-4 grid grid-cols-1 md:grid-cols-3 gap-4 p-3 bg-white/5 border border-white/10 rounded-lg hidden" id="box-conjuge">
                          <div>
                             <label class="block text-[10px] text-white/30 uppercase font-bold mb-1">Nome do Cônjuge</label>
                             <input type="text" id="input-conf-conjuge-nome" class="glass-input w-full" placeholder="Nome completo" />
                          </div>
                          <div>
                             <label class="block text-[10px] text-white/30 uppercase font-bold mb-1">CPF do Cônjuge</label>
                             <input type="text" id="input-conf-conjuge-cpf" class="glass-input w-full" placeholder="000.000.000-00" />
                          </div>
                          <div>
                             <label class="block text-[10px] text-white/30 uppercase font-bold mb-1">RG do Cônjuge</label>
                             <input type="text" id="input-conf-conjuge-rg" class="glass-input w-full" placeholder="RG" />
                          </div>
                       </div>
                       
                       <!-- Bloco 4: Endereço e Imóvel -->
                       <div class="col-span-1 lg:col-span-2">
                          <label class="block text-[10px] text-white/30 uppercase font-bold mb-1">Endereço de Correspondência</label>
                          <input type="text" id="input-conf-endereco" class="glass-input w-full" placeholder="Rua, Número, Bairro, Cidade - UF" />
                       </div>
                       <div class="col-span-1 lg:col-span-2">
                          <label class="block text-[10px] text-white/30 uppercase font-bold mb-1">Matrícula (Nº / CRI / Comarca)</label>
                          <input type="text" id="input-conf-matricula-imovel" class="glass-input w-full" placeholder="Ex: Mat. 12.345 - CRI Ponta Porã" />
                       </div>
                       
                       <!-- Upload de Matrícula PDF -->
                       <div class="col-span-1 lg:col-span-4 p-3 bg-white/5 border border-white/10 rounded-lg flex items-center justify-between gap-4">
                          <div class="flex-grow">
                             <label class="block text-[10px] text-white/30 uppercase font-bold mb-1">Matrícula Anexada (PDF/IMG)</label>
                             <div id="status-matricula-anexo" class="text-xs text-white/50">Nenhum arquivo anexado.</div>
                          </div>
                          <div class="shrink-0 flex gap-2">
                             <label for="file-matricula-conf" class="cursor-pointer bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs px-3 py-1.5 rounded transition-colors flex items-center gap-1">
                                <i data-lucide="upload" class="w-3 h-3"></i>
                                Anexar Arquivo
                             </label>
                             <input type="file" id="file-matricula-conf" accept=".pdf,.png,.jpg,.jpeg" class="hidden" />
                             <button type="button" id="btn-ver-matricula-conf" class="hidden bg-mint-vibrant/20 text-mint-vibrant border border-mint-vibrant/30 hover:bg-mint-vibrant/30 px-3 py-1.5 rounded text-xs transition-colors flex items-center gap-1">
                                <i data-lucide="eye" class="w-3 h-3"></i>
                                Visualizar
                             </button>
                             <button type="button" id="btn-remover-matricula-conf" class="hidden bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 px-3 py-1.5 rounded text-xs transition-colors flex items-center gap-1">
                                <i data-lucide="trash-2" class="w-3 h-3"></i>
                                Remover
                             </button>
                          </div>
                       </div>
                       
                       <div class="md:col-span-2 lg:col-span-4 flex justify-end gap-3 pt-2">
                          <button type="button" class="btn-secondary py-2 px-5 font-bold flex items-center gap-1" id="btn-cancelar-confrontante-qualificacao">
                             Cancelar
                          </button>
                          <button type="button" class="btn-primary py-2 px-5 font-bold flex items-center gap-1" id="btn-salvar-confrontante-qualificacao">
                             <i data-lucide="save" class="w-4 h-4"></i>
                             Salvar Qualificação
                          </button>
                       </div>
                    </form>
                 </div>
               </div>
             </div>
          </div>

          <!-- ABA 4: Histórico de Auditoria (Duplicatas e Logs do Banco de Pontos) -->
          <div class="view-panel hidden" id="view-auditoria">
             <div class="p-6 overflow-y-auto h-full space-y-6">
                <div class="bg-forest-deep/10 border border-white/5 rounded-xl p-5 space-y-4" id="container-auditoria-banco">
                   <div class="flex justify-between items-center border-b border-white/5 pb-3">
                      <h4 class="font-bold text-sm flex items-center gap-2">
                         <i data-lucide="scan" class="w-5 h-5 text-amber-400"></i>
                         Auditoria de Pontos no Banco (Controle de Duplicatas e Arquivos)
                      </h4>
                      <span class="text-[9px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/25 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">Módulo de Integridade</span>
                   </div>
                   
                   <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                      <div class="bg-white/[0.02] border border-white/5 p-4 rounded-technical">
                         <span class="block text-[9px] text-white/40 uppercase tracking-wider mb-1 font-bold">Total Vértices Aprovados</span>
                         <span class="text-2xl font-bold font-mono text-mint-vibrant" id="auditoria-total-pontos">0</span>
                      </div>
                      <div class="bg-white/[0.02] border border-white/5 p-4 rounded-technical">
                         <span class="block text-[9px] text-white/40 uppercase tracking-wider mb-1 font-bold">Mapeados na Matrícula</span>
                         <span class="text-2xl font-bold font-mono text-blue-400" id="auditoria-total-matricula">0</span>
                      </div>
                      <div class="bg-white/[0.02] border border-white/5 p-4 rounded-technical">
                         <span class="block text-[9px] text-white/40 uppercase tracking-wider mb-1 font-bold">Inconsistências / Duplicatas</span>
                         <span class="text-2xl font-bold font-mono text-rose-400" id="auditoria-total-conflitos">0</span>
                      </div>
                   </div>
                   
                   <!-- Inconsistências de Duplicidade no Banco -->
                   <div class="space-y-2 mt-4">
                      <h5 class="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1">
                         <i data-lucide="shield-alert" class="w-4 h-4"></i>
                         Pontos Duplicados ou em Conflito
                      </h5>
                      <div id="container-lista-duplicidades-banco" class="max-h-[220px] overflow-y-auto space-y-2 pr-1 border border-white/5 bg-white/[0.01] rounded-technical p-3 text-xs">
                         <div class="text-white/20 italic py-4 text-center">Nenhum conflito de duplicidade detectado no banco.</div>
                      </div>
                   </div>
                </div>
             </div>
          </div>

        </div>
      </main>

      <!-- =========================================================
           MODAIS DO SISTEMA — fora do <main> para evitar
           conflitos de overflow e stacking context
           ========================================================= -->

      <!-- MODAL IMPORTAR LIMITES -->
      <div id="modal-importar-limites" class="fixed inset-0 bg-black/85 backdrop-blur-sm z-[var(--geo-z-modal)] hidden flex items-center justify-center p-4">
         <div class="glass-card w-full max-w-lg overflow-hidden flex flex-col">
            <div class="p-5 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
               <h3 class="text-base font-bold flex items-center gap-2">
                  <i data-lucide="file-check" class="w-5 h-5 text-mint-vibrant"></i>
                  Importar Confrontantes (Limites)
               </h3>
               <button class="text-white/40 hover:text-white" id="btn-fechar-modal-limites" type="button">
                  <i data-lucide="x" class="w-5 h-5"></i>
               </button>
            </div>
            
            <form id="form-importar-limites" class="p-6 space-y-4">
               <div>
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1.5">Selecione o arquivo de confrontantes (.csv) *</label>
                  <input type="file" id="input-limites-file" accept=".csv" required class="glass-input w-full text-xs" />
               </div>
               <div class="bg-forest-deep/30 border border-white/5 p-3 rounded-lg text-[10px] text-white/50 space-y-1.5">
                  <p class="font-bold text-mint-vibrant">Informações do Layout:</p>
                  <p>• O CSV deve conter as colunas: <strong>do_vertice</strong>, <strong>tipo_limite</strong> (ex: Cerca, Muro, Valo) e <strong>confrontante_desc</strong>.</p>
                  <p>• O sistema associará os confrontantes correspondentes de forma determinística aos segmentos de divisa criados pela ordenação do caminhamento.</p>
               </div>
               <div class="flex justify-end gap-3 pt-2">
                  <button type="button" class="btn-secondary text-xs" id="btn-cancelar-limites">Cancelar</button>
                  <button type="submit" class="btn-primary text-xs" id="btn-submit-limites">Importar e Associar</button>
               </div>
            </form>
         </div>
      </div>

      <!-- MODAL UNIFICAR SIGEF (1A) -->
      <div id="modal-unificar-sigef" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[var(--geo-z-modal)] hidden flex items-center justify-center p-4">
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

      <!-- BARRA DE AÇÕES EM LOTE FLUTUANTE DA MESA DE TRABALHO -->
      <div id="batch-action-bar-mesa" style="z-index: var(--geo-z-toast);" class="fixed bottom-4 left-1/2 -translate-x-1/2 glass-card border border-mint-vibrant/20 bg-[#0c1510]/95 backdrop-blur-md px-3 py-1.5 shadow-2xl flex items-center gap-3 hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
         <span class="text-[10px] text-white/80 font-mono"><strong id="batch-selection-count-mesa" class="text-mint-vibrant">0</strong> selecionados</span>
         <div class="h-3 w-px bg-white/10"></div>
         <div class="flex gap-1.5">
            <button id="btn-batch-filter-mesa" class="bg-indigo-500/10 hover:bg-indigo-500 border border-indigo-500/30 hover:border-transparent text-indigo-300 hover:text-white px-2 py-1 rounded-technical text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer" type="button">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              Filtrar
            </button>
            <button id="btn-batch-integrate-mesa" class="bg-purple-500/10 hover:bg-purple-500 border border-purple-500/30 hover:border-transparent text-purple-300 hover:text-white px-2 py-1 rounded-technical text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer hidden" type="button">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
              Integrar
            </button>
            <button id="btn-batch-delete-mesa" class="bg-red-500/10 hover:bg-red-500 border border-red-500/30 hover:border-transparent text-red-400 hover:text-white px-2 py-1 rounded-technical text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer" type="button">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              Excluir
            </button>
            <button id="btn-batch-cancel-mesa" class="btn-secondary py-1 px-2 text-[10px]" type="button">
              Cancelar
            </button>
         </div>
      </div>

      <!-- MODAL DE FILTRO ESTILO REVIT -->
      <div id="modal-filtro-revit-mesa" style="z-index: var(--geo-z-modal);" class="fixed inset-0 bg-black/80 backdrop-blur-sm hidden flex items-center justify-center p-4">
         <div class="glass-card w-full max-w-sm overflow-hidden flex flex-col border border-indigo-500/20 shadow-2xl">
            <div class="p-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
               <h3 class="text-sm font-bold flex items-center gap-2 text-white">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-indigo-400"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                  Filtro de Seleção
               </h3>
               <button class="text-white/40 hover:text-white" id="btn-fechar-modal-filtro" type="button">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
               </button>
            </div>
            
            <div class="p-5 space-y-4">
               <span class="block text-[10px] text-white/40 uppercase font-bold tracking-wider">Selecione as categorias que deseja manter na seleção:</span>
               
               <div id="container-categorias-filtro" class="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                  <!-- Inserido dinamicamente via JS -->
               </div>
               
               <div class="flex justify-between border-t border-white/5 pt-3">
                  <div class="flex gap-2">
                     <button type="button" class="px-2 py-1 text-[9px] font-bold bg-white/5 hover:bg-white/10 text-white/80 rounded transition-all" id="btn-filtro-selecionar-todos">Todos</button>
                     <button type="button" class="px-2 py-1 text-[9px] font-bold bg-white/5 hover:bg-white/10 text-white/80 rounded transition-all" id="btn-filtro-limpar-todos">Nenhum</button>
                  </div>
                  <div class="flex gap-2">
                     <button type="button" class="btn-secondary py-1 px-3 text-xs" id="btn-filtro-cancelar">Cancelar</button>
                     <button type="button" class="btn-primary py-1 px-3 text-xs bg-indigo-600 hover:bg-indigo-500 border-transparent text-white" id="btn-filtro-aplicar">OK</button>
                  </div>
               </div>
            </div>
         </div>
      </div>


</div>
  `;
};