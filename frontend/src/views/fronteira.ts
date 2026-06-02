import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { initIcons } from '../utils';

// Coordenada do Paraguai/Fronteira estabelecida
const BORDER_LAT = -24.0671222;
const BORDER_LON = -54.2868778;

const calcularHaversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; // Raio da Terra em km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const fronteiraRoute: RouteDef = {
  render: () => `
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
  `,
  setup: () => {
    let currentPropId: number | null = null;
    let currentLevantamentoId: number | null = null;
    let currentProfId: number | null = null;
    let fallbackDistanciaKm: number | null = null;
    let fallbackLat: number | null = null;
    let fallbackLon: number | null = null;

    let dadosConsolidadosFronteira: any = null;

    const selectProp = document.getElementById('select-fronteira-prop') as HTMLSelectElement;
    const selectProf = document.getElementById('select-fronteira-prof') as HTMLSelectElement;
    const btnSubmit = document.getElementById('btn-submit-fronteira') as HTMLButtonElement;
    const formFronteira = document.getElementById('form-gerar-fronteira');
    const cardMonitor = document.getElementById('card-monitor-geodesico');
    const btnAtualizarDocs = document.getElementById('btn-atualizar-docs');

    // Elementos do Upload Geral
    const dropzoneShp = document.getElementById('dropzone-shp');
    const inputUploadShp = document.getElementById('input-upload-shp') as HTMLInputElement;
    const textUploadShp = document.getElementById('text-upload-shp');
    const iconUploadShp = document.getElementById('icon-upload-shp');

    // Elementos do Modal
    const modal = document.getElementById('modal-dados-fronteira');
    const btnCloseModal = document.getElementById('btn-close-modal-dados');
    const btnCancelModal = document.getElementById('btn-cancel-modal-dados');
    const btnSaveAndGenerate = document.getElementById('btn-save-and-generate') as HTMLButtonElement;
    const modalOwnerEstadoCivil = document.getElementById('modal-owner-estado-civil') as HTMLSelectElement;
    const modalConjugeRow = document.getElementById('modal-conjuge-row');

    // Carrega Propriedades
    const loadPropriedades = () => {
      fetch(`${API_BASE}/propriedades`)
        .then(res => res.json())
        .then(data => {
          if (!data || data.length === 0) {
            selectProp.innerHTML = '<option value="">Nenhuma propriedade ativa</option>';
            return;
          }
          selectProp.innerHTML = '<option value="">[Selecione a Propriedade]</option>' + data.map((p: any) => `
            <option value="${p.id}">${p.nome_propriedade} (${p.municipio}/${p.uf})</option>
          `).join('');
        })
        .catch(() => {
          selectProp.innerHTML = '<option value="">Erro ao carregar propriedades</option>';
        });
    };

    // Carrega Profissionais
    const loadProfissionais = () => {
      fetch(`${API_BASE}/profissionais`)
        .then(res => res.json())
        .then(data => {
          if (!data || data.length === 0) {
            selectProf.innerHTML = '<option value="">Nenhum profissional cadastrado</option>';
            return;
          }
          selectProf.innerHTML = '<option value="">[Selecione o Responsável Técnico]</option>' + data.map((p: any) => `
            <option value="${p.id}">${p.nome} (Registro: ${p.registro})</option>
          `).join('');
        })
        .catch(() => {
          selectProf.innerHTML = '<option value="">Erro ao carregar profissionais</option>';
        });
    };

    // Carrega Dados de Fronteira (Matrículas, Proprietário, CAR, CCIR)
    const loadDadosFronteira = (propId: number) => {
      const container = document.getElementById('matriculas-checkbox-list');
      if (!container) return;
      container.innerHTML = '<p class="text-xs text-white/30 italic py-2 text-center animate-pulse">Consultando dados de matrícula e integridade espacial...</p>';

      fetch(`${API_BASE}/propriedades/${propId}/dados-fronteira`)
        .then(res => res.json())
        .then(data => {
          dadosConsolidadosFronteira = data;
          const matriculas = data.matriculas || [];
          if (matriculas.length === 0) {
            container.innerHTML = '<p class="text-xs text-white/30 italic py-2 text-center">Nenhuma matrícula vinculada a esta propriedade rural.</p>';
            return;
          }

          container.innerHTML = matriculas.map((m: any) => {
            const hasShp = m.has_shapefile;
            const dist = m.distancia_fronteira_km;
            const alerts = [];
            if (!m.ccir) alerts.push("Falta CCIR");
            if (!m.cri_comarca) alerts.push("Falta Comarca");
            if (!m.livro_registro) alerts.push("Falta Livro/Folha");
            
            const alertHtml = alerts.length > 0 
              ? `<span class="text-[9px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded font-bold">${alerts.join(" • ")}</span>`
              : `<span class="text-[9px] text-mint-vibrant bg-mint-vibrant/10 px-1.5 py-0.5 rounded font-bold">✓ Metadados Completos</span>`;

            return `
              <div class="flex flex-col md:flex-row md:items-center justify-between p-3 rounded-lg border border-white/5 bg-white/[0.005] hover:border-mint-vibrant/20 transition-all gap-3" data-matricula-id="${m.id}">
                <div class="flex items-center gap-3">
                  <input type="checkbox" name="selected-matriculas" value="${m.id}" class="rounded border-white/10 text-mint-vibrant focus:ring-mint-vibrant/30 bg-black/40 w-4 h-4 cursor-pointer checkbox-matricula-item" />
                  <div>
                    <span class="text-xs font-bold text-white">Mat. ${m.numero_matricula}</span>
                    <span class="text-[10px] text-white/40 ml-2">(${(m.area_ha || 0).toFixed(4)} ha)</span>
                    <div class="flex items-center gap-2 mt-1">
                      ${hasShp 
                        ? `<span class="text-[9px] text-mint-vibrant bg-mint-vibrant/10 px-1.5 py-0.5 rounded flex items-center gap-1"><i data-lucide="check-circle" class="w-2.5 h-2.5"></i> Shapefile Ativo</span>`
                        : `<span class="text-[9px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded flex items-center gap-1"><i data-lucide="alert-triangle" class="w-2.5 h-2.5"></i> Sem Shapefile</span>`}
                      ${dist !== null
                        ? `<span class="text-[9px] text-white/40 bg-white/5 px-1.5 py-0.5 rounded font-mono">${dist.toFixed(3)} km da divisa</span>`
                        : ''}
                      ${alertHtml}
                    </div>
                  </div>
                </div>
                
                <div class="flex items-center gap-2">
                  <button type="button" onclick="window.triggerUploadShapefileMatricula(${m.id})" class="btn-secondary text-[10px] px-2 py-1 flex items-center gap-1 bg-white/5 hover:bg-white/10 text-white/70" title="Upload de Shapefile (.ZIP) exclusivo desta matrícula">
                    <i data-lucide="upload" class="w-3.5 h-3.5"></i>
                    Shapefile
                  </button>
                  <input type="file" id="input-upload-shp-${m.id}" accept=".zip" class="hidden" onchange="window.handleUploadShapefileMatricula(${m.id}, this)" />
                </div>
              </div>
            `;
          }).join('');
          initIcons();

          // Liga os listeners para monitorar mudanças e focar no Monitor Geodésico
          document.querySelectorAll('.checkbox-matricula-item').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
              atualizarMonitorGeodesicoLote();
              verificarHabilitacaoBotao();
            });
          });

          // Fallback geodésico da propriedade
          loadBasePontoBanco(propId);
          verificarHabilitacaoBotao();
          loadWorkspaceDocuments();
        })
        .catch((err) => {
          console.error(err);
          container.innerHTML = '<p class="text-xs text-red-400 text-center py-2">Falha crítica ao carregar dados geodésicos das matrículas.</p>';
        });
    };

    // Carrega Base Geodésica geral da propriedade para fallback do monitor
    const loadBasePontoBanco = (propId: number) => {
      fetch(`${API_BASE}/levantamentos`)
        .then(res => res.json())
        .then(levantamentos => {
          const levs = levantamentos.filter((l: any) => l.propriedade_id === propId);
          if (levs.length === 0) {
            atualizarMonitorGeodesicoLote();
            return;
          }
          
          fetch(`${API_BASE}/levantamentos/${levs[0].id}/pontos`)
            .then(res => res.json())
            .then(pontos => {
              const marcos = pontos.filter((p: any) => p.tipo_ponto === 'M');
              marcos.sort((a: any, b: any) => (b.status_ponto === 'CORRIGIDO' ? 1 : 0) - (a.status_ponto === 'CORRIGIDO' ? 1 : 0));
              
              if (marcos.length === 0) {
                atualizarMonitorGeodesicoLote();
                return;
              }
              
              const base = marcos[0];
              const lat = base.lat_corrigido !== null ? base.lat_corrigido : base.lat;
              const lon = base.lon_corrigido !== null ? base.lon_corrigido : base.lon;
              
              if (lat && lon) {
                fallbackLat = lat;
                fallbackLon = lon;
                fallbackDistanciaKm = calcularHaversine(lat, lon, BORDER_LAT, BORDER_LON);
              }
              atualizarMonitorGeodesicoLote();
            })
            .catch(() => {
              atualizarMonitorGeodesicoLote();
            });
        })
        .catch(() => {
          atualizarMonitorGeodesicoLote();
        });
    };

    // Atualiza o monitor de forma reativa a partir das matrículas selecionadas
    const atualizarMonitorGeodesicoLote = () => {
      const checkboxes = document.querySelectorAll('input[name="selected-matriculas"]:checked') as NodeListOf<HTMLInputElement>;
      
      if (checkboxes.length > 0) {
        let matComDados: any = null;
        if (dadosConsolidadosFronteira && dadosConsolidadosFronteira.matriculas) {
          for (let i = 0; i < checkboxes.length; i++) {
            const mId = parseInt(checkboxes[i].value);
            const found = dadosConsolidadosFronteira.matriculas.find((m: any) => m.id === mId);
            if (found && (found.distancia_fronteira_km !== null || found.has_shapefile)) {
              matComDados = found;
              break;
            }
          }
        }

        if (matComDados) {
          const lat = matComDados.lat || BORDER_LAT;
          const lon = matComDados.lon || BORDER_LON;
          const dist = matComDados.distancia_fronteira_km || 0;
          const status = matComDados.has_shapefile ? "Shapefile Individual" : "Base M do Banco de Dados";
          exibirDadosNoMonitor(`Matrícula ${matComDados.numero_matricula}`, status, lat, lon, dist);
          cardMonitor?.classList.remove('hidden');
          return;
        }
      }

      if (fallbackDistanciaKm !== null && fallbackLat !== null && fallbackLon !== null) {
        exibirDadosNoMonitor("Vértice Extremo", "Base Geral da Propriedade", fallbackLat, fallbackLon, fallbackDistanciaKm);
        cardMonitor?.classList.remove('hidden');
      } else {
        cardMonitor?.classList.add('hidden');
      }
    };

    const exibirDadosNoMonitor = (ref: string, status: string, lat: number, lon: number, dist: number) => {
      const monNome = document.getElementById('mon-vertice-nome');
      const monCoords = document.getElementById('mon-vertice-coords');
      const monDist = document.getElementById('mon-distancia');
      const monStatus = document.getElementById('mon-vertice-status');
      
      if (monNome) monNome.innerText = ref;
      if (monStatus) monStatus.innerText = status;
      if (monCoords) monCoords.innerText = lat === BORDER_LAT ? 'N/A' : `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
      if (monDist) monDist.innerText = `${dist.toFixed(3)} km`;

      const alertaBox = document.getElementById('alerta-fronteira-legal');
      if (alertaBox) {
        if (dist <= 150) {
          alertaBox.className = "p-4 rounded-xl flex items-start gap-3 bg-red-500/10 border border-red-500/20 text-red-400 font-sans text-xs leading-relaxed";
          alertaBox.innerHTML = `
            <i data-lucide="shield-alert" class="w-5 h-5 shrink-0 mt-0.5 text-red-400"></i>
            <div>
              <p class="font-bold uppercase tracking-wider text-[10px]">Atenção: Imóvel dentro da Faixa de Fronteira</p>
              <p class="mt-1 text-white/70">O imóvel está situado a <strong>${dist.toFixed(3)} km</strong> da soberania nacional, enquadrando-se na Faixa de Segurança de 150 km. O processo de ratificação é <strong>obrigatório</strong>.</p>
            </div>
          `;
        } else {
          alertaBox.className = "p-4 rounded-xl flex items-start gap-3 bg-mint-vibrant/10 border border-mint-vibrant/20 text-mint-vibrant font-sans text-xs leading-relaxed";
          alertaBox.innerHTML = `
            <i data-lucide="shield-check" class="w-5 h-5 shrink-0 mt-0.5 text-mint-vibrant"></i>
            <div>
              <p class="font-bold uppercase tracking-wider text-[10px]">Imóvel fora da Faixa de Fronteira</p>
              <p class="mt-1 text-white/70">O imóvel está situado a <strong>${dist.toFixed(3)} km</strong> da divisa internacional. O processo de ratificação de fronteira da Lei 6.634/79 é <strong>dispensado</strong> de forma determinística.</p>
            </div>
          `;
        }
        initIcons();
      }
    };

    // Renderiza links e atalhos rápidos das matrículas na barra lateral
    const loadWorkspaceDocuments = () => {
      const container = document.getElementById('documentos-lista-container');
      if (!container) return;

      if (!dadosConsolidadosFronteira || !dadosConsolidadosFronteira.matriculas) {
        container.innerHTML = '<div class="text-center text-white/30 text-xs py-8 animate-pulse">Carregando atalhos rápidos...</div>';
        return;
      }

      const matriculas = dadosConsolidadosFronteira.matriculas || [];
      if (matriculas.length === 0) {
        container.innerHTML = `
          <div class="text-center py-12 text-white/20 border border-dashed border-white/5 rounded-xl flex flex-col items-center justify-center">
             <i data-lucide="folder" class="w-8 h-8 text-white/20 mb-2"></i>
             <p class="text-xs">Nenhuma matrícula cadastrada.</p>
          </div>
        `;
        initIcons();
        return;
      }

      container.innerHTML = matriculas.map((m: any) => `
        <div class="p-3 bg-white/[0.01] border border-white/5 hover:border-mint-vibrant/20 rounded-xl space-y-3 transition-all select-none">
          <div class="border-b border-white/5 pb-2">
            <p class="text-xs font-bold text-white/80">Matrícula nº ${m.numero_matricula || 'N/A'}</p>
            <p class="text-[9px] text-white/30 font-mono mt-0.5">${(m.area_ha || 0).toFixed(4)} ha • ${m.cri_comarca || 'Comarca não definida'}</p>
          </div>
          
          <div class="flex flex-col gap-2">
            <button 
              onclick="window.abrirLaudoFronteiraHTML(${m.id})"
              class="w-full bg-white/5 hover:bg-mint-vibrant text-white/70 hover:text-forest-deep p-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              Laudo Técnico (HTML)
            </button>
            <button 
              onclick="window.abrirRequerimentoFronteiraHTML(${m.id})"
              class="w-full bg-white/5 hover:bg-mint-vibrant text-white/70 hover:text-forest-deep p-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              Requerimento (HTML)
            </button>
          </div>
        </div>
      `).join('');
      initIcons();
    };

    // Expõe atalhos rápidos globais no window
    (window as any).abrirLaudoFronteiraHTML = (mId: number) => {
      if (!currentLevantamentoId) {
        alert("Não foi localizado nenhum levantamento ativo para esta propriedade.");
        return;
      }
      const trtInput = (document.getElementById('input-fronteira-trt') as HTMLInputElement)?.value.trim() || "RT-PROVISORIO";
      const dataInput = (document.getElementById('input-fronteira-data-trt') as HTMLInputElement)?.value || "";
      
      const url = `${API_BASE}/levantamentos/${currentLevantamentoId}/matriculas/${mId}/laudo-fronteira-html?numero_trt=${encodeURIComponent(trtInput)}&data_trt=${encodeURIComponent(dataInput)}`;
      window.open(url, '_blank');
    };

    (window as any).abrirRequerimentoFronteiraHTML = (mId: number) => {
      if (!currentLevantamentoId) {
        alert("Não foi localizado nenhum levantamento ativo para esta propriedade.");
        return;
      }
      const url = `${API_BASE}/levantamentos/${currentLevantamentoId}/matriculas/${mId}/requerimento-ratificacao-html`;
      window.open(url, '_blank');
    };

    // Expor gatilho e tratamento de upload para matrículas individuais
    (window as any).triggerUploadShapefileMatricula = (mId: number) => {
      const inp = document.getElementById(`input-upload-shp-${mId}`) as HTMLInputElement;
      if (inp) inp.click();
    };

    (window as any).handleUploadShapefileMatricula = async (mId: number, input: HTMLInputElement) => {
      if (!currentPropId) return;
      if (!input.files || input.files.length === 0) return;

      const file = input.files[0];
      const formData = new FormData();
      formData.append('file', file);

      const btn = input.previousElementSibling as HTMLButtonElement;
      const originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="refresh-cw" class="w-3 h-3 animate-spin"></i> Lendo...`;
      initIcons();

      try {
        const res = await fetch(`${API_BASE}/propriedades/${currentPropId}/upload-shapefile-fronteira?matricula_id=${mId}`, {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        
        if (data.error || (data.detail && typeof data.detail === 'string')) {
          alert(`Erro ao processar Shapefile: ${data.error || data.detail}`);
        } else {
          alert(`Shapefile associado com sucesso à matrícula!\n\nMenor distância calculada até a fronteira: ${data.distancia_fronteira_km.toFixed(3)} km.`);
          loadDadosFronteira(currentPropId);
        }
      } catch (err) {
        console.error("Erro no upload do shapefile da matrícula:", err);
        alert("Erro de comunicação com o servidor.");
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
        initIcons();
        input.value = '';
      }
    };

    const verificarHabilitacaoBotao = () => {
      const checkboxes = document.querySelectorAll('input[name="selected-matriculas"]:checked');
      if (currentPropId && checkboxes.length > 0 && currentProfId) {
        btnSubmit.disabled = false;
        btnSubmit.classList.remove('opacity-50', 'cursor-not-allowed');
      } else {
        btnSubmit.disabled = true;
        btnSubmit.classList.add('opacity-50', 'cursor-not-allowed');
      }
    };

    // --- MANIPULADORES DE UPLOAD DE SHAPEFILE GERAL ---

    dropzoneShp?.addEventListener('click', () => {
      inputUploadShp.click();
    });

    dropzoneShp?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzoneShp.classList.add('border-mint-vibrant/60', 'bg-mint-vibrant/5');
    });

    dropzoneShp?.addEventListener('dragleave', () => {
      dropzoneShp.classList.remove('border-mint-vibrant/60', 'bg-mint-vibrant/5');
    });

    dropzoneShp?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzoneShp.classList.remove('border-mint-vibrant/60', 'bg-mint-vibrant/5');
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.name.endsWith('.zip')) {
          lidarComArquivoShapefileGeral(file);
        } else {
          alert("Por favor, envie o Shapefile no formato .ZIP contendo os arquivos .shp, .shx, .dbf e .prj.");
        }
      }
    });

    inputUploadShp.addEventListener('change', () => {
      if (inputUploadShp.files && inputUploadShp.files.length > 0) {
        const file = inputUploadShp.files[0];
        lidarComArquivoShapefileGeral(file);
      }
    });

    const lidarComArquivoShapefileGeral = async (file: File) => {
      if (!currentPropId) {
        alert("Por favor, selecione a propriedade rural antes de subir o Shapefile.");
        inputUploadShp.value = '';
        return;
      }

      if (textUploadShp) textUploadShp.innerText = "Processando arquivo...";
      if (dropzoneShp) dropzoneShp.classList.add('animate-pulse', 'border-mint-vibrant/40');
      
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch(`${API_BASE}/propriedades/${currentPropId}/upload-shapefile-fronteira`, {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        
        if (data.error || (data.detail && typeof data.detail === 'string')) {
          alert(`Erro ao processar Shapefile: ${data.error || data.detail}`);
          resetarEstadoUploadGeral();
        } else {
          fallbackDistanciaKm = data.distancia_fronteira_km;
          fallbackLat = data.lat;
          fallbackLon = data.lon;

          if (textUploadShp) textUploadShp.innerHTML = `<span class="text-mint-vibrant font-bold">✓ Shapefile Geral Processado: ${file.name}</span>`;
          if (iconUploadShp) {
            iconUploadShp.className = "w-6 h-6 text-mint-vibrant";
            iconUploadShp.setAttribute("data-lucide", "check-circle");
          }
          initIcons();
          
          atualizarMonitorGeodesicoLote();
          alert(`Shapefile Geral lido com sucesso!\n\nMenor distância calculada até a divisa: ${data.distancia_fronteira_km.toFixed(3)} km.`);
          
          loadDadosFronteira(currentPropId);
        }
      } catch (err) {
        console.error("Erro no upload do shapefile geral:", err);
        alert("Erro ao enviar Shapefile para o servidor.");
        resetarEstadoUploadGeral();
      } finally {
        if (dropzoneShp) dropzoneShp.classList.remove('animate-pulse', 'border-mint-vibrant/40');
        inputUploadShp.value = '';
      }
    };

    const resetarEstadoUploadGeral = () => {
      fallbackDistanciaKm = null;
      fallbackLat = null;
      fallbackLon = null;
      if (textUploadShp) textUploadShp.innerText = "Clique ou arraste o Shapefile (.ZIP) Geral";
      if (iconUploadShp) {
        iconUploadShp.className = "w-6 h-6 text-white/30";
        iconUploadShp.setAttribute("data-lucide", "upload-cloud");
      }
      initIcons();
      atualizarMonitorGeodesicoLote();
    };

    // --- MANIPULAÇÃO DO MODAL E CRUZAMENTO DE DADOS ---

    const abrirModalFronteira = () => {
      if (!dadosConsolidadosFronteira || !modal) return;

      const prop = dadosConsolidadosFronteira.propriedade;
      const owner = dadosConsolidadosFronteira.proprietario || {
        id: 0, nome_completo: "", cpf_cnpj: "", rg_ie: "", estado_civil: "Solteiro(a)", regime_bens: "",
        nome_conjuge: "", cpf_conjuge: "", rg_conjuge: ""
      };

      // Preenche dados do Imóvel Rural
      (document.getElementById('modal-prop-nome') as HTMLInputElement).value = prop.nome_propriedade || '';
      (document.getElementById('modal-prop-municipio') as HTMLInputElement).value = prop.municipio || '';
      (document.getElementById('modal-prop-uf') as HTMLInputElement).value = prop.uf || '';
      (document.getElementById('modal-prop-car') as HTMLInputElement).value = prop.codigo_car || '';
      (document.getElementById('modal-prop-ccir') as HTMLInputElement).value = prop.codigo_ccir || '';

      // Preenche dados do Proprietário
      (document.getElementById('modal-owner-id') as HTMLInputElement).value = owner.id || '0';
      (document.getElementById('modal-owner-nome') as HTMLInputElement).value = owner.nome_completo || '';
      (document.getElementById('modal-owner-cpf') as HTMLInputElement).value = owner.cpf_cnpj || '';
      (document.getElementById('modal-owner-rg') as HTMLInputElement).value = owner.rg_ie || '';
      modalOwnerEstadoCivil.value = owner.estado_civil || 'Solteiro(a)';
      (document.getElementById('modal-owner-regime') as HTMLInputElement).value = owner.regime_bens || '';

      // Cônjuge
      (document.getElementById('modal-owner-conjuge-nome') as HTMLInputElement).value = owner.nome_conjuge || '';
      (document.getElementById('modal-owner-conjuge-cpf') as HTMLInputElement).value = owner.cpf_conjuge || '';
      (document.getElementById('modal-owner-conjuge-rg') as HTMLInputElement).value = owner.rg_conjuge || '';

      tratarExibicaoConjuge(owner.estado_civil);

      // Renderiza as Matrículas Selecionadas
      const mContainer = document.getElementById('modal-matriculas-container');
      if (mContainer) {
        const checkedBoxes = document.querySelectorAll('input[name="selected-matriculas"]:checked') as NodeListOf<HTMLInputElement>;
        const selectedIds = Array.from(checkedBoxes).map(c => parseInt(c.value));
        const activeMats = dadosConsolidadosFronteira.matriculas.filter((m: any) => selectedIds.includes(m.id));

        mContainer.innerHTML = activeMats.map((m: any) => `
          <div class="p-4 bg-white/[0.005] border border-white/10 rounded-xl space-y-3 relative group" data-modal-matricula-id="${m.id}">
            <div class="flex justify-between items-center border-b border-white/5 pb-2">
              <span class="font-bold text-white text-[11px]">Matrícula Registro nº ${m.numero_matricula}</span>
              <span class="text-[9px] text-white/30 font-mono">ID: ${m.id} • Área: ${(m.area_ha || 0).toFixed(4)} ha</span>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Número Matrícula *</label>
                <input type="text" value="${m.numero_matricula || ''}" class="glass-input w-full text-[11px] modal-mat-numero font-bold" required />
              </div>
              <div>
                <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Código CCIR (Matrícula) *</label>
                <input type="text" value="${m.ccir || ''}" class="glass-input w-full text-[11px] modal-mat-ccir font-mono" placeholder="CCIR INCRA" required />
              </div>
              <div>
                <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Código ITR / NIRF</label>
                <input type="text" value="${m.itr || ''}" class="glass-input w-full text-[11px] modal-mat-itr" placeholder="ITR da Receita" />
              </div>
              <div>
                <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Comarca Registro *</label>
                <input type="text" value="${m.cri_comarca || ''}" class="glass-input w-full text-[11px] modal-mat-comarca" placeholder="Ex: Paranavaí" required />
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div class="md:col-span-2">
                <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">CRI Circunscrição</label>
                <input type="text" value="${m.cri_circunscricao || ''}" class="glass-input w-full text-[11px] modal-mat-circunscricao" placeholder="Circunscrição de Registro" />
              </div>
              <div>
                <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Livro de Registro</label>
                <input type="text" value="${m.livro_registro || ''}" class="glass-input w-full text-[11px] modal-mat-livro font-mono" placeholder="Ex: 2-RG" />
              </div>
              <div>
                <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Folha de Registro</label>
                <input type="text" value="${m.folha_registro || ''}" class="glass-input w-full text-[11px] modal-mat-folha font-mono" placeholder="Ex: 154v" />
              </div>
            </div>
          </div>
        `).join('');
      }

      verificarInputsFaltantesModal();

      modal.classList.remove('hidden');
      setTimeout(() => {
        modal.classList.remove('opacity-0');
      }, 10);
    };

    const fecharModalFronteira = () => {
      if (!modal) return;
      modal.classList.add('opacity-0');
      setTimeout(() => {
        modal.classList.add('hidden');
      }, 300);
    };

    const tratarExibicaoConjuge = (estadoCivil: string) => {
      if (!modalConjugeRow) return;
      const ec = String(estadoCivil).trim().toLowerCase();
      if (ec.includes("casado") || ec.includes("estável") || ec.includes("estavel")) {
        modalConjugeRow.classList.remove('hidden');
        (document.getElementById('modal-owner-conjuge-nome') as HTMLInputElement).required = true;
        (document.getElementById('modal-owner-conjuge-cpf') as HTMLInputElement).required = true;
        (document.getElementById('modal-owner-conjuge-rg') as HTMLInputElement).required = true;
      } else {
        modalConjugeRow.classList.add('hidden');
        (document.getElementById('modal-owner-conjuge-nome') as HTMLInputElement).required = false;
        (document.getElementById('modal-owner-conjuge-cpf') as HTMLInputElement).required = false;
        (document.getElementById('modal-owner-conjuge-rg') as HTMLInputElement).required = false;
      }
    };

    const verificarInputsFaltantesModal = () => {
      const inputs = modal?.querySelectorAll('input[required]') as NodeListOf<HTMLInputElement>;
      inputs?.forEach(inp => {
        const lidarVal = () => {
          if (!inp.value.trim()) {
            inp.classList.add('border-red-500/50', 'bg-red-500/5', 'text-red-200');
            inp.classList.remove('border-white/10');
          } else {
            inp.classList.remove('border-red-500/50', 'bg-red-500/5', 'text-red-200');
            inp.classList.add('border-white/10');
          }
        };
        lidarVal();
        inp.addEventListener('input', lidarVal);
      });
    };

    // Eventos de Selectores e UI

    selectProp.addEventListener('change', () => {
      const val = selectProp.value;
      resetarEstadoUploadGeral();
      currentLevantamentoId = null;
      
      if (!val) {
        currentPropId = null;
        document.getElementById('matriculas-checkbox-list')!.innerHTML = '<p class="text-xs text-white/30 italic py-2 text-center">Selecione uma propriedade para listar as matrículas correspondentes.</p>';
        atualizarMonitorGeodesicoLote();
        document.getElementById('documentos-lista-container')!.innerHTML = '<div class="text-center text-white/30 text-xs py-8">Selecione uma propriedade para listar os atalhos de documentos.</div>';
        verificarHabilitacaoBotao();
        return;
      }

      currentPropId = parseInt(val);
      loadDadosFronteira(currentPropId);
      loadWorkspaceDocuments();

      // Carrega o levantamento ativo correspondente para termos o ID correto para a geração em HTML
      fetch(`${API_BASE}/levantamentos`)
        .then(res => res.json())
        .then(levantamentos => {
          const levs = levantamentos.filter((l: any) => l.propriedade_id === currentPropId && l.status === 'EM_ANDAMENTO');
          if (levs.length > 0) {
            currentLevantamentoId = levs[0].id;
          } else {
            const levsQualquer = levantamentos.filter((l: any) => l.propriedade_id === currentPropId);
            if (levsQualquer.length > 0) {
              currentLevantamentoId = levsQualquer[0].id;
            }
          }
        });
    });

    selectProf.addEventListener('change', () => {
      const val = selectProf.value;
      currentProfId = val ? parseInt(val) : null;
      verificarHabilitacaoBotao();
    });

    document.getElementById('btn-selecionar-todas-m')?.addEventListener('click', () => {
      const checkboxes = document.querySelectorAll('.checkbox-matricula-item') as NodeListOf<HTMLInputElement>;
      if (checkboxes.length === 0) return;
      
      const todasMarcadas = Array.from(checkboxes).every(c => c.checked);
      checkboxes.forEach(c => c.checked = !todasMarcadas);
      
      atualizarMonitorGeodesicoLote();
      verificarHabilitacaoBotao();
    });

    btnAtualizarDocs?.addEventListener('click', () => {
      if (currentPropId) {
        loadWorkspaceDocuments();
      }
    });

    // --- EVENTOS DO MODAL ---

    btnCloseModal?.addEventListener('click', fecharModalFronteira);
    btnCancelModal?.addEventListener('click', fecharModalFronteira);

    modalOwnerEstadoCivil?.addEventListener('change', () => {
      tratarExibicaoConjuge(modalOwnerEstadoCivil.value);
    });

    formFronteira?.addEventListener('submit', (e) => {
      e.preventDefault();
      abrirModalFronteira();
    });

    // Salvar Dados & Abrir Impressão
    btnSaveAndGenerate?.addEventListener('click', async () => {
      if (!currentPropId || !currentProfId) return;

      const inputs = modal?.querySelectorAll('input[required]') as NodeListOf<HTMLInputElement>;
      let formValido = true;
      inputs?.forEach(inp => {
        if (!inp.value.trim()) {
          inp.classList.add('border-red-500/50', 'bg-red-500/5', 'text-red-200');
          formValido = false;
        }
      });

      if (!formValido) {
        alert("Atenção: Por favor, preencha todos os campos obrigatórios sinalizados antes de continuar.");
        return;
      }

      btnSaveAndGenerate.disabled = true;
      const originalText = btnSaveAndGenerate.innerHTML;
      btnSaveAndGenerate.innerHTML = `<i data-lucide="refresh-cw" class="w-4 h-4 animate-spin"></i> Salvando & Abrindo Abas...`;
      initIcons();

      // Extrai dados da Propriedade e Proprietário
      const propNome = (document.getElementById('modal-prop-nome') as HTMLInputElement).value.trim();
      const propMun = (document.getElementById('modal-prop-municipio') as HTMLInputElement).value.trim();
      const propUf = (document.getElementById('modal-prop-uf') as HTMLInputElement).value.trim().toUpperCase();
      const propCar = (document.getElementById('modal-prop-car') as HTMLInputElement).value.trim();
      const propCcir = (document.getElementById('modal-prop-ccir') as HTMLInputElement).value.trim();

      const ownerIdStr = (document.getElementById('modal-owner-id') as HTMLInputElement).value;
      const ownerNome = (document.getElementById('modal-owner-nome') as HTMLInputElement).value.trim();
      const ownerCpf = (document.getElementById('modal-owner-cpf') as HTMLInputElement).value.trim();
      const ownerRg = (document.getElementById('modal-owner-rg') as HTMLInputElement).value.trim();
      const ownerEst = modalOwnerEstadoCivil.value;
      const ownerReg = (document.getElementById('modal-owner-regime') as HTMLInputElement).value.trim();

      const ownerConjNome = (document.getElementById('modal-owner-conjuge-nome') as HTMLInputElement).value.trim();
      const ownerConjCpf = (document.getElementById('modal-owner-conjuge-cpf') as HTMLInputElement).value.trim();
      const ownerConjRg = (document.getElementById('modal-owner-conjuge-rg') as HTMLInputElement).value.trim();

      // Extrai dados das Matrículas Editadas
      const matElements = document.querySelectorAll('[data-modal-matricula-id]') as NodeListOf<HTMLElement>;
      const matriculasPayload = Array.from(matElements).map(el => {
        const id = parseInt(el.getAttribute('data-modal-matricula-id')!);
        const numero_matricula = (el.querySelector('.modal-mat-numero') as HTMLInputElement).value.trim();
        const ccir = (el.querySelector('.modal-mat-ccir') as HTMLInputElement).value.trim();
        const itr = (el.querySelector('.modal-mat-itr') as HTMLInputElement).value.trim();
        const cri_comarca = (el.querySelector('.modal-mat-comarca') as HTMLInputElement).value.trim();
        const cri_circunscricao = (el.querySelector('.modal-mat-circunscricao') as HTMLInputElement).value.trim();
        const livro_registro = (el.querySelector('.modal-mat-livro') as HTMLInputElement).value.trim();
        const folha_registro = (el.querySelector('.modal-mat-folha') as HTMLInputElement).value.trim();

        const originalMat = dadosConsolidadosFronteira.matriculas.find((m: any) => m.id === id);
        const area_ha = originalMat ? originalMat.area_ha : 0.0;

        return {
          id, numero_matricula, ccir, itr, area_ha, cri_comarca, cri_circunscricao, livro_registro, folha_registro
        };
      });

      // Payload Completo de Atualização
      const payloadAtualizar = {
        propriedade: { id: currentPropId, nome_propriedade: propNome, municipio: propMun, uf: propUf, codigo_car: propCar, codigo_ccir: propCcir },
        proprietario: ownerIdStr && ownerIdStr !== '0' ? {
          id: parseInt(ownerIdStr), nome_completo: ownerNome, cpf_cnpj: ownerCpf, rg_ie: ownerRg, estado_civil: ownerEst, regime_bens: ownerReg,
          nome_conjuge: ownerConjNome, cpf_conjuge: ownerConjCpf, rg_conjuge: ownerConjRg
        } : null,
        matriculas: matriculasPayload,
        profissional_id: currentProfId
      };

      try {
        // A. Realiza o POST transacional para salvar todas as alterações
        const resUpdate = await fetch(`${API_BASE}/propriedades/${currentPropId}/atualizar-dados-fronteira`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadAtualizar)
        });
        const dataUpdate = await resUpdate.json();

        if (dataUpdate.error || (dataUpdate.detail && typeof dataUpdate.detail === 'string')) {
          alert(`Falha ao salvar as alterações dos dados: ${dataUpdate.error || dataUpdate.detail}`);
          btnSaveAndGenerate.disabled = false;
          btnSaveAndGenerate.innerHTML = originalText;
          initIcons();
          return;
        }

        // Se o levantamento foi criado automaticamente ou retornado, atualizamos
        if (dataUpdate.levantamento_id) {
          currentLevantamentoId = dataUpdate.levantamento_id;
        }

        if (!currentLevantamentoId) {
          alert("Não foi localizado nem criado nenhum levantamento de apoio para esta propriedade.");
          btnSaveAndGenerate.disabled = false;
          btnSaveAndGenerate.innerHTML = originalText;
          initIcons();
          return;
        }

        // B. Com os dados salvos com sucesso, abre o Laudo HTML e o Requerimento HTML de cada matrícula
        const numero_trt = (document.getElementById('input-fronteira-trt') as HTMLInputElement).value.trim();
        const data_quitacao_trt = (document.getElementById('input-fronteira-data-trt') as HTMLInputElement).value;
        const selectedMatIds = matriculasPayload.map(m => m.id);

        for (const mId of selectedMatIds) {
          // Abre o Laudo
          const urlLaudo = `${API_BASE}/levantamentos/${currentLevantamentoId}/matriculas/${mId}/laudo-fronteira-html?numero_trt=${encodeURIComponent(numero_trt)}&data_trt=${encodeURIComponent(data_quitacao_trt)}`;
          window.open(urlLaudo, '_blank');

          // Abre o Requerimento
          const urlReq = `${API_BASE}/levantamentos/${currentLevantamentoId}/matriculas/${mId}/requerimento-ratificacao-html`;
          window.open(urlReq, '_blank');
        }

        // Reseta formulário de TRT
        (document.getElementById('input-fronteira-trt') as HTMLInputElement).value = '';
        (document.getElementById('input-fronteira-data-trt') as HTMLInputElement).value = '';
        
        fecharModalFronteira();
        alert("Metadados atualizados com sucesso no banco de dados! As abas de visualização/impressão dos Laudos e Requerimentos foram abertas.");
        
        // Recarrega listagem e documentos na view
        loadDadosFronteira(currentPropId);
      } catch (err) {
        console.error("Erro no processamento transacional de fronteira:", err);
        alert("Erro crítico de comunicação com o servidor API.");
      } finally {
        btnSaveAndGenerate.disabled = false;
        btnSaveAndGenerate.innerHTML = originalText;
        initIcons();
      }
    });

    loadPropriedades();
    loadProfissionais();
  }
};
