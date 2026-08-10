export function renderFronteiraTemplate(): string {
  return `
    <div class="space-y-6 animate-in fade-in duration-300 select-text">
      <div>
        <h2 class="text-3xl font-bold">Certificação de Área de Fronteira</h2>
        <p class="text-white/40 mt-1">Análise espacial geodésica baseada na propriedade rural e geração documental sob a Lei Federal nº 6.634/79.</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Colunas 1 e 2: Formulário, Seleção de Matrículas e Monitor -->
        <div class="lg:col-span-2 space-y-6">
          <!-- Card de Configuração e Entrada -->
          <div class="glass-card p-6 space-y-6">
            <h3 class="text-sm font-bold uppercase tracking-widest text-white/40 border-b border-white/5 pb-3">Dados de Operação</h3>
            
            <form id="form-gerar-fronteira" class="space-y-5">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="md:col-span-2">
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Selecionar Propriedade *</label>
                  <select id="select-fronteira-prop" required class="glass-input w-full text-xs cursor-pointer">
                     <option value="">Carregando propriedades...</option>
                  </select>
                </div>

                <div class="md:col-span-2 space-y-2">
                  <div class="flex justify-between items-center">
                    <label class="block text-[10px] text-white/40 uppercase font-bold">Selecionar Matrícula(s) *</label>
                    <span class="text-[9px] text-white/30 uppercase cursor-pointer hover:text-white" id="btn-selecionar-todas-m">Marcar Todas</span>
                  </div>
                  <div id="matriculas-checkbox-list" class="glass-input p-3 rounded-xl space-y-2 max-h-[250px] overflow-y-auto border border-white/5 bg-white/[0.01]">
                     <p class="text-xs text-white/30 italic py-2 text-center">Selecione uma propriedade para listar as matrículas correspondentes.</p>
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Responsável Técnico (Profissional) *</label>
                  <select id="select-fronteira-prof" required class="glass-input w-full text-xs cursor-pointer">
                     <option value="">Carregando responsáveis técnicos...</option>
                  </select>
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Número do TRT *</label>
                    <input type="text" id="input-fronteira-trt" required class="glass-input w-full text-xs font-mono uppercase" placeholder="Ex: CFTA-PR-XXXX" />
                  </div>
                  <div>
                    <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Data Quitação</label>
                    <input type="date" id="input-fronteira-data-trt" class="glass-input w-full text-xs" />
                  </div>
                </div>
              </div>

              <!-- Upload de Shapefile geral para a Propriedade (Opcional) -->
              <div class="space-y-2">
                <label class="block text-[10px] text-white/40 uppercase font-bold">Upload de Shapefile (.ZIP) Geral da Propriedade (Opcional)</label>
                <div id="dropzone-shp" class="border border-dashed border-white/10 rounded-xl p-4 text-center cursor-pointer hover:border-mint-vibrant/40 transition-colors flex flex-col items-center justify-center space-y-2 bg-white/[0.005]">
                   <i data-lucide="upload-cloud" class="w-6 h-6 text-white/30" id="icon-upload-shp"></i>
                   <p class="text-xs text-white/60" id="text-upload-shp">Clique ou arraste o Shapefile (.ZIP) Geral</p>
                   <p class="text-[9px] text-white/30 uppercase tracking-wider">Será usado como fallback se a matrícula não possuir shapefile individual</p>
                   <input type="file" id="input-upload-shp" accept=".zip" class="hidden" />
                </div>
              </div>

              <div class="pt-4 border-t border-white/5 flex justify-end">
                <button type="submit" disabled id="btn-submit-fronteira" class="btn-primary text-xs flex items-center gap-1.5 opacity-50 cursor-not-allowed">
                  <i data-lucide="shield-check" class="w-4 h-4"></i>
                  Revisar Dados & Gerar Impressões HTML
                </button>
              </div>
            </form>
          </div>

          <!-- Card do Monitor Geodésico Premium -->
          <div class="glass-card p-6 space-y-4 hidden" id="card-monitor-geodesico">
            <h3 class="text-sm font-bold uppercase tracking-widest text-mint-vibrant border-b border-mint-vibrant/20 pb-3 flex items-center gap-2">
              <i data-lucide="cpu" class="w-4 h-4 animate-pulse"></i>
              Monitor Geodésico de Fronteira (Matrícula Ativa)
            </h3>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div class="bg-white/[0.01] border border-white/5 p-3 rounded-lg flex flex-col justify-between">
                <span class="text-[9px] text-white/30 uppercase font-bold">Referência Espacial</span>
                <span class="text-xs font-mono font-bold text-white mt-1" id="mon-vertice-nome">-</span>
                <span class="text-[9px] text-mint-vibrant/60 font-mono mt-0.5" id="mon-vertice-status">-</span>
              </div>
              <div class="bg-white/[0.01] border border-white/5 p-3 rounded-lg flex flex-col justify-between">
                <span class="text-[9px] text-white/30 uppercase font-bold">Coordenada Extrema (M ou Shapefile)</span>
                <span class="text-[10px] font-mono text-white mt-1 truncate" id="mon-vertice-coords">-</span>
                <span class="text-[9px] text-white/30 font-mono mt-0.5">SIRGAS 2000</span>
              </div>
              <div class="bg-white/[0.01] border border-white/5 p-3 rounded-lg flex flex-col justify-between">
                <span class="text-[9px] text-white/30 uppercase font-bold">Menor Distância até a Soberania</span>
                <span class="text-xs font-mono font-bold text-white mt-1" id="mon-distancia">-</span>
                <span class="text-[9px] text-white/30 font-mono mt-0.5">Brasil-Paraguai</span>
              </div>
            </div>

            <!-- Alerta Legal da Lei 6.634/79 -->
            <div id="alerta-fronteira-legal" class="p-4 rounded-xl flex items-start gap-3 transition-colors duration-300">
               <!-- Alerta inserido dinamicamente no JS -->
            </div>
          </div>
        </div>

        <!-- Coluna 3: Repositório de Documentos Emitidos (Atalhos de Emissão Direta) -->
        <div class="space-y-6">
          <div class="glass-card flex flex-col h-full min-h-[460px]">
            <div class="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
              <h4 class="text-sm font-bold flex items-center gap-2">
                <i data-lucide="folder-open" class="w-5 h-5 text-mint-vibrant"></i>
                Documentos Emitidos (HTML)
              </h4>
              <button class="text-white/40 hover:text-white" id="btn-atualizar-docs" title="Atualizar Lista">
                <i data-lucide="refresh-cw" class="w-4 h-4"></i>
              </button>
            </div>
            
            <div class="p-4 flex-grow overflow-y-auto space-y-3" id="documentos-lista-container">
              <div class="text-center text-white/30 text-xs py-8">Selecione uma propriedade para listar os atalhos de documentos.</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Premium de Cruzamento de Informações e Edição Rápida -->
    <div id="modal-dados-fronteira" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md hidden opacity-0 transition-all duration-300">
      <div class="glass-card w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl animate-in scale-in duration-300 border border-white/10 bg-[#0f1917]/95">
        <!-- Header -->
        <div class="p-6 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
          <div>
            <h3 class="text-lg font-bold flex items-center gap-2 text-white">
              <i data-lucide="database" class="w-5 h-5 text-mint-vibrant animate-pulse"></i>
              Cruzamento de Dados de Fronteira
            </h3>
            <p class="text-xs text-white/40 mt-1">Revisão e preenchimento de metadados obrigatórios das matrículas e do proprietário antes de abrir a impressão.</p>
          </div>
          <button type="button" class="text-white/40 hover:text-white p-2 cursor-pointer" id="btn-close-modal-dados">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        
        <!-- Conteúdo do Modal (Rolável) -->
        <div class="p-6 flex-grow overflow-y-auto space-y-6 text-xs select-text">
          <!-- Aba 1: Dados do Proprietário e Propriedade -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Coluna A: Imóvel Rural -->
            <div class="space-y-4">
              <h4 class="font-bold text-mint-vibrant uppercase tracking-wider text-[10px] border-b border-white/5 pb-1.5 flex items-center gap-1.5">
                <i data-lucide="home" class="w-3.5 h-3.5"></i>
                Dados do Imóvel Rural
              </h4>
              <div class="grid grid-cols-1 gap-3">
                <div>
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Nome do Imóvel *</label>
                  <input type="text" id="modal-prop-nome" required class="glass-input w-full text-xs font-bold" />
                </div>
                <div class="grid grid-cols-3 gap-2">
                  <div class="col-span-2">
                    <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Município *</label>
                    <input type="text" id="modal-prop-municipio" required class="glass-input w-full text-xs" />
                  </div>
                  <div>
                    <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">UF *</label>
                    <input type="text" id="modal-prop-uf" maxlength="2" required class="glass-input w-full text-xs font-mono uppercase text-center" />
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Código CAR</label>
                    <input type="text" id="modal-prop-car" class="glass-input w-full text-xs" placeholder="Ex: PR-1234567..." />
                  </div>
                  <div>
                    <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Código CCIR da Propriedade</label>
                    <input type="text" id="modal-prop-ccir" class="glass-input w-full text-xs font-mono" placeholder="CCIR da gleba" />
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Coluna B: Proprietário Principal -->
            <div class="space-y-4">
              <h4 class="font-bold text-mint-vibrant uppercase tracking-wider text-[10px] border-b border-white/5 pb-1.5 flex items-center gap-1.5">
                <i data-lucide="user" class="w-3.5 h-3.5"></i>
                Proprietário Principal
              </h4>
              <div class="grid grid-cols-1 gap-3">
                <input type="hidden" id="modal-owner-id" />
                <div>
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Nome Completo *</label>
                  <input type="text" id="modal-owner-nome" required class="glass-input w-full text-xs" />
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">CPF/CNPJ *</label>
                    <input type="text" id="modal-owner-cpf" required class="glass-input w-full text-xs font-mono" />
                  </div>
                  <div>
                    <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">RG/IE *</label>
                    <input type="text" id="modal-owner-rg" required class="glass-input w-full text-xs font-mono" />
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Estado Civil *</label>
                    <select id="modal-owner-estado-civil" class="glass-input w-full text-xs cursor-pointer">
                      <option value="Solteiro(a)">Solteiro(a)</option>
                      <option value="Casado(a)">Casado(a)</option>
                      <option value="Divorciado(a)">Divorciado(a)</option>
                      <option value="Viúvo(a)">Viúvo(a)</option>
                      <option value="União Estável">União Estável</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Regime de Bens</label>
                    <input type="text" id="modal-owner-regime" class="glass-input w-full text-xs" placeholder="Ex: Comunhão Parcial" />
                  </div>
                </div>
                
                <!-- Dados do Cônjuge -->
                <div id="modal-conjuge-row" class="p-3 bg-white/[0.01] border border-white/10 rounded-lg space-y-2 hidden">
                  <p class="text-[9px] text-white/40 uppercase font-bold">Informações do Cônjuge</p>
                  <div>
                    <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">Nome do Cônjuge *</label>
                    <input type="text" id="modal-owner-conjuge-nome" class="glass-input w-full text-[11px]" />
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                    <div>
                      <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">CPF Cônjuge *</label>
                      <input type="text" id="modal-owner-conjuge-cpf" class="glass-input w-full text-[11px] font-mono" />
                    </div>
                    <div>
                      <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">RG Cônjuge *</label>
                      <input type="text" id="modal-owner-conjuge-rg" class="glass-input w-full text-[11px] font-mono" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Aba 2: Lista de Matrículas Editáveis -->
          <div class="space-y-4 pt-4 border-t border-white/5">
            <h4 class="font-bold text-mint-vibrant uppercase tracking-wider text-[10px] flex items-center gap-1.5">
              <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
              Dados de Cartório das Matrículas Selecionadas
            </h4>
            
            <div class="space-y-4" id="modal-matriculas-container">
              <!-- Matrículas inseridas dinamicamente -->
            </div>
          </div>
        </div>
        
        <!-- Footer -->
        <div class="p-6 border-t border-white/10 bg-white/[0.01] flex justify-end gap-3 rounded-b-xl">
          <button type="button" class="btn-secondary text-xs cursor-pointer" id="btn-cancel-modal-dados">Cancelar</button>
          <button type="button" class="btn-primary text-xs flex items-center gap-1.5 cursor-pointer" id="btn-save-and-generate">
            <i data-lucide="printer" class="w-4 h-4"></i>
            Salvar Dados & Abrir Impressão
          </button>
        </div>
      </div>
    </div>
  `;
}
