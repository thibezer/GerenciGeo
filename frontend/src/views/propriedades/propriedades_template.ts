export const renderPropriedadesTemplate = (): string => `
    <div class="space-y-5 sm:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <!-- Cabeçalho Principal -->
      <div class="flex justify-between items-center h-10 sm:h-12 border-b border-white/5 pb-2 sm:pb-3">
        <div>
          <h1 class="text-lg sm:text-xl font-bold tracking-tight text-white leading-none">Propriedades</h1>
          <p class="text-white/40 text-[10px] mt-1.5 hidden sm:block">Gestão fundiária, limites georreferenciados e documentação cartorial.</p>
        </div>
      </div>

      <!-- KPIs Compactos -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <ui-card elevacao="baixa" class="h-14 sm:h-16 flex items-center">
          <div class="px-4 flex items-center gap-3 w-full">
            <div class="p-1.5 bg-mint-vibrant/10 rounded-technical shrink-0">
              <i data-lucide="home" class="w-4 h-4 text-mint-vibrant"></i>
            </div>
            <div class="min-w-0">
              <p class="text-white/40 text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold truncate">Total de Imóveis</p>
              <h3 class="text-base sm:text-lg font-bold tracking-tight text-white leading-none mt-0.5" id="stat-total-prop">0</h3>
            </div>
          </div>
        </ui-card>

        <ui-card elevacao="baixa" class="h-14 sm:h-16 flex items-center">
          <div class="px-4 flex items-center gap-3 w-full">
            <div class="p-1.5 bg-blue-500/10 rounded-technical shrink-0">
              <i data-lucide="map" class="w-4 h-4 text-blue-500"></i>
            </div>
            <div class="min-w-0">
              <p class="text-white/40 text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold truncate">Municípios Atendidos</p>
              <h3 class="text-base sm:text-lg font-bold tracking-tight text-white leading-none mt-0.5" id="stat-municipios-prop">0</h3>
            </div>
          </div>
        </ui-card>

        <ui-card elevacao="baixa" class="h-14 sm:h-16 flex items-center">
          <div class="px-4 flex items-center gap-3 w-full">
            <div class="p-1.5 bg-indigo-500/10 rounded-technical shrink-0">
              <i data-lucide="file-text" class="w-4 h-4 text-indigo-500"></i>
            </div>
            <div class="min-w-0">
              <p class="text-white/40 text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold truncate">Total de Matrículas</p>
              <h3 class="text-base sm:text-lg font-bold tracking-tight text-white leading-none mt-0.5" id="stat-total-mats">0</h3>
            </div>
          </div>
        </ui-card>

        <ui-card elevacao="baixa" class="h-14 sm:h-16 flex items-center">
          <div class="px-4 flex items-center gap-3 w-full">
            <div class="p-1.5 bg-rose-500/10 rounded-technical shrink-0">
              <i data-lucide="folder-git" class="w-4 h-4 text-rose-500"></i>
            </div>
            <div class="min-w-0">
              <p class="text-white/40 text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold truncate">Projetos Ativos</p>
              <h3 class="text-base sm:text-lg font-bold tracking-tight text-white leading-none mt-0.5" id="stat-total-levs">0</h3>
            </div>
          </div>
        </ui-card>
      </div>

      <!-- Tabela Principal de Propriedades -->
      <ui-card elevacao="baixa" class="overflow-hidden flex flex-col">
        <!-- Filtros, Busca, Ordenação e Ações -->
        <div class="p-4 border-b border-white/5 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white/[0.01]">
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 max-w-xl">
            <div class="relative flex-1">
              <ui-campo-texto id="busca-propriedade" placeholder="Buscar propriedade por nome, município..." class="w-full"></ui-campo-texto>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <span class="text-[10px] text-white/40 uppercase font-bold whitespace-nowrap">Ordenar:</span>
              <ui-select id="ordenacao-propriedade" value="nome-asc" class="w-44 h-8.5">
                <option value="nome-asc">Nome (A-Z)</option>
                <option value="nome-desc">Nome (Z-A)</option>
                <option value="data-desc">Mais Recentes (Cadastro)</option>
                <option value="data-asc">Mais Antigas (Cadastro)</option>
              </ui-select>
            </div>
          </div>
          <div class="flex gap-2 justify-end shrink-0">
            <ui-botao variante="primario" id="btn-abrir-modal-propriedade">
               <i data-lucide="plus" class="w-4 h-4"></i>
               Nova Propriedade
            </ui-botao>
          </div>
        </div>

        <!-- Tabela -->
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-white/5 text-[9px] sm:text-[10px] uppercase tracking-wider font-bold text-white/40 bg-white/[0.01]">
                <th class="py-3 px-4 w-10">
                  <ui-checkbox id="check-all-propriedades"></ui-checkbox>
                </th>
                <th class="py-3 px-4">Imóvel Rural</th>
                <th class="py-3 px-4">Localidade</th>
                <th class="py-3 px-4">Proprietário Principal</th>
                <th class="py-3 px-4 text-center">Matrículas</th>
                <th class="py-3 px-4 text-center">Projetos</th>
                <th class="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody id="tabela-propriedades-body" class="divide-y divide-white/[0.02]">
              <!-- Linhas via JS -->
            </tbody>
          </table>
        </div>

        <!-- Status de Tabela Vazia / Carregando -->
        <div id="tabela-propriedades-status" class="text-center py-12 text-white/30 text-sm hidden">
          Carregando propriedades...
        </div>

        <!-- Rodapé / Paginação -->
        <div class="p-3 sm:p-4 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-3 bg-white/[0.01] text-xs text-white/40">
          <div class="flex items-center gap-2">
            <span>Exibir por página:</span>
            <ui-select id="paginacao-limite" value="10" class="w-16 h-7">
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </ui-select>
            <span id="paginacao-info">Mostrando 0-0 de 0 propriedades</span>
          </div>
          <div class="flex items-center gap-1.5" id="paginacao-botoes">
            <!-- Botões dinâmicos -->
          </div>
        </div>
      </ui-card>
    </div>

    <!-- BARRA DE AÇÕES EM LOTE FLUTUANTE -->
    <div id="batch-action-bar" class="fixed bottom-6 left-1/2 -translate-x-1/2 glass-card border border-mint-vibrant/20 bg-[#0c1510]/95 backdrop-blur-md px-6 py-3 shadow-2xl flex items-center gap-6 z-40 hidden animate-in fade-in slide-in-from-bottom-6 duration-300">
      <span class="text-xs text-white/80 font-mono"><strong id="batch-selected-count" class="text-mint-vibrant">0</strong> selecionados</span>
      <div class="h-4 w-px bg-white/10"></div>
      <div class="flex gap-2">
        <ui-botao variante="destrutivo" id="btn-batch-delete">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          Excluir Selecionados
        </ui-botao>
        <ui-botao variante="secundario" id="btn-batch-cancel">
          Cancelar
        </ui-botao>
      </div>
    </div>

    <!-- MODAL DE CADASTRO / EDIÇÃO COMPACTO -->
    <ui-modal id="modal-propriedade" titulo="Nova Propriedade">
       <form id="form-propriedade" class="space-y-3.5" style="--ui-altura-minima: 36px;">
          <div>
             <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Nome da Propriedade *</label>
             <ui-campo-texto name="nome_propriedade" required placeholder="Ex: Fazenda Três Barras"></ui-campo-texto>
          </div>
          <div>
             <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Código do CAR</label>
             <ui-campo-texto name="codigo_car" placeholder="PR-4128104-58A2..."></ui-campo-texto>
          </div>
          <div>
             <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Código do CCIR</label>
             <ui-campo-texto name="codigo_ccir" placeholder="000.000.000.000-0"></ui-campo-texto>
          </div>
          <div class="grid grid-cols-3 gap-3 items-end">
             <div class="col-span-2">
                <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Município *</label>
                <ui-campo-texto name="municipio" required placeholder="Ex: Umuarama"></ui-campo-texto>
             </div>
             <div>
                <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">UF *</label>
                <ui-campo-texto name="uf" required maxlength="2" placeholder="PR"></ui-campo-texto>
             </div>
          </div>
       </form>
       <div slot="rodape" class="flex justify-end gap-1 w-full">
          <ui-botao variante="primario" id="btn-submit-prop">Salvar Propriedade</ui-botao>
          <ui-botao variante="secundario" id="btn-cancelar-prop">Cancelar</ui-botao>
       </div>
    </ui-modal>

    <!-- MODAL DE DETALHES COMPLETO MULTITABS -->
    <ui-modal id="modal-detalhes-propriedade" titulo="Detalhes da Propriedade">
       <div class="space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-white/5">
             <div class="flex items-center gap-3 min-w-0">
                <div class="w-8.5 h-8.5 rounded-full bg-mint-vibrant/10 flex items-center justify-center text-xs font-bold text-mint-vibrant shrink-0">
                   <i data-lucide="home" class="w-4 h-4 text-mint-vibrant"></i>
                </div>
                <div class="min-w-0">
                   <h3 class="text-sm font-bold text-white truncate" id="det-prop-titulo">Nome da Propriedade</h3>
                   <p class="text-[9px] text-white/40 font-mono leading-none mt-1" id="det-prop-subtitulo">Município/UF</p>
                </div>
             </div>
             <div class="flex items-center gap-1.5 shrink-0">
                <ui-botao variante="secundario" id="btn-det-editar-prop" title="Editar Propriedade">
                    <i data-lucide="edit" class="w-4 h-4"></i>
                </ui-botao>
                <ui-botao variante="destrutivo" id="btn-det-excluir-prop" title="Excluir Propriedade">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </ui-botao>
             </div>
          </div>
          
          <div class="flex border-b border-white/5 bg-white/[0.01] overflow-x-auto scrollbar-none">
             <button class="px-4 py-2 text-xs font-bold border-b-2 border-mint-vibrant text-mint-vibrant tab-btn-det-prop whitespace-nowrap" data-tab-prop="tab-prop-dados">Dados Gerais & Anexos</button>
             <button class="px-4 py-2 text-xs font-bold border-b-2 border-transparent text-white/40 hover:text-white transition-colors tab-btn-det-prop whitespace-nowrap" data-tab-prop="tab-prop-proprietarios">Proprietários</button>
             <button class="px-4 py-2 text-xs font-bold border-b-2 border-transparent text-white/40 hover:text-white transition-colors tab-btn-det-prop whitespace-nowrap" data-tab-prop="tab-prop-matriculas">Matrículas</button>
          </div>
          
          <div class="space-y-4">
             <!-- ABA DADOS GERAIS & ANEXOS -->
             <div id="tab-prop-dados" class="tab-content-det-prop space-y-4">
                <div class="grid grid-cols-2 gap-3 bg-white/[0.01] p-3 border border-white/5 rounded-technical">
                   <div>
                      <p class="text-[9px] text-white/40 uppercase tracking-widest font-bold">Código do CAR</p>
                      <p class="text-xs text-mint-vibrant font-mono font-bold mt-0.5" id="det-prop-car">-</p>
                   </div>
                   <div>
                      <p class="text-[9px] text-white/40 uppercase tracking-widest font-bold">Código do CCIR</p>
                      <p class="text-xs text-blue-400 font-mono font-bold mt-0.5" id="det-prop-ccir">-</p>
                   </div>
                </div>

                <!-- MESA DE ANEXOS FÍSICOS (CAR & CCIR) -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <!-- Bloco CAR -->
                   <div class="flex flex-col bg-white/[0.01] border border-white/5 rounded-technical p-3 space-y-2">
                      <span class="text-[8.5px] font-mono font-bold text-mint-vibrant bg-mint-vibrant/10 px-2 py-0.5 rounded border border-mint-vibrant/20 w-max">DOCUMENTO DO CAR</span>
                      
                      <div class="border-2 border-dashed border-white/10 hover:border-mint-vibrant/40 rounded p-4 text-center cursor-pointer transition-colors flex flex-col justify-center items-center py-5 group relative" id="dropzone-car">
                         <input type="file" id="input-file-car" class="hidden" accept=".pdf,.png,.jpg,.jpeg,.dwg" />
                         <i data-lucide="upload" class="w-5 h-5 text-white/40 group-hover:text-mint-vibrant group-hover:scale-110 transition-all mb-1.5"></i>
                         <p class="text-[10px] font-bold">Anexar arquivo do CAR</p>
                         <p class="text-[8px] text-white/30 uppercase mt-0.5">Arraste ou clique</p>
                      </div>

                      <div class="hidden flex items-center justify-between p-2 bg-white/[0.02] border border-white/5 rounded text-xs" id="container-anexo-car">
                         <div class="min-w-0 flex-1 flex items-center gap-1.5 pr-2 select-none">
                            <i data-lucide="file-text" class="w-3.5 h-3.5 text-mint-vibrant shrink-0"></i>
                            <span class="truncate font-mono text-[10px] cursor-pointer hover:underline hover:text-mint-vibrant font-bold" id="txt-anexo-car-nome">Arquivo</span>
                         </div>
                         <div class="flex gap-1 shrink-0">
                            <button class="text-mint-vibrant hover:text-white p-1 hover:bg-mint-vibrant/20 rounded transition-all cursor-pointer" id="btn-download-car" title="Download">
                               <i data-lucide="download" class="w-3.5 h-3.5"></i>
                            </button>
                            <button class="text-white/40 hover:text-red-400 p-1 hover:bg-red-500/10 rounded transition-all cursor-pointer" id="btn-delete-car" title="Excluir CAR">
                               <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                            </button>
                         </div>
                      </div>
                   </div>

                   <!-- Bloco CCIR -->
                   <div class="flex flex-col bg-white/[0.01] border border-white/5 rounded-technical p-3 space-y-2">
                      <span class="text-[8.5px] font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 w-max">DOCUMENTO DO CCIR</span>
                      
                      <div class="border-2 border-dashed border-white/10 hover:border-blue-500/40 rounded p-4 text-center cursor-pointer transition-colors flex flex-col justify-center items-center py-5 group relative" id="dropzone-ccir">
                         <input type="file" id="input-file-ccir" class="hidden" accept=".pdf,.png,.jpg,.jpeg" />
                         <i data-lucide="upload" class="w-5 h-5 text-white/40 group-hover:text-blue-400 group-hover:scale-110 transition-all mb-1.5"></i>
                         <p class="text-[10px] font-bold">Anexar arquivo do CCIR</p>
                         <p class="text-[8px] text-white/30 uppercase mt-0.5">Arraste ou clique</p>
                      </div>

                      <div class="hidden flex items-center justify-between p-2 bg-white/[0.02] border border-white/5 rounded text-xs" id="container-anexo-ccir">
                         <div class="min-w-0 flex-1 flex items-center gap-1.5 pr-2 select-none">
                            <i data-lucide="file-text" class="w-3.5 h-3.5 text-blue-400 shrink-0"></i>
                            <span class="truncate font-mono text-[10px] cursor-pointer hover:underline hover:text-blue-400 font-bold" id="txt-anexo-ccir-nome">Arquivo</span>
                         </div>
                         <div class="flex gap-1 shrink-0">
                            <button class="text-blue-400 hover:text-white p-1 hover:bg-blue-500/20 rounded transition-all cursor-pointer" id="btn-download-ccir" title="Download">
                               <i data-lucide="download" class="w-3.5 h-3.5"></i>
                            </button>
                            <button class="text-white/40 hover:text-red-400 p-1 hover:bg-red-500/10 rounded transition-all cursor-pointer" id="btn-delete-ccir" title="Excluir CCIR">
                               <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                            </button>
                         </div>
                      </div>
                   </div>
                </div>
             </div>
             
             <!-- ABA PROPRIETÁRIOS -->
             <div id="tab-prop-proprietarios" class="tab-content-det-prop hidden space-y-4">
                <div class="bg-white/[0.01] border border-white/5 p-3.5 rounded-technical space-y-3">
                   <h5 class="text-[10px] font-bold text-mint-vibrant uppercase tracking-wider leading-none">Vincular Novo Proprietário</h5>
                   <form id="form-vincular-proprietario" class="grid grid-cols-1 md:grid-cols-3 gap-3 items-end" style="--ui-altura-minima: 36px;">
                      <div class="relative">
                         <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Buscar Cliente</label>
                         <ui-campo-texto id="busca-proprietario-cliente" placeholder="Digite nome ou CPF..." autocomplete="off" required></ui-campo-texto>
                         <input type="hidden" id="vinc-cliente-id" required>
                         <div id="lista-vinc-clientes" class="absolute left-0 right-0 mt-1 max-h-36 overflow-y-auto bg-[#0a100d] border border-white/10 rounded shadow-2xl z-50 hidden divide-y divide-white/5">
                            <!-- Opções dinâmicas -->
                         </div>
                      </div>
                      <div>
                         <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Participação (%)</label>
                         <ui-campo-texto id="vinc-participacao" tipo="number" min="0.01" max="100" step="0.01" placeholder="Ex: 50.00" required></ui-campo-texto>
                      </div>
                      <ui-botao tipo-submit variante="primario" id="btn-submit-vinc-prop">Vincular Proprietário</ui-botao>
                   </form>
                   <p class="text-[9px] text-white/30 font-mono uppercase leading-none mt-1">Quota Restante Disponível: <span class="text-mint-vibrant font-bold" id="lbl-quota-restante">100.00%</span></p>
                </div>

                <div class="bg-white/5 rounded border border-white/5 overflow-hidden">
                   <table class="w-full text-left text-xs border-collapse">
                      <thead>
                         <tr class="bg-white/[0.02] border-b border-white/5 text-[9px] uppercase tracking-wider font-bold text-white/40">
                            <th class="py-2 px-3">Proprietário</th>
                            <th class="py-2 px-3">CPF/CNPJ</th>
                            <th class="py-2 px-3 text-right">Participação</th>
                            <th class="py-2 px-3 text-center w-16">Ação</th>
                         </tr>
                      </thead>
                      <tbody id="tbl-prop-proprietarios-corpo" class="divide-y divide-white/5">
                         <!-- Proprietários via JS -->
                      </tbody>
                   </table>
                </div>
             </div>
             
             <!-- ABA MATRÍCULAS -->
             <div id="tab-prop-matriculas" class="tab-content-det-prop hidden space-y-4">
                <div class="bg-white/[0.01] border border-white/5 p-3.5 rounded-technical space-y-3">
                   <h5 class="text-[10px] font-bold text-mint-vibrant uppercase tracking-wider leading-none" id="form-matricula-titulo">Cadastrar Gleba / Matrícula</h5>
                   <form id="form-cadastrar-matricula-prop" class="grid grid-cols-2 md:grid-cols-4 gap-3 items-end" style="--ui-altura-minima: 36px;">
                      <div>
                         <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Nº Matrícula *</label>
                         <ui-campo-texto id="input-new-mat-numero" required placeholder="Ex: 12.345"></ui-campo-texto>
                      </div>
                      <div class="col-span-1">
                         <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Denominação *</label>
                         <ui-campo-texto id="input-new-mat-denominacao" required placeholder="Ex: Lote 12-A"></ui-campo-texto>
                      </div>
                      <div>
                         <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Área (Ha) *</label>
                         <ui-campo-texto id="input-new-mat-area" required placeholder="Ex: 45,1234"></ui-campo-texto>
                      </div>
                      <div>
                         <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Código CCIR</label>
                         <ui-campo-texto id="input-new-mat-ccir" placeholder="950.082..."></ui-campo-texto>
                      </div>
                      <div>
                         <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Código ITR / NIRF</label>
                         <ui-campo-texto id="input-new-mat-itr" placeholder="1.234.567-8"></ui-campo-texto>
                      </div>
                      <div>
                         <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Valor ITR (R$)</label>
                         <ui-campo-texto id="input-new-mat-valor-itr" tipo="number" step="0.01" placeholder="Ex: 1500.00"></ui-campo-texto>
                      </div>
                      <div class="col-span-2">
                         <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">SIGEF (UUID do Georreferenciamento)</label>
                         <ui-campo-texto id="input-new-mat-georreferenciamento" placeholder="a5b4c3d2-..."></ui-campo-texto>
                      </div>
                      <div class="col-span-2 md:col-span-4 flex justify-end gap-2">
                         <ui-botao variante="secundario" id="btn-cancelar-edicao-mat" class="hidden">Cancelar</ui-botao>
                         <ui-botao variante="primario" tipo-submit id="btn-submit-mat">Salvar Matrícula</ui-botao>
                      </div>
                   </form>
                </div>

                <div class="bg-white/5 rounded border border-white/5 overflow-hidden">
                   <table class="w-full text-left text-xs border-collapse">
                      <thead>
                         <tr class="bg-white/[0.02] border-b border-white/5 text-[9px] uppercase tracking-wider font-bold text-white/40">
                            <th class="py-2 px-3">Número e Denominação</th>
                            <th class="py-2 px-3 text-right">Área Registrada</th>
                            <th class="py-2 px-3">CCIR / ITR / SIGEF</th>
                            <th class="py-2 px-3 text-center">Certidão PDF</th>
                            <th class="py-2 px-3 text-right w-24">Ações</th>
                         </tr>
                      </thead>
                      <tbody id="tbl-prop-matriculas-corpo" class="divide-y divide-white/5">
                         <!-- Matrículas via JS -->
                      </tbody>
                   </table>
                </div>
             </div>
          </div>
       </div>
    </ui-modal>

    <!-- MODAL DE HISTÓRICO DE ALTERAÇÃO DA MATRÍCULA -->
    <ui-modal id="modal-historico-matricula" titulo="Histórico da Matrícula">
       <div class="p-1 max-h-[50vh] overflow-y-auto">
          <div class="bg-white/5 rounded border border-white/5 overflow-hidden">
             <table class="w-full text-left text-[11px] border-collapse">
                <thead>
                   <tr class="bg-white/[0.02] border-b border-white/5 text-[8.5px] uppercase tracking-wider font-bold text-white/40 sticky top-0 z-10">
                      <th class="py-2 px-3 bg-[#0d1611]">Campo</th>
                      <th class="py-2 px-3 bg-[#0d1611]">Antigo</th>
                      <th class="py-2 px-3 bg-[#0d1611]">Novo</th>
                      <th class="py-2 px-3 text-right bg-[#0d1611]">Data/Hora</th>
                   </tr>
                </thead>
                <tbody id="tbl-hist-mat-corpo" class="divide-y divide-white/5">
                   <!-- Logs de alteração da matrícula -->
                </tbody>
             </table>
          </div>
       </div>
    </ui-modal>
`;
