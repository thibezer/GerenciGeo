import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { initIcons, formatarCAR, formatarCCIR } from '../utils';

export const propriedadesRoute: RouteDef = {
  render: () => `
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
        <div class="glass-card h-14 sm:h-16 px-4 flex items-center gap-3">
          <div class="p-1.5 bg-mint-vibrant/10 rounded-technical shrink-0">
            <i data-lucide="home" class="w-4 h-4 text-mint-vibrant"></i>
          </div>
          <div class="min-w-0">
            <p class="text-white/40 text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold truncate">Total de Imóveis</p>
            <h3 class="text-base sm:text-lg font-bold tracking-tight text-white leading-none mt-0.5" id="stat-total-prop">0</h3>
          </div>
        </div>

        <div class="glass-card h-14 sm:h-16 px-4 flex items-center gap-3">
          <div class="p-1.5 bg-blue-500/10 rounded-technical shrink-0">
            <i data-lucide="map" class="w-4 h-4 text-blue-500"></i>
          </div>
          <div class="min-w-0">
            <p class="text-white/40 text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold truncate">Municípios Atendidos</p>
            <h3 class="text-base sm:text-lg font-bold tracking-tight text-white leading-none mt-0.5" id="stat-municipios-prop">0</h3>
          </div>
        </div>

        <div class="glass-card h-14 sm:h-16 px-4 flex items-center gap-3">
          <div class="p-1.5 bg-indigo-500/10 rounded-technical shrink-0">
            <i data-lucide="file-text" class="w-4 h-4 text-indigo-500"></i>
          </div>
          <div class="min-w-0">
            <p class="text-white/40 text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold truncate">Total de Matrículas</p>
            <h3 class="text-base sm:text-lg font-bold tracking-tight text-white leading-none mt-0.5" id="stat-total-mats">0</h3>
          </div>
        </div>

        <div class="glass-card h-14 sm:h-16 px-4 flex items-center gap-3">
          <div class="p-1.5 bg-rose-500/10 rounded-technical shrink-0">
            <i data-lucide="folder-git" class="w-4 h-4 text-rose-500"></i>
          </div>
          <div class="min-w-0">
            <p class="text-white/40 text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold truncate">Projetos Ativos</p>
            <h3 class="text-base sm:text-lg font-bold tracking-tight text-white leading-none mt-0.5" id="stat-total-levs">0</h3>
          </div>
        </div>
      </div>

      <!-- Tabela Principal de Propriedades -->
      <div class="glass-card overflow-hidden border border-white/5 flex flex-col">
        <!-- Filtros, Busca, Ordenação e Ações -->
        <div class="p-4 border-b border-white/5 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white/[0.01]">
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 max-w-xl">
            <div class="relative flex-1">
              <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30"></i>
              <input type="text" placeholder="Buscar propriedade por nome, município..." class="glass-input pl-9 w-full text-xs h-8.5" id="busca-propriedade" />
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <span class="text-[10px] text-white/40 uppercase font-bold whitespace-nowrap">Ordenar:</span>
              <select id="ordenacao-propriedade" class="glass-input h-8.5 py-0 px-2.5 text-xs bg-forest-deep">
                <option value="nome-asc">Nome (A-Z)</option>
                <option value="nome-desc">Nome (Z-A)</option>
                <option value="data-desc">Mais Recentes (Cadastro)</option>
                <option value="data-asc">Mais Antigas (Cadastro)</option>
              </select>
            </div>
          </div>
          <div class="flex gap-2 justify-end shrink-0">
            <button class="btn-primary h-8.5 text-xs px-4" id="btn-abrir-modal-propriedade">
               <i data-lucide="plus" class="w-4 h-4"></i>
               Nova Propriedade
            </button>
          </div>
        </div>

        <!-- Tabela -->
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-white/5 text-[9px] sm:text-[10px] uppercase tracking-wider font-bold text-white/40 bg-white/[0.01]">
                <th class="py-3 px-4 w-10">
                  <input type="checkbox" id="check-all-propriedades" class="rounded border-white/10 text-mint-vibrant bg-white/5 focus:ring-0 focus:ring-offset-0 cursor-pointer" />
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
            <select id="paginacao-limite" class="glass-input h-7 py-0 px-2 text-xs bg-forest-deep">
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
            <span id="paginacao-info">Mostrando 0-0 de 0 propriedades</span>
          </div>
          <div class="flex items-center gap-1.5" id="paginacao-botoes">
            <!-- Botões dinâmicos -->
          </div>
        </div>
      </div>
    </div>

    <!-- BARRA DE AÇÕES EM LOTE FLUTUANTE -->
    <div id="batch-action-bar" class="fixed bottom-6 left-1/2 -translate-x-1/2 glass-card border border-mint-vibrant/20 bg-[#0c1510]/95 backdrop-blur-md px-6 py-3 shadow-2xl flex items-center gap-6 z-40 hidden animate-in fade-in slide-in-from-bottom-6 duration-300">
      <span class="text-xs text-white/80 font-mono"><strong id="batch-selected-count" class="text-mint-vibrant">0</strong> selecionados</span>
      <div class="h-4 w-px bg-white/10"></div>
      <div class="flex gap-2">
        <button id="btn-batch-delete" class="bg-red-500/10 hover:bg-red-500 border border-red-500/30 hover:border-transparent text-red-400 hover:text-white px-3 py-1.5 rounded-technical text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          Excluir Selecionados
        </button>
        <button id="btn-batch-cancel" class="btn-secondary py-1.5 px-3 text-xs">
          Cancelar
        </button>
      </div>
    </div>

    <!-- MODAL DE CADASTRO / EDIÇÃO COMPACTO -->
    <div id="modal-propriedade" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
       <div class="glass-card w-full max-w-md border border-mint-vibrant/10 shadow-2xl">
          <div class="p-4 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
             <h3 class="text-sm font-bold text-white flex items-center gap-2">
                <i data-lucide="home" class="w-4.5 h-4.5 text-mint-vibrant"></i>
                <span id="modal-prop-titulo">Nova Propriedade</span>
             </h3>
             <button class="text-white/40 hover:text-white transition-colors" id="btn-fechar-modal-prop">
                <i data-lucide="x" class="w-4.5 h-4.5"></i>
             </button>
          </div>
          <form id="form-propriedade" class="p-4 space-y-3.5">
             <div>
                <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Nome da Propriedade *</label>
                <input type="text" name="nome_propriedade" required class="glass-input w-full text-xs h-8" placeholder="Ex: Fazenda Três Barras">
             </div>
             <div>
                <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Código do CAR</label>
                <input type="text" name="codigo_car" class="glass-input w-full text-xs h-8 font-mono" placeholder="PR-4128104-58A2...">
             </div>
             <div>
                <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Código do CCIR</label>
                <input type="text" name="codigo_ccir" class="glass-input w-full text-xs h-8 font-mono" placeholder="000.000.000.000-0">
             </div>
             <div class="grid grid-cols-3 gap-3">
                <div class="col-span-2">
                   <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Município *</label>
                   <input type="text" name="municipio" required class="glass-input w-full text-xs h-8" placeholder="Ex: Umuarama">
                </div>
                <div>
                   <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">UF *</label>
                   <input type="text" name="uf" required maxlength="2" class="glass-input w-full text-xs h-8 uppercase" placeholder="PR">
                </div>
             </div>
             <div class="flex justify-end gap-2 pt-4 border-t border-white/5">
                <button type="button" class="btn-secondary h-8 text-xs py-0 px-4" id="btn-cancelar-prop">Cancelar</button>
                <button type="submit" class="btn-primary h-8 text-xs py-0 px-4" id="btn-submit-prop">Salvar Propriedade</button>
             </div>
          </form>
       </div>
    </div>

    <!-- MODAL DE DETALHES COMPLETO MULTITABS -->
    <div id="modal-detalhes-propriedade" class="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
       <div class="glass-card w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-mint-vibrant/20 shadow-2xl">
          <div class="p-4.5 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
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
                <button class="text-white/40 hover:text-mint-vibrant transition-colors p-2 rounded hover:bg-white/5 cursor-pointer" id="btn-det-editar-prop" title="Editar Propriedade">
                    <i data-lucide="edit" class="w-4 h-4"></i>
                </button>
                <button class="text-white/40 hover:text-red-400 transition-colors p-2 rounded hover:bg-white/5 cursor-pointer" id="btn-det-excluir-prop" title="Excluir Propriedade">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
                <button class="text-white/40 hover:text-white transition-colors p-2 rounded hover:bg-white/5 cursor-pointer" id="btn-fechar-detalhes-prop">
                   <i data-lucide="x" class="w-4.5 h-4.5"></i>
                </button>
             </div>
          </div>
          
          <div class="flex border-b border-white/5 bg-white/[0.01] overflow-x-auto scrollbar-none">
             <button class="px-4 py-2 text-xs font-bold border-b-2 border-mint-vibrant text-mint-vibrant tab-btn-det-prop whitespace-nowrap" data-tab-prop="tab-prop-dados">Dados Gerais & Anexos</button>
             <button class="px-4 py-2 text-xs font-bold border-b-2 border-transparent text-white/40 hover:text-white transition-colors tab-btn-det-prop whitespace-nowrap" data-tab-prop="tab-prop-proprietarios">Proprietários</button>
             <button class="px-4 py-2 text-xs font-bold border-b-2 border-transparent text-white/40 hover:text-white transition-colors tab-btn-det-prop whitespace-nowrap" data-tab-prop="tab-prop-matriculas">Matrículas</button>
          </div>
          
          <div class="p-4.5 space-y-4">
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
                      
                      <!-- Área de Upload do CAR -->
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
                      
                      <!-- Área de Upload do CCIR -->
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
                <!-- Formulário de vínculo compacto -->
                <div class="bg-white/[0.01] border border-white/5 p-3.5 rounded-technical space-y-3">
                   <h5 class="text-[10px] font-bold text-mint-vibrant uppercase tracking-wider leading-none">Vincular Novo Proprietário</h5>
                   <form id="form-vincular-proprietario" class="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                      <div class="relative">
                         <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Buscar Cliente</label>
                         <input type="text" id="busca-proprietario-cliente" placeholder="Digite nome ou CPF..." class="glass-input w-full text-xs h-8 pr-7" autocomplete="off" required>
                         <input type="hidden" id="vinc-cliente-id" required>
                         <div id="lista-vinc-clientes" class="absolute left-0 right-0 mt-1 max-h-36 overflow-y-auto bg-[#0a100d] border border-white/10 rounded shadow-2xl z-50 hidden divide-y divide-white/5">
                            <!-- Opções dinâmicas -->
                         </div>
                      </div>
                      <div>
                         <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Participação (%)</label>
                         <input type="number" id="vinc-participacao" min="0.01" max="100" step="0.01" placeholder="Ex: 50.00" required class="glass-input w-full text-xs h-8">
                      </div>
                      <button type="submit" class="btn-primary h-8 text-xs font-bold w-full cursor-pointer">Vincular Proprietário</button>
                   </form>
                   <p class="text-[9px] text-white/30 font-mono uppercase leading-none mt-1">Quota Restante Disponível: <span class="text-mint-vibrant font-bold" id="lbl-quota-restante">100.00%</span></p>
                </div>

                <!-- Tabela de Proprietários -->
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
                <!-- Cadastro de Matrícula Compacto -->
                <div class="bg-white/[0.01] border border-white/5 p-3.5 rounded-technical space-y-3">
                   <h5 class="text-[10px] font-bold text-mint-vibrant uppercase tracking-wider leading-none" id="form-matricula-titulo">Cadastrar Gleba / Matrícula</h5>
                   <form id="form-cadastrar-matricula-prop" class="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                      <div>
                         <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Nº Matrícula *</label>
                         <input type="text" id="input-new-mat-numero" required placeholder="Ex: 12.345" class="glass-input w-full text-xs h-8 font-mono">
                      </div>
                      <div class="col-span-1">
                         <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Denominação *</label>
                         <input type="text" id="input-new-mat-denominacao" required placeholder="Ex: Lote 12-A" class="glass-input w-full text-xs h-8">
                      </div>
                      <div>
                         <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Área (Ha) *</label>
                         <input type="text" id="input-new-mat-area" required placeholder="Ex: 45,1234" class="glass-input w-full text-xs h-8 font-mono">
                      </div>
                      <div>
                         <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Código CCIR</label>
                         <input type="text" id="input-new-mat-ccir" placeholder="950.082..." class="glass-input w-full text-xs h-8 font-mono">
                      </div>
                      <div>
                         <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Código ITR / NIRF</label>
                         <input type="text" id="input-new-mat-itr" placeholder="1.234.567-8" class="glass-input w-full text-xs h-8 font-mono">
                      </div>
                      <div>
                         <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Valor ITR (R$)</label>
                         <input type="number" step="0.01" id="input-new-mat-valor-itr" placeholder="Ex: 1500.00" class="glass-input w-full text-xs h-8 font-mono">
                      </div>
                      <div class="col-span-2">
                         <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">SIGEF (UUID do Georreferenciamento)</label>
                         <input type="text" id="input-new-mat-georreferenciamento" placeholder="a5b4c3d2-..." class="glass-input w-full text-xs h-8 font-mono">
                      </div>
                      <div class="col-span-2 md:col-span-4 flex justify-end gap-2">
                         <button type="button" class="btn-secondary h-8 text-xs font-bold px-4 hidden cursor-pointer" id="btn-cancelar-edicao-mat">Cancelar</button>
                         <button type="submit" class="btn-primary h-8 text-xs font-bold px-6 cursor-pointer" id="btn-submit-mat">Salvar Matrícula</button>
                      </div>
                   </form>
                </div>

                <!-- Tabela de Matrículas -->
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
    </div>

    <!-- MODAL DE HISTÓRICO DE ALTERAÇÃO DA MATRÍCULA -->
    <div id="modal-historico-matricula" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
       <div class="glass-card w-full max-w-lg border border-mint-vibrant/10 shadow-2xl">
          <div class="p-4 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
             <h3 class="text-xs font-bold text-white flex items-center gap-2">
                <i data-lucide="history" class="w-4 h-4 text-mint-vibrant"></i>
                <span id="modal-hist-mat-titulo">Histórico da Matrícula</span>
             </h3>
             <button class="text-white/40 hover:text-white transition-colors" id="btn-fechar-modal-hist-mat">
                <i data-lucide="x" class="w-4.5 h-4.5"></i>
             </button>
          </div>
          <div class="p-4 max-h-[50vh] overflow-y-auto pr-1">
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
       </div>
    </div>
  `,
  setup: () => {
    let propriedadeSelecionadaId: number | null = null;
    let todasPropriedades: any[] = [];
    let termoBusca = "";
    let paginaAtual = 1;
    let limitePorPagina = 10;
    const propriedadesSelecionadas = new Set<number>();
    let todosClientesList: any[] = [];

    // Variável para controle da edição de matrícula
    let matriculaSendoEditadaId: number | null = null;
    let matriculasCache: any[] = []; // Cache local de matrículas da propriedade aberta

    // --- MASCARAMENTO DE INPUTS NO MODAL ---
    const formProp = document.getElementById('form-propriedade') as HTMLFormElement;
    const inputCAR = formProp?.querySelector('[name="codigo_car"]') as HTMLInputElement;
    const inputCCIR = formProp?.querySelector('[name="codigo_ccir"]') as HTMLInputElement;
    const inputUF = formProp?.querySelector('[name="uf"]') as HTMLInputElement;

    inputCAR?.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      t.value = formatarCAR(t.value);
    });

    inputCCIR?.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      t.value = formatarCCIR(t.value);
    });

    inputUF?.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      t.value = t.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
    });

    // --- MASCARAS DA MATRÍCULA ---
    const inputMatCCIR = document.getElementById('input-new-mat-ccir') as HTMLInputElement;
    const inputMatITR = document.getElementById('input-new-mat-itr') as HTMLInputElement;
    const inputMatSIGEF = document.getElementById('input-new-mat-georreferenciamento') as HTMLInputElement;
    const inputMatArea = document.getElementById('input-new-mat-area') as HTMLInputElement;

    const aplicarMascaraCCIRMat = (val: string): string => {
       return val.replace(/\D/g, '')
          .replace(/(\d{3})(\d)/, '$1.$2')
          .replace(/(\d{3})(\d)/, '$1.$2')
          .replace(/(\d{3})(\d)/, '$1.$2')
          .replace(/(\d{3})(\d{1})$/, '$1-$2');
    };

    const aplicarMascaraITRMat = (val: string): string => {
       return val.replace(/\D/g, '')
          .replace(/(\d{1})(\d)/, '$1.$2')
          .replace(/(\d{3})(\d)/, '$1.$2')
          .replace(/(\d{3})(\d{1})$/, '$1-$2');
    };

    const aplicarMascaraUUIDMat = (val: string): string => {
       let limpo = val.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 32);
       let r = "";
       if (limpo.length > 0) r += limpo.slice(0, 8);
       if (limpo.length > 8) r += "-" + limpo.slice(8, 12);
       if (limpo.length > 12) r += "-" + limpo.slice(12, 16);
       if (limpo.length > 16) r += "-" + limpo.slice(16, 20);
       if (limpo.length > 20) r += "-" + limpo.slice(20, 32);
       return r;
    };

    // Formata o input decimal de área substituindo ponto por vírgula em tempo real
    inputMatArea?.addEventListener('input', (e) => {
       const t = e.target as HTMLInputElement;
       // Permite apenas números, um ponto ou uma vírgula
       let val = t.value.replace(/[^\d.,]/g, '');
       // Garante que só há um divisor decimal
       const divisores = val.match(/[.,]/g);
       if (divisores && divisores.length > 1) {
          val = val.slice(0, -1);
       }
       t.value = val;
    });

    inputMatCCIR?.addEventListener('input', (e) => {
       const t = e.target as HTMLInputElement;
       t.value = aplicarMascaraCCIRMat(t.value);
    });

    inputMatITR?.addEventListener('input', (e) => {
       const t = e.target as HTMLInputElement;
       t.value = aplicarMascaraITRMat(t.value);
    });

    inputMatSIGEF?.addEventListener('input', (e) => {
       const t = e.target as HTMLInputElement;
       t.value = aplicarMascaraUUIDMat(t.value);
    });

    // --- MODAIS ---
    const modalCadastro = document.getElementById('modal-propriedade');
    const modalDetalhes = document.getElementById('modal-detalhes-propriedade');
    const modalHistMat = document.getElementById('modal-historico-matricula');

    document.getElementById('btn-abrir-modal-propriedade')?.addEventListener('click', () => {
      propriedadeSelecionadaId = null;
      formProp?.reset();
      
      const modalTitulo = document.getElementById('modal-prop-titulo');
      if (modalTitulo) modalTitulo.innerText = "Nova Propriedade";
      
      const submitBtn = document.getElementById('btn-submit-prop');
      if (submitBtn) submitBtn.innerText = "Cadastrar Propriedade";
      
      modalCadastro?.classList.remove('hidden');
    });

    document.getElementById('btn-fechar-modal-prop')?.addEventListener('click', () => modalCadastro?.classList.add('hidden'));
    document.getElementById('btn-cancelar-prop')?.addEventListener('click', () => modalCadastro?.classList.add('hidden'));
    document.getElementById('btn-fechar-detalhes-prop')?.addEventListener('click', () => modalDetalhes?.classList.add('hidden'));
    document.getElementById('btn-fechar-modal-hist-mat')?.addEventListener('click', () => modalHistMat?.classList.add('hidden'));

    // --- ABAS DO MODAL DE DETALHES ---
    document.querySelectorAll('.tab-btn-det-prop').forEach(btn => {
       btn.addEventListener('click', (e) => {
          const targetTab = (e.target as HTMLElement).getAttribute('data-tab-prop');
          document.querySelectorAll('.tab-btn-det-prop').forEach(b => b.classList.replace('border-mint-vibrant', 'border-transparent'));
          document.querySelectorAll('.tab-btn-det-prop').forEach(b => b.classList.replace('text-mint-vibrant', 'text-white/40'));
          (e.target as HTMLElement).classList.replace('border-transparent', 'border-mint-vibrant');
          (e.target as HTMLElement).classList.replace('text-white/40', 'text-mint-vibrant');
          document.querySelectorAll('.tab-content-det-prop').forEach(tc => tc.classList.add('hidden'));
          document.getElementById(targetTab || '')?.classList.remove('hidden');
       });
    });

    // --- CONTROLE DAS SELEÇÕES EM LOTE ---
    const updateBatchActionBar = () => {
       const bar = document.getElementById('batch-action-bar');
       const countSpan = document.getElementById('batch-selected-count');
       const checkAll = document.getElementById('check-all-propriedades') as HTMLInputElement;
       
       if (propriedadesSelecionadas.size > 0) {
          if (countSpan) countSpan.innerText = propriedadesSelecionadas.size.toString();
          bar?.classList.remove('hidden');
       } else {
          bar?.classList.add('hidden');
       }

       const totalVisiveis = getPropriedadesPaginaAtual().length;
       const totalSelecionadosVisiveis = getPropriedadesPaginaAtual().filter(p => propriedadesSelecionadas.has(p.id)).length;
       if (checkAll) {
          checkAll.checked = totalVisiveis > 0 && totalSelecionadosVisiveis === totalVisiveis;
          checkAll.indeterminate = totalSelecionadosVisiveis > 0 && totalSelecionadosVisiveis < totalVisiveis;
       }
    };

    document.getElementById('btn-batch-cancel')?.addEventListener('click', () => {
       propriedadesSelecionadas.clear();
       updateBatchActionBar();
       renderTabela();
    });

    document.getElementById('btn-batch-delete')?.addEventListener('click', async () => {
       const count = propriedadesSelecionadas.size;
       if (!confirm(`ATENÇÃO: A exclusão destas ${count} propriedades selecionadas removerá todos os seus vínculos de proprietários, matrículas, levantamentos e histórico físico no Windows Explorer de forma definitiva. Deseja continuar?`)) return;
       
       const bar = document.getElementById('batch-action-bar');
       if (bar) bar.style.cursor = 'wait';

       try {
          const promises = Array.from(propriedadesSelecionadas).map(id =>
             fetch(`${API_BASE}/propriedades/${id}`, { method: 'DELETE' }).then(res => res.json())
          );
          const results = await Promise.all(promises);
          
          const errors = results.filter(r => r.error);
          if (errors.length > 0) {
             alert(`Algumas exclusões falharam: ${errors.map(e => e.error).join(', ')}`);
          }
          
          propriedadesSelecionadas.clear();
          updateBatchActionBar();
          loadPropriedades();
       } catch (e) {
          alert("Erro ao excluir propriedades selecionadas.");
       } finally {
          if (bar) bar.style.cursor = '';
       }
    });

    // --- FILTROS, BUSCA E ORDENAÇÃO ---
    document.getElementById('busca-propriedade')?.addEventListener('input', (e) => {
       termoBusca = (e.target as HTMLInputElement).value.toLowerCase();
       paginaAtual = 1;
       renderTabela();
    });

    document.getElementById('ordenacao-propriedade')?.addEventListener('change', () => {
       paginaAtual = 1;
       renderTabela();
    });

    document.getElementById('paginacao-limite')?.addEventListener('change', (e) => {
       limitePorPagina = parseInt((e.target as HTMLSelectElement).value);
       paginaAtual = 1;
       renderTabela();
    });

    const getPropriedadesFiltradas = () => {
       if (!termoBusca) return todasPropriedades;
       return todasPropriedades.filter(p => 
          (p.nome_propriedade || '').toLowerCase().includes(termoBusca) ||
          (p.municipio || '').toLowerCase().includes(termoBusca) ||
          (p.uf || '').toLowerCase().includes(termoBusca)
       );
    };

    const getPropriedadesOrdenadas = () => {
       const filtradas = getPropriedadesFiltradas();
       const selectOrdenacao = document.getElementById('ordenacao-propriedade') as HTMLSelectElement;
       const tipo = selectOrdenacao ? selectOrdenacao.value : 'nome-asc';
       
       const ordenadas = [...filtradas];
       if (tipo === 'nome-asc') {
          ordenadas.sort((a, b) => (a.nome_propriedade || '').localeCompare(b.nome_propriedade || ''));
       } else if (tipo === 'nome-desc') {
          ordenadas.sort((a, b) => (b.nome_propriedade || '').localeCompare(a.nome_propriedade || ''));
       } else if (tipo === 'data-desc') {
          ordenadas.sort((a, b) => (b.id || 0) - (a.id || 0)); // ID decrescente = mais recente
       } else if (tipo === 'data-asc') {
          ordenadas.sort((a, b) => (a.id || 0) - (b.id || 0)); // ID crescente = mais antigo
       }
       return ordenadas;
    };

    const getPropriedadesPaginaAtual = () => {
       const ordenadas = getPropriedadesOrdenadas();
       const inicio = (paginaAtual - 1) * limitePorPagina;
       return ordenadas.slice(inicio, inicio + limitePorPagina);
    };

    // --- ELEIÇÃO E TEXTO DO PROPRIETÁRIO PRINCIPAL ---
    const obterProprietarioPrincipalTexto = (clientes: any[]) => {
       if (!clientes || clientes.length === 0) {
          return '<span class="text-white/20 italic text-[11px]">Sem proprietário</span>';
       }
       
       const clientesOrdenados = [...clientes].sort((a, b) => {
          const partA = a.percentual_participacao || 0;
          const partB = b.percentual_participacao || 0;
          if (partB !== partA) {
             return partB - partA; 
          }
          return (a.nome_completo || '').localeCompare(b.nome_completo || ''); 
       });
       
       const principal = clientesOrdenados[0];
       const nomeCompleto = principal.nome_completo || '';
       const partesNome = nomeCompleto.trim().split(/\s+/);
       const nomeAbreviado = partesNome.slice(0, 2).join(' ');
       
       if (clientes.length > 1) {
          return `<span class="font-semibold text-white/80">${nomeAbreviado}</span> <span class="text-white/40 text-[10px]">e mais ${clientes.length - 1}</span>`;
       }
       return `<span class="font-semibold text-white/80">${nomeAbreviado}</span>`;
    };

    // --- RENDERIZAÇÃO DA TABELA ---
    const renderTabela = () => {
       const body = document.getElementById('tabela-propriedades-body');
       const statusDiv = document.getElementById('tabela-propriedades-status');
       const info = document.getElementById('paginacao-info');
       const botoes = document.getElementById('paginacao-botoes');
       
       if (!body) return;

       const ordenadas = getPropriedadesOrdenadas();
       const total = ordenadas.length;
       const totalPaginas = Math.ceil(total / limitePorPagina);
       
       if (paginaAtual > totalPaginas) {
          paginaAtual = Math.max(1, totalPaginas);
       }

       const visiveis = getPropriedadesPaginaAtual();

       const totalImoveis = todasPropriedades.length;
       const municipiosDiferentes = new Set(todasPropriedades.map(p => `${(p.municipio || '').trim().toUpperCase()}/${(p.uf || '').trim().toUpperCase()}`)).size;
       
       let totalMatriculasAcumuladas = 0;
       let totalLevantamentosAcumulados = 0;
       
       todasPropriedades.forEach(p => {
          totalMatriculasAcumuladas += (p.total_matriculas || 0);
          totalLevantamentosAcumulados += (p.total_levantamentos || 0);
       });

       const setStatText = (id: string, text: string) => {
          const el = document.getElementById(id);
          if (el) el.innerText = text;
       };

       setStatText('stat-total-prop', totalImoveis.toString());
       setStatText('stat-municipios-prop', municipiosDiferentes.toString());
       setStatText('stat-total-mats', totalMatriculasAcumuladas.toString());
       setStatText('stat-total-levs', totalLevantamentosAcumulados.toString());

       if (total === 0) {
          body.innerHTML = '';
          statusDiv?.classList.remove('hidden');
          if (statusDiv) statusDiv.innerText = todasPropriedades.length === 0 ? "Nenhuma propriedade cadastrada no sistema." : "Nenhum resultado encontrado para a busca.";
          if (info) info.innerText = "Mostrando 0-0 de 0 propriedades";
          if (botoes) botoes.innerHTML = '';
          return;
       }

       statusDiv?.classList.add('hidden');

       body.innerHTML = visiveis.map(p => {
          const isSel = propriedadesSelecionadas.has(p.id);
          const rowClass = isSel ? 'bg-mint-vibrant/5 border-l-2 border-l-mint-vibrant' : 'hover:bg-white/[0.01]';

          return `
             <tr class="border-b border-white/5 transition-all text-xs ${rowClass}" data-id="${p.id}">
                <td class="py-2.5 px-4">
                   <input type="checkbox" data-id="${p.id}" class="check-propriedade rounded border-white/10 text-mint-vibrant bg-white/5 focus:ring-0 focus:ring-offset-0 cursor-pointer" ${isSel ? 'checked' : ''} />
                </td>
                <td class="py-2.5 px-4 font-medium text-white flex items-center gap-2.5 cursor-pointer hover:text-mint-vibrant truncate w-72" onclick="window.abrirDetalhesPropriedade(${p.id})">
                   <div class="w-7 h-7 rounded-full bg-mint-vibrant/10 flex items-center justify-center text-xs font-bold text-mint-vibrant shrink-0">
                      <i data-lucide="home" class="w-3.5 h-3.5 text-mint-vibrant"></i>
                   </div>
                   <span class="truncate font-semibold">${p.nome_propriedade}</span>
                </td>
                <td class="py-2.5 px-4 text-white/70">${p.municipio} / ${p.uf}</td>
                <td class="py-2.5 px-4">${obterProprietarioPrincipalTexto(p.clientes)}</td>
                <td class="py-2.5 px-4 text-center font-mono font-medium text-white/70">${p.total_matriculas || 0}</td>
                <td class="py-2.5 px-4 text-center font-mono font-medium text-white/70">${p.total_levantamentos || 0}</td>
                <td class="py-2.5 px-4 text-right">
                   <div class="flex items-center justify-end gap-1">
                      <button class="p-1.5 text-white/40 hover:text-mint-vibrant rounded hover:bg-white/5 transition-colors cursor-pointer" onclick="window.abrirDetalhesPropriedade(${p.id})" title="Ver Detalhes">
                         <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                      </button>
                      <button class="p-1.5 text-white/40 hover:text-mint-vibrant rounded hover:bg-white/5 transition-colors cursor-pointer" onclick="window.abrirEdicaoPropriedade(${p.id})" title="Editar">
                         <i data-lucide="edit" class="w-3.5 h-3.5"></i>
                      </button>
                      <button class="p-1.5 text-white/40 hover:text-red-400 rounded hover:bg-white/5 transition-colors cursor-pointer" onclick="window.excluirPropriedadeIndividual(${p.id})" title="Excluir">
                         <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                      </button>
                   </div>
                </td>
             </tr>
          `;
       }).join('');

       // Paginação Info e Botões
       const inicioItem = (paginaAtual - 1) * limitePorPagina + 1;
       const fimItem = Math.min(paginaAtual * limitePorPagina, total);
       if (info) info.innerText = `Mostrando ${inicioItem}-${fimItem} de ${total} propriedades`;

       let pagButtonsHtml = '';
       if (totalPaginas > 1) {
          pagButtonsHtml += `
             <button class="h-7 px-2.5 rounded border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-all font-bold flex items-center justify-center cursor-pointer" ${paginaAtual === 1 ? 'disabled' : ''} onclick="window.mudarPaginaPropriedades(${paginaAtual - 1})">
                Anterior
             </button>
          `;
          
          for (let p = 1; p <= totalPaginas; p++) {
             if (p === 1 || p === totalPaginas || (p >= paginaAtual - 1 && p <= paginaAtual + 1)) {
                const activeClass = p === paginaAtual ? 'bg-mint-vibrant text-forest-deep border-transparent font-bold' : 'border-white/10 hover:bg-white/5 text-white/70';
                pagButtonsHtml += `
                   <button class="w-7 h-7 rounded border text-xs font-mono transition-all flex items-center justify-center cursor-pointer ${activeClass}" onclick="window.mudarPaginaPropriedades(${p})">
                      ${p}
                   </button>
                `;
             } else if (p === paginaAtual - 2 || p === paginaAtual + 2) {
                pagButtonsHtml += `<span class="px-1 text-white/20 select-none">...</span>`;
             }
          }

          pagButtonsHtml += `
             <button class="h-7 px-2.5 rounded border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-all font-bold flex items-center justify-center cursor-pointer" ${paginaAtual === totalPaginas ? 'disabled' : ''} onclick="window.mudarPaginaPropriedades(${paginaAtual + 1})">
                Próxima
             </button>
          `;
       }
       if (botoes) botoes.innerHTML = pagButtonsHtml;

       initIcons();

       // Checkboxes
       body.querySelectorAll('.check-propriedade').forEach(cb => {
          cb.addEventListener('change', (e) => {
             const check = e.target as HTMLInputElement;
             const id = parseInt(check.getAttribute('data-id') || '0');
             if (check.checked) {
                propriedadesSelecionadas.add(id);
             } else {
                propriedadesSelecionadas.delete(id);
             }
             updateBatchActionBar();
             renderTabela();
          });
       });

       updateBatchActionBar();
    };

    (window as any).mudarPaginaPropriedades = (novaPagina: number) => {
       paginaAtual = novaPagina;
       renderTabela();
    };

    // Checkbox Master
    document.getElementById('check-all-propriedades')?.addEventListener('change', (e) => {
       const check = e.target as HTMLInputElement;
       const visiveis = getPropriedadesPaginaAtual();
       if (check.checked) {
          visiveis.forEach(p => propriedadesSelecionadas.add(p.id));
       } else {
          visiveis.forEach(p => propriedadesSelecionadas.delete(p.id));
       }
       updateBatchActionBar();
       renderTabela();
    });

    // --- CARREGAR DADOS GERAIS ---
    const loadPropriedades = () => {
       const body = document.getElementById('tabela-propriedades-body');
       const statusDiv = document.getElementById('tabela-propriedades-status');
       
       if (!body) return Promise.resolve();

       body.innerHTML = '';
       statusDiv?.classList.remove('hidden');
       if (statusDiv) statusDiv.innerText = "Carregando propriedades...";

       return fetch(`${API_BASE}/propriedades`)
          .then(res => res.json())
          .then(data => {
             if (data.error) {
                statusDiv?.classList.remove('hidden');
                if (statusDiv) statusDiv.innerHTML = `<span class="text-red-400 font-bold">Erro: ${data.error}</span>`;
                return;
             }
             todasPropriedades = Array.isArray(data) ? data : [];
             
             // Foco inteligente vindo de Clientes
             const focoIdStr = localStorage.getItem('gerencigeo_foco_propriedade_id');
             if (focoIdStr) {
                const focoId = parseInt(focoIdStr);
                localStorage.removeItem('gerencigeo_foco_propriedade_id');
                if (focoId && todasPropriedades.some((x: any) => x.id === focoId)) {
                   renderTabela();
                   (window as any).abrirDetalhesPropriedade(focoId);
                   return;
                }
             }

             renderTabela();
          })
          .catch(err => {
             console.error("Erro ao carregar propriedades:", err);
             statusDiv?.classList.remove('hidden');
             if (statusDiv) statusDiv.innerHTML = '<span class="text-red-400 font-bold">Erro de conexão ao servidor.</span>';
          });
    };

    // --- CARREGAR CLIENTES GLOBAIS PARA VÍNCULO ---
    const loadClientesList = async () => {
       try {
          const res = await fetch(`${API_BASE}/clientes`);
          todosClientesList = await res.json();
          setupComboboxClientes();
       } catch (err) {
          console.error("Erro ao carregar clientes globais:", err);
       }
    };

    const setupComboboxClientes = () => {
       const inputBusca = document.getElementById('busca-proprietario-cliente') as HTMLInputElement;
       const inputHidden = document.getElementById('vinc-cliente-id') as HTMLInputElement;
       const listaFlutuante = document.getElementById('lista-vinc-clientes');

       if (!inputBusca || !inputHidden || !listaFlutuante) return;

       const renderOpcoes = (termo: string) => {
          const t = termo.toLowerCase();
          const filtrados = todosClientesList.filter(c => 
             c.nome_completo.toLowerCase().includes(t) ||
             c.cpf_cnpj.includes(t)
          );

          if (filtrados.length === 0) {
             listaFlutuante.innerHTML = '<div class="p-2.5 text-xs text-white/30 italic">Nenhum cliente localizado.</div>';
          } else {
             listaFlutuante.innerHTML = filtrados.map(c => `
                <div class="opcao-vinc-item p-2 hover:bg-mint-vibrant/10 cursor-pointer text-xs transition-colors flex flex-col" data-id="${c.id}" data-nome="${c.nome_completo}">
                   <span class="font-bold text-white">${c.nome_completo}</span>
                   <span class="text-[9px] text-white/40 font-mono mt-0.5">Doc: ${c.cpf_cnpj}</span>
                </div>
             `).join('');

             listaFlutuante.querySelectorAll('.opcao-vinc-item').forEach(item => {
                item.addEventListener('click', () => {
                   inputBusca.value = item.getAttribute('data-nome') || '';
                   inputHidden.value = item.getAttribute('data-id') || '';
                   listaFlutuante.classList.add('hidden');
                });
             });
          }
       };

       inputBusca.addEventListener('focus', () => {
          listaFlutuante.classList.remove('hidden');
          renderOpcoes(inputBusca.value);
       });

       inputBusca.addEventListener('input', () => {
          listaFlutuante.classList.remove('hidden');
          renderOpcoes(inputBusca.value);
       });

       document.addEventListener('click', (e) => {
          if (!inputBusca.contains(e.target as Node) && !listaFlutuante.contains(e.target as Node)) {
             listaFlutuante.classList.add('hidden');
          }
       });
    };

    // --- DETALHES DE PROPRIEDADE ---
    (window as any).abrirDetalhesPropriedade = (id: number) => {
       const p = todasPropriedades.find(x => x.id === id);
       if (!p) return;

       propriedadeSelecionadaId = id;

       const titulo = document.getElementById('det-prop-titulo');
       const subtitulo = document.getElementById('det-prop-subtitulo');
       if (titulo) titulo.innerText = p.nome_propriedade;
       if (subtitulo) subtitulo.innerText = `${p.municipio} / ${p.uf}`;

       const setDetVal = (elId: string, val: string) => {
          const el = document.getElementById(elId);
          if (el) el.innerText = val || '-';
       };

       setDetVal('det-prop-car', p.codigo_car);
       setDetVal('det-prop-ccir', p.codigo_ccir);

       // Configura anexos
       configurarExibicaoArquivo('car', p.caminho_arquivo_car);
       configurarExibicaoArquivo('ccir', p.caminho_arquivo_ccir);

       // Proprietários
       renderProprietariosTabela(p.clientes || []);
       
       // Reseta edição de matrícula
       resetaFormularioMatricula();

       // Matrículas
       loadMatriculasDaPropriedade(id);

       const activeTabBtn = document.querySelector('.tab-btn-det-prop[data-tab-prop="tab-prop-dados"]') as HTMLElement;
       if (activeTabBtn) activeTabBtn.click();

       modalDetalhes?.classList.remove('hidden');
    };

    // --- DELEÇÃO DE ANEXO DE PROPRIEDADE ---
    const excluirArquivoPropriedade = async (tipo: 'car' | 'ccir') => {
       if (!propriedadeSelecionadaId) return;
       if (!confirm(`Deseja realmente excluir o arquivo de certidão do ${tipo.toUpperCase()} anexado?`)) return;

       try {
          const res = await fetch(`${API_BASE}/propriedades/${propriedadeSelecionadaId}/arquivo-${tipo}`, {
             method: 'DELETE'
          });
          const data = await res.json();
          if (data.error) {
             alert(data.error);
          } else {
             // Recarrega propriedade
             const propRes = await fetch(`${API_BASE}/propriedades`);
             todasPropriedades = await propRes.json();
             const pAtual = todasPropriedades.find(x => x.id === propriedadeSelecionadaId);
             configurarExibicaoArquivo(tipo, pAtual ? pAtual[`caminho_arquivo_${tipo}`] : null);
             renderTabela();
          }
       } catch (err) {
          alert("Erro de conexão ao remover o arquivo.");
       }
    };

    document.getElementById('btn-delete-car')?.addEventListener('click', () => excluirArquivoPropriedade('car'));
    document.getElementById('btn-delete-ccir')?.addEventListener('click', () => excluirArquivoPropriedade('ccir'));

    const configurarExibicaoArquivo = (tipo: 'car' | 'ccir', caminho: string | null) => {
       const dropzone = document.getElementById(`dropzone-${tipo}`);
       const containerAnexo = document.getElementById(`container-anexo-${tipo}`);
       const textNome = document.getElementById(`txt-anexo-${tipo}-nome`);
       const btnDownload = document.getElementById(`btn-download-${tipo}`) as HTMLButtonElement;

       if (!dropzone || !containerAnexo || !textNome || !btnDownload) return;

       if (caminho) {
          dropzone.classList.add('hidden');
          containerAnexo.classList.remove('hidden');
          const parts = caminho.split(/[\\/]/);
          const filename = parts[parts.length - 1];
          textNome.innerText = filename;
          
          const openUrl = () => window.open(`${API_BASE}/propriedades/${propriedadeSelecionadaId}/arquivo-${tipo}`, '_blank');
          btnDownload.onclick = openUrl;
          textNome.onclick = openUrl;
       } else {
          dropzone.classList.remove('hidden');
          containerAnexo.classList.add('hidden');
          textNome.innerText = '';
          textNome.onclick = null;
       }
    };

    // --- TABELA DE PROPRIETÁRIOS VINCULADOS ---
    const renderProprietariosTabela = (clientes: any[]) => {
       const corpo = document.getElementById('tbl-prop-proprietarios-corpo');
       const lblQuota = document.getElementById('lbl-quota-restante');
       if (!corpo || !lblQuota) return;

       let somaParticipacao = 0;

       if (clientes.length === 0) {
          corpo.innerHTML = `
             <tr>
                <td colspan="4" class="text-center py-5 text-white/30 italic">Nenhum proprietário vinculado.</td>
             </tr>
          `;
       } else {
          corpo.innerHTML = clientes.map(c => {
             somaParticipacao += c.percentual_participacao || 0;
             return `
                <tr class="hover:bg-white/[0.01] border-b border-white/5 text-xs text-white/80">
                   <td class="px-3 py-2 font-bold text-white">${c.nome_completo}</td>
                   <td class="px-3 py-2 font-mono text-white/60">${c.cpf_cnpj}</td>
                   <td class="px-3 py-2 text-right font-mono text-mint-vibrant font-bold">${(c.percentual_participacao || 0).toFixed(2)}%</td>
                   <td class="px-3 py-2 text-center">
                      <button class="text-white/40 hover:text-red-400 p-1 btn-remover-vinculo cursor-pointer" data-cli-id="${c.id}" title="Desvincular Proprietário">
                         <i data-lucide="x" class="w-3.5 h-3.5"></i>
                      </button>
                   </td>
                </tr>
             `;
          }).join('');

          initIcons();

          corpo.querySelectorAll('.btn-remover-vinculo').forEach(btn => {
             btn.addEventListener('click', async () => {
                const cliId = btn.getAttribute('data-cli-id');
                if (confirm("Tem certeza que deseja remover a vinculação de copropriedade deste cliente?")) {
                   try {
                      const res = await fetch(`${API_BASE}/propriedades/${propriedadeSelecionadaId}/clientes/${cliId}`, { method: 'DELETE' });
                      const data = await res.json();
                      if (data.error) {
                         alert(data.error);
                      } else {
                         const propRes = await fetch(`${API_BASE}/propriedades`);
                         todasPropriedades = await propRes.json();
                         const pAtual = todasPropriedades.find(x => x.id === propriedadeSelecionadaId);
                         renderProprietariosTabela(pAtual ? pAtual.clientes || [] : []);
                         renderTabela();
                      }
                   } catch (err) {
                      alert("Erro ao remover proprietário.");
                   }
                }
             });
          });
       }

       const quotaDisponivel = Math.max(0, 100 - somaParticipacao);
       lblQuota.innerText = `${quotaDisponivel.toFixed(2)}%`;
    };

    // --- CARREGAR MATRÍCULAS ---
    const loadMatriculasDaPropriedade = async (propId: number) => {
       const corpo = document.getElementById('tbl-prop-matriculas-corpo');
       if (!corpo) return;

       corpo.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-white/30 italic">Carregando glebas...</td></tr>';

       try {
          const res = await fetch(`${API_BASE}/propriedades/${propId}/matriculas`);
          const matriculas = await res.json();

          if (matriculas.error) {
             corpo.innerHTML = `<tr><td colspan="5" class="text-center py-5 text-red-400">${matriculas.error}</td></tr>`;
             return;
          }

          matriculasCache = Array.isArray(matriculas) ? matriculas : [];

          if (matriculasCache.length === 0) {
             corpo.innerHTML = `
                <tr>
                   <td colspan="5" class="text-center py-5 text-white/30 italic">Nenhuma matrícula cadastrada.</td>
                </tr>
             `;
             return;
          }

          corpo.innerHTML = matriculasCache.map(m => {
             // Formatação da área com ponto de milhar e vírgula
             const areaFormatada = (m.area_ha || 0).toLocaleString('pt-BR', {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4
             });

             // Bloco PDF
             let pdfHtml = '';
             if (m.caminho_arquivo_pdf) {
                const parts = m.caminho_arquivo_pdf.split(/[\\/]/);
                const pdfName = parts[parts.length - 1];
                pdfHtml = `
                   <div class="flex items-center justify-center gap-1">
                      <a href="${API_BASE}/matriculas/${m.id}/download-pdf" target="_blank" class="text-mint-vibrant hover:text-white transition-colors p-1" title="Ver Certidão PDF (${pdfName})">
                         <i data-lucide="file-text" class="w-4 h-4"></i>
                      </a>
                      <button onclick="window.excluirPdfMatricula(${m.id})" class="text-white/40 hover:text-red-400 p-1 cursor-pointer" title="Remover PDF">
                         <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                      </button>
                   </div>
                `;
             } else {
                pdfHtml = `
                   <div class="flex items-center justify-center">
                      <button onclick="document.getElementById('input-pdf-mat-${m.id}').click()" class="text-white/40 hover:text-mint-vibrant p-1 transition-colors cursor-pointer" title="Enviar Certidão PDF">
                         <i data-lucide="upload" class="w-4 h-4"></i>
                      </button>
                      <input type="file" id="input-pdf-mat-${m.id}" class="hidden" accept=".pdf" onchange="window.uploadPdfMatricula(event, ${m.id})" />
                   </div>
                `;
             }

             return `
                <tr class="hover:bg-white/[0.01] border-b border-white/5 text-xs text-white/80">
                   <td class="px-3 py-2 text-white">
                      <span class="block font-bold">Matrícula nº ${m.numero_matricula}</span>
                      <span class="block text-[9px] text-white/40">${m.denominacao || 'Lote sem nome'}</span>
                   </td>
                   <td class="px-3 py-2 text-right font-mono text-white/90 font-medium">${areaFormatada} ha</td>
                   <td class="px-3 py-2 text-white/60 leading-tight">
                      <span class="block">CCIR: ${m.ccir || 'N/A'}</span>
                      <span class="block">ITR/NIRF: ${m.itr || 'N/A'} ${m.valor_itr ? `(R$ ${m.valor_itr.toLocaleString('pt-BR', {minimumFractionDigits: 2})})` : ''}</span>
                      <span class="block text-[9px] text-mint-vibrant truncate font-mono max-w-[170px]" title="${m.georreferenciamento || ''}">SIGEF: ${m.georreferenciamento || 'N/A'}</span>
                   </td>
                   <td class="px-3 py-2 text-center">${pdfHtml}</td>
                   <td class="px-3 py-2 text-right">
                      <div class="flex items-center justify-end gap-0.5">
                         <button class="p-1 text-white/40 hover:text-mint-vibrant rounded hover:bg-white/5 transition-colors cursor-pointer" onclick="window.abrirHistoricoMatricula(${m.id})" title="Histórico de Auditoria">
                            <i data-lucide="history" class="w-3.5 h-3.5"></i>
                         </button>
                         <button class="p-1 text-white/40 hover:text-mint-vibrant rounded hover:bg-white/5 transition-colors cursor-pointer" onclick="window.abrirEdicaoMatricula(${m.id})" title="Editar">
                            <i data-lucide="edit" class="w-3.5 h-3.5"></i>
                         </button>
                         <button class="p-1 text-white/40 hover:text-red-400 rounded hover:bg-white/5 transition-colors cursor-pointer" onclick="window.excluirMatriculaIndividual(${m.id})" title="Excluir">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                         </button>
                      </div>
                   </td>
                </tr>
             `;
          }).join('');

          initIcons();
       } catch (err) {
          console.error("Erro ao carregar matrículas:", err);
          corpo.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-red-400">Erro de conexão ao carregar.</td></tr>';
       }
    };

    // --- UPLOAD E DELEÇÃO DE PDF DE MATRÍCULA ---
    (window as any).uploadPdfMatricula = async (event: any, mid: number) => {
       const file = event.target.files[0];
       if (!file) return;

       const formData = new FormData();
       formData.append('file', file);

       try {
          const res = await fetch(`${API_BASE}/matriculas/${mid}/upload-pdf`, {
             method: 'POST',
             body: formData
          });
          const data = await res.json();
          if (data.error) {
             alert(data.error);
          } else {
             alert("Certidão em PDF anexada à matrícula com sucesso!");
             loadMatriculasDaPropriedade(propriedadeSelecionadaId!);
          }
       } catch (err) {
          alert("Erro de conexão ao enviar o PDF da matrícula.");
       }
    };

    (window as any).excluirPdfMatricula = async (mid: number) => {
       if (!confirm("Deseja realmente remover o arquivo PDF da certidão desta matrícula?")) return;

       try {
          const res = await fetch(`${API_BASE}/matriculas/${mid}/pdf`, {
             method: 'DELETE'
          });
          const data = await res.json();
          if (data.error) {
             alert(data.error);
          } else {
             loadMatriculasDaPropriedade(propriedadeSelecionadaId!);
          }
       } catch (err) {
          alert("Erro de conexão ao remover o PDF.");
       }
    };

    // --- HISTÓRICO DE AUDITORIA DA MATRÍCULA ---
    (window as any).abrirHistoricoMatricula = async (mid: number) => {
       const m = matriculasCache.find(x => x.id === mid);
       if (!m) return;

       const tit = document.getElementById('modal-hist-mat-titulo');
       if (tit) tit.innerText = `Histórico de Alterações - Matrícula nº ${m.numero_matricula}`;

       const corpoHist = document.getElementById('tbl-hist-mat-corpo');
       if (corpoHist) corpoHist.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-white/30">Carregando histórico...</td></tr>';

       modalHistMat?.classList.remove('hidden');

       try {
          const res = await fetch(`${API_BASE}/matriculas/${mid}/historico`);
          const logs = await res.json();

          if (corpoHist) {
             if (Array.isArray(logs) && logs.length > 0) {
                corpoHist.innerHTML = logs.map(l => {
                   const dataFormatada = new Date(l.data_alteracao).toLocaleString('pt-BR');
                   return `
                      <tr class="hover:bg-white/[0.01]">
                         <td class="py-2 px-3 font-medium text-white/80">${l.campo_alterado}</td>
                         <td class="py-2 px-3 text-red-400 font-mono truncate max-w-[120px]" title="${l.valor_antigo || ''}">${l.valor_antigo || '-'}</td>
                         <td class="py-2 px-3 text-mint-vibrant font-mono truncate max-w-[120px]" title="${l.valor_novo || ''}">${l.valor_novo || '-'}</td>
                         <td class="py-2 px-3 text-right text-white/40 font-mono">${dataFormatada}</td>
                      </tr>
                   `;
                }).join('');
             } else {
                corpoHist.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-white/20">Nenhum log gravado para esta matrícula.</td></tr>';
             }
          }
       } catch (e) {
          if (corpoHist) corpoHist.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-red-400">Falha ao obter histórico.</td></tr>';
       }
    };

    // --- CADASTRO E EDIÇÃO DE MATRÍCULA ---
    const resetaFormularioMatricula = () => {
       matriculaSendoEditadaId = null;
       
       (document.getElementById('input-new-mat-numero') as HTMLInputElement).value = '';
       (document.getElementById('input-new-mat-denominacao') as HTMLInputElement).value = '';
       (document.getElementById('input-new-mat-area') as HTMLInputElement).value = '';
       (document.getElementById('input-new-mat-ccir') as HTMLInputElement).value = '';
       (document.getElementById('input-new-mat-itr') as HTMLInputElement).value = '';
       (document.getElementById('input-new-mat-valor-itr') as HTMLInputElement).value = '';
       (document.getElementById('input-new-mat-georreferenciamento') as HTMLInputElement).value = '';

       const formTitulo = document.getElementById('form-matricula-titulo');
       if (formTitulo) formTitulo.innerText = "Cadastrar Gleba / Matrícula";

       const btnSub = document.getElementById('btn-submit-mat');
       if (btnSub) btnSub.innerText = "Salvar Matrícula";

       document.getElementById('btn-cancelar-edicao-mat')?.classList.add('hidden');
    };

    document.getElementById('btn-cancelar-edicao-mat')?.addEventListener('click', resetaFormularioMatricula);

    (window as any).abrirEdicaoMatricula = (mid: number) => {
       const m = matriculasCache.find(x => x.id === mid);
       if (!m) return;

       matriculaSendoEditadaId = mid;

       (document.getElementById('input-new-mat-numero') as HTMLInputElement).value = m.numero_matricula || '';
       (document.getElementById('input-new-mat-denominacao') as HTMLInputElement).value = m.denominacao || '';
       
       // Área formatada com vírgula para manter compatibilidade visual
       (document.getElementById('input-new-mat-area') as HTMLInputElement).value = (m.area_ha || '').toString().replace('.', ',');
       
       (document.getElementById('input-new-mat-ccir') as HTMLInputElement).value = m.ccir ? aplicarMascaraCCIRMat(m.ccir) : '';
       (document.getElementById('input-new-mat-itr') as HTMLInputElement).value = m.itr ? aplicarMascaraITRMat(m.itr) : '';
       (document.getElementById('input-new-mat-valor-itr') as HTMLInputElement).value = m.valor_itr || '';
       (document.getElementById('input-new-mat-georreferenciamento') as HTMLInputElement).value = m.georreferenciamento ? aplicarMascaraUUIDMat(m.georreferenciamento) : '';

       const formTitulo = document.getElementById('form-matricula-titulo');
       if (formTitulo) formTitulo.innerText = "Editar Gleba / Matrícula";

       const btnSub = document.getElementById('btn-submit-mat');
       if (btnSub) btnSub.innerText = "Salvar Alterações";

       document.getElementById('btn-cancelar-edicao-mat')?.classList.remove('hidden');
    };

    (window as any).excluirMatriculaIndividual = async (mid: number) => {
       if (confirm("ATENÇÃO: A exclusão da matrícula removerá em cascata todos os vértices e limites vinculados. Deseja prosseguir com a exclusão jurídica?")) {
          try {
             const deleteRes = await fetch(`${API_BASE}/matriculas/${mid}`, { method: 'DELETE' });
             const deleteData = await deleteRes.json();
             if (deleteData.error) {
                alert(deleteData.error);
             } else {
                if (matriculaSendoEditadaId === mid) {
                   resetaFormularioMatricula();
                }
                loadMatriculasDaPropriedade(propriedadeSelecionadaId!);
                const propRes = await fetch(`${API_BASE}/propriedades`);
                todasPropriedades = await propRes.json();
                renderTabela();
             }
          } catch (err) {
             alert("Erro ao excluir matrícula.");
          }
       }
    };

    document.getElementById('form-cadastrar-matricula-prop')?.addEventListener('submit', async (e) => {
       e.preventDefault();
       const numero_matricula = (document.getElementById('input-new-mat-numero') as HTMLInputElement).value.trim();
       const denominacao = (document.getElementById('input-new-mat-denominacao') as HTMLInputElement).value.trim();
       
       // Trata o divisor decimal da área convertendo vírgula para ponto antes do parse float
       const area_raw = (document.getElementById('input-new-mat-area') as HTMLInputElement).value.trim();
       const area_ha = parseFloat(area_raw.replace(',', '.'));
       
       const ccir = (document.getElementById('input-new-mat-ccir') as HTMLInputElement).value.trim();
       const itr = (document.getElementById('input-new-mat-itr') as HTMLInputElement).value.trim();
       const raw_valor = (document.getElementById('input-new-mat-valor-itr') as HTMLInputElement).value;
       const valor_itr = raw_valor ? parseFloat(raw_valor) : null;
       const georreferenciamento = (document.getElementById('input-new-mat-georreferenciamento') as HTMLInputElement).value.trim();

       if (!numero_matricula || !denominacao || isNaN(area_ha)) return;

       try {
          const url = matriculaSendoEditadaId ? `${API_BASE}/matriculas/${matriculaSendoEditadaId}` : `${API_BASE}/propriedades/${propriedadeSelecionadaId}/matriculas`;
          const method = matriculaSendoEditadaId ? 'PUT' : 'POST';

          const res = await fetch(url, {
             method: method,
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ numero_matricula, ccir, itr, area_ha, valor_itr, denominacao, georreferenciamento })
          });
          const data = await res.json();
          if (data.error) {
             alert(data.error);
          } else {
             resetaFormularioMatricula();
             loadMatriculasDaPropriedade(propriedadeSelecionadaId!);
             
             // Recarrega listagem geral
             fetch(`${API_BASE}/propriedades`)
                .then(r => r.json())
                .then(propsData => {
                   todasPropriedades = propsData;
                   renderTabela();
                });
          }
       } catch (err) {
          alert("Erro ao salvar dados da matrícula.");
       }
    });

    // --- FORM VINCULAR PROPRIETÁRIO ---
    document.getElementById('form-vincular-proprietario')?.addEventListener('submit', async (e) => {
       e.preventDefault();
       const cliId = parseInt((document.getElementById('vinc-cliente-id') as HTMLInputElement).value);
       const participacao = parseFloat((document.getElementById('vinc-participacao') as HTMLInputElement).value);

       if (!cliId || isNaN(participacao) || !propriedadeSelecionadaId) return;

       try {
          const res = await fetch(`${API_BASE}/propriedades/${propriedadeSelecionadaId}/clientes`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ cliente_id: cliId, percentual_participacao: participacao })
          });
          const data = await res.json();
          if (data.error) {
             alert(data.error);
          } else {
             (document.getElementById('busca-proprietario-cliente') as HTMLInputElement).value = '';
             (document.getElementById('vinc-cliente-id') as HTMLInputElement).value = '';
             (document.getElementById('vinc-participacao') as HTMLInputElement).value = '';

             // Recarrega
             const propRes = await fetch(`${API_BASE}/propriedades`);
             todasPropriedades = await propRes.json();
             const pAtual = todasPropriedades.find(x => x.id === propriedadeSelecionadaId);
             renderProprietariosTabela(pAtual ? pAtual.clientes || [] : []);
             renderTabela();
          }
       } catch (err) {
          alert("Erro de conexão ao vincular proprietário.");
       }
    });

    // --- SUBMIT DE CADASTRO/EDIÇÃO DE PROPRIEDADE ---
    formProp?.addEventListener('submit', async (e) => {
       e.preventDefault();
       const formData = new FormData(e.target as HTMLFormElement);
       const payload = Object.fromEntries(formData.entries());

       try {
          const url = propriedadeSelecionadaId ? `${API_BASE}/propriedades/${propriedadeSelecionadaId}` : `${API_BASE}/propriedades`;
          const method = propriedadeSelecionadaId ? 'PUT' : 'POST';

          const res = await fetch(url, {
             method: method,
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify(payload)
          });

          const data = await res.json();
          if (data.error) {
             alert(data.error);
          } else {
             modalCadastro?.classList.add('hidden');
             formProp.reset();
             loadPropriedades().then(() => {
                if (propriedadeSelecionadaId) {
                   (window as any).abrirDetalhesPropriedade(propriedadeSelecionadaId);
                }
             });
          }
       } catch (err) {
          alert("Erro de conexão ao salvar propriedade.");
       }
    });

    // --- AÇÕES INDIVIDUAIS DA TABELA ---
    (window as any).abrirEdicaoPropriedade = (id: number) => {
       const p = todasPropriedades.find(x => x.id === id);
       if (!p) return;

       propriedadeSelecionadaId = id;

       const modalTitulo = document.getElementById('modal-prop-titulo');
       if (modalTitulo) modalTitulo.innerText = "Editar Propriedade";
       
       const submitBtn = document.getElementById('btn-submit-prop');
       if (submitBtn) submitBtn.innerText = "Salvar Alterações";

       const setFormVal = (name: string, val: string) => {
          const input = formProp.querySelector(`[name="${name}"]`) as HTMLInputElement;
          if (input) input.value = val || '';
       };

       setFormVal('nome_propriedade', p.nome_propriedade);
       setFormVal('codigo_car', p.codigo_car ? formatarCAR(p.codigo_car) : '');
       setFormVal('codigo_ccir', p.codigo_ccir ? formatarCCIR(p.codigo_ccir) : '');
       setFormVal('municipio', p.municipio);
       setFormVal('uf', p.uf);

       modalDetalhes?.classList.add('hidden');
       modalCadastro?.classList.remove('hidden');
    };

    (window as any).excluirPropriedadeIndividual = async (id: number) => {
       const p = todasPropriedades.find(x => x.id === id);
       if (!p || !confirm(`Tem certeza absoluta que deseja excluir a propriedade "${p.nome_propriedade}"? Isso apagará todas as matrículas, levantamentos e vínculos correspondentes de forma definitiva.`)) return;

       try {
          const res = await fetch(`${API_BASE}/propriedades/${id}`, { method: 'DELETE' });
          const data = await res.json();
          if (data.error) alert(data.error);
          else {
             modalDetalhes?.classList.add('hidden');
             propriedadesSelecionadas.delete(id);
             updateBatchActionBar();
             loadPropriedades();
          }
       } catch (err) {
          alert("Erro ao excluir propriedade.");
       }
    };

    document.getElementById('btn-det-editar-prop')?.addEventListener('click', () => {
       if (propriedadeSelecionadaId) {
          (window as any).abrirEdicaoPropriedade(propriedadeSelecionadaId);
       }
    });

    document.getElementById('btn-det-excluir-prop')?.addEventListener('click', () => {
       if (propriedadeSelecionadaId) {
          (window as any).excluirPropriedadeIndividual(propriedadeSelecionadaId);
       }
    });

    // --- UPLOADS CAR & CCIR (DRAG & DROP) ---
    const configurarDropzone = (tipo: 'car' | 'ccir') => {
       const dropzone = document.getElementById(`dropzone-${tipo}`);
       const fileInput = document.getElementById(`input-file-${tipo}`) as HTMLInputElement;

       if (!dropzone || !fileInput) return;

       dropzone.addEventListener('click', () => fileInput.click());

       const processarUpload = async (file: File) => {
          const formData = new FormData();
          formData.append('file', file);

          dropzone.style.cursor = 'wait';
          dropzone.classList.add('animate-pulse');

          try {
             const res = await fetch(`${API_BASE}/propriedades/${propriedadeSelecionadaId}/upload-${tipo}`, {
                method: 'POST',
                body: formData
             });
             const data = await res.json();
             if (data.error) {
                alert(`Erro ao fazer upload do ${tipo.toUpperCase()}: ${data.error}`);
             } else {
                alert(`Documento do ${tipo.toUpperCase()} enviado física e logicamente com sucesso no Windows Workspace!`);
                const propRes = await fetch(`${API_BASE}/propriedades`);
                todasPropriedades = await propRes.json();
                
                const pAtual = todasPropriedades.find(x => x.id === propriedadeSelecionadaId);
                configurarExibicaoArquivo(tipo, pAtual ? pAtual[`caminho_arquivo_${tipo}`] : null);
             }
          } catch (err) {
             alert("Erro de conexão com o servidor no upload.");
          } finally {
             dropzone.style.cursor = '';
             dropzone.classList.remove('animate-pulse');
          }
       };

       fileInput.addEventListener('change', (e: any) => {
          if (e.target.files && e.target.files.length > 0) {
             processarUpload(e.target.files[0]);
          }
          fileInput.value = '';
       });

       dropzone.addEventListener('dragover', (e) => {
          e.preventDefault();
          const hoverClass = tipo === 'car' ? 'border-mint-vibrant' : 'border-blue-500';
          dropzone.classList.add(hoverClass);
       });

       dropzone.addEventListener('dragleave', (e) => {
          e.preventDefault();
          const hoverClass = tipo === 'car' ? 'border-mint-vibrant' : 'border-blue-500';
          dropzone.classList.remove(hoverClass);
       });

       dropzone.addEventListener('drop', (e) => {
          e.preventDefault();
          const hoverClass = tipo === 'car' ? 'border-mint-vibrant' : 'border-blue-500';
          dropzone.classList.remove(hoverClass);
          if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
             processarUpload(e.dataTransfer.files[0]);
          }
       });
    };

    configurarDropzone('car');
    configurarDropzone('ccir');

    // --- INICIALIZADORES ---
    loadPropriedades();
    loadClientesList();
  }
};
