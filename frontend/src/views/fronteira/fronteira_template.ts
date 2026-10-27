/**
 * fronteira_template.ts — Marcação HTML da tela de Certificação de Área de Fronteira.
 * Padrão de tela: "Arquivos .md/PADRAO_TELA_LISTAGEM.md" (barra única, viewport fixo, rolagem interna).
 */
export function renderFronteiraTemplate(): string {
  return `
    <div class="gap-2 animate-in fade-in duration-300 select-text flex flex-col h-full min-h-0 flex-1">
      <!-- Barra superior: título + base legal + ação primária (o submit usa form="..." para ficar sempre visível) -->
      <div class="lp-bar">
        <div class="lp-bar-left">
          <h2 class="lp-titulo">Área de Fronteira</h2>
          <span class="lp-sub lp-oculta-sm" style="font-size:12.5px" title="Análise espacial geodésica baseada na propriedade rural e geração documental sob a Lei Federal nº 6.634/79">Certificação e documentos sob a Lei Federal nº 6.634/79</span>
        </div>
        <div class="lp-bar-right">
          <button type="submit" form="form-gerar-fronteira" disabled id="btn-submit-fronteira" class="lp-btn-primario opacity-50 cursor-not-allowed" title="Selecione propriedade, matrícula(s) e responsável técnico para habilitar">
            <i data-lucide="shield-check" class="w-4 h-4"></i>
            Revisar dados e gerar impressões
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-2 flex-1 min-h-0 overflow-y-auto lg:overflow-visible">
        <!-- Coluna principal: dados de operação + monitor (rola por dentro) -->
        <div class="flex flex-col gap-2 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
          <div class="lp-card" style="flex:none;overflow:visible">
            <div class="lp-card-titulo">Dados de operação</div>
            <form id="form-gerar-fronteira" class="flex flex-col gap-3" style="padding:12px">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label class="lp-campo md:col-span-2">
                  <span>Propriedade *</span>
                  <select id="select-fronteira-prop" required>
                    <option value="">Carregando propriedades...</option>
                  </select>
                </label>

                <div class="md:col-span-2 flex flex-col gap-1">
                  <div class="flex justify-between items-center">
                    <span class="lp-campo-rotulo">Matrícula(s) *</span>
                    <button type="button" class="lp-link" id="btn-selecionar-todas-m">Marcar todas</button>
                  </div>
                  <div id="matriculas-checkbox-list" class="lp-lista-sel">
                    <p class="lp-sub" style="text-align:center;padding:12px 0;font-style:italic">Selecione uma propriedade para listar as matrículas correspondentes.</p>
                  </div>
                </div>

                <label class="lp-campo">
                  <span>Responsável técnico *</span>
                  <select id="select-fronteira-prof" required>
                    <option value="">Carregando responsáveis técnicos...</option>
                  </select>
                </label>
                <div class="grid grid-cols-2 gap-2">
                  <label class="lp-campo">
                    <span>Número do TRT *</span>
                    <input type="text" id="input-fronteira-trt" required class="lp-mono" style="text-transform:uppercase" placeholder="Ex: CFTA-PR-XXXX" autocomplete="off" />
                  </label>
                  <label class="lp-campo">
                    <span>Data quitação</span>
                    <input type="date" id="input-fronteira-data-trt" />
                  </label>
                </div>
              </div>

              <!-- Upload de Shapefile geral para a Propriedade (opcional) -->
              <div id="dropzone-shp" class="lp-dropzone border border-dashed border-white/10 hover:border-mint-vibrant/40 cursor-pointer">
                <i data-lucide="upload-cloud" class="w-6 h-6 text-white/30 shrink-0" id="icon-upload-shp"></i>
                <div class="min-w-0">
                  <p class="text-white/70" style="font-size:13px" id="text-upload-shp">Shapefile (.ZIP) geral da propriedade — clique ou arraste (opcional)</p>
                  <p class="lp-sub" style="font-size:11.5px">Usado como alternativa quando a matrícula não tem shapefile individual</p>
                </div>
                <input type="file" id="input-upload-shp" accept=".zip" class="hidden" />
              </div>
            </form>
          </div>

          <!-- Monitor geodésico (aparece com a matrícula ativa) -->
          <div class="lp-card hidden" id="card-monitor-geodesico" style="flex:none;overflow:visible">
            <div class="lp-card-titulo" style="color:var(--lp-accent)"><i data-lucide="compass"></i>Monitor geodésico de fronteira (matrícula ativa)</div>
            <div style="padding:12px" class="flex flex-col gap-3">
              <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div class="lp-tile">
                  <span class="lp-tile-rotulo">Referência espacial</span>
                  <span class="lp-mono" style="font-size:14px;font-weight:700;color:#fff" id="mon-vertice-nome">-</span>
                  <span class="lp-mono" style="font-size:11.5px;color:var(--lp-accent);opacity:.7" id="mon-vertice-status">-</span>
                </div>
                <div class="lp-tile">
                  <span class="lp-tile-rotulo">Coordenada extrema (M ou shapefile)</span>
                  <span class="lp-mono" style="font-size:12.5px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" id="mon-vertice-coords">-</span>
                  <span class="lp-sub" style="font-size:11.5px">SIRGAS 2000</span>
                </div>
                <div class="lp-tile">
                  <span class="lp-tile-rotulo">Menor distância até a soberania</span>
                  <span class="lp-mono" style="font-size:18px;font-weight:700;color:#fff" id="mon-distancia">-</span>
                  <span class="lp-sub" style="font-size:11.5px">Brasil-Paraguai</span>
                </div>
              </div>
              <!-- Alerta Legal da Lei 6.634/79 (preenchido pelo JS) -->
              <div id="alerta-fronteira-legal" class="p-4 rounded-xl flex items-start gap-3 transition-colors duration-300"></div>
            </div>
          </div>
        </div>

        <!-- Coluna lateral: documentos emitidos (rola por dentro) -->
        <div class="lp-card lg:min-h-0" style="min-height:260px">
          <div class="lp-card-titulo">
            <i data-lucide="folder-open"></i>
            Documentos emitidos (HTML)
            <button type="button" class="lp-ico-btn" style="margin-left:auto" id="btn-atualizar-docs" title="Atualizar lista" aria-label="Atualizar lista de documentos">
              <i data-lucide="refresh-cw"></i>
            </button>
          </div>
          <div class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2" style="padding:10px" id="documentos-lista-container">
            <div class="lp-sub" style="text-align:center;padding:24px 0;font-size:12.5px">Selecione uma propriedade para listar os atalhos de documentos.</div>
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
                    <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">RG/IE</label>
                    <input type="text" id="modal-owner-rg" class="glass-input w-full text-xs font-mono" />
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
                      <label class="block text-[9px] text-white/40 uppercase font-bold mb-0.5">RG Cônjuge</label>
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
