import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { initIcons } from '../utils';

export const clientesRoute: RouteDef = {
  render: () => `
    <div class="space-y-5 sm:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <!-- Cabeçalho Principal -->
      <div class="flex justify-between items-center h-10 sm:h-12 border-b border-white/5 pb-2 sm:pb-3">
        <div>
          <h2 class="text-lg sm:text-xl font-bold tracking-tight text-white leading-none">Clientes</h2>
          <p class="text-white/40 text-[10px] mt-1.5 hidden sm:block">Gestão cadastral, metadados extensíveis e logs de auditoria jurídica.</p>
        </div>
      </div>

      <!-- Mini Cards de Estatísticas Rápidas (KPIs Compactos) -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div class="glass-card h-14 sm:h-16 px-4 flex items-center gap-3">
          <div class="p-1.5 bg-mint-vibrant/10 rounded-technical shrink-0">
            <i data-lucide="users" class="w-4 h-4 text-mint-vibrant"></i>
          </div>
          <div class="min-w-0">
            <p class="text-white/40 text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold truncate">Total de Clientes</p>
            <h3 class="text-base sm:text-lg font-bold tracking-tight text-white leading-none mt-0.5" id="stat-total-clientes">0</h3>
          </div>
        </div>

        <div class="glass-card h-14 sm:h-16 px-4 flex items-center gap-3">
          <div class="p-1.5 bg-blue-500/10 rounded-technical shrink-0">
            <i data-lucide="user" class="w-4 h-4 text-blue-500"></i>
          </div>
          <div class="min-w-0">
            <p class="text-white/40 text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold truncate">Pessoas Físicas</p>
            <h3 class="text-base sm:text-lg font-bold tracking-tight text-white leading-none mt-0.5" id="stat-pf-clientes">0</h3>
          </div>
        </div>

        <div class="glass-card h-14 sm:h-16 px-4 flex items-center gap-3">
          <div class="p-1.5 bg-indigo-500/10 rounded-technical shrink-0">
            <i data-lucide="building-2" class="w-4 h-4 text-indigo-500"></i>
          </div>
          <div class="min-w-0">
            <p class="text-white/40 text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold truncate">Pessoas Jurídicas</p>
            <h3 class="text-base sm:text-lg font-bold tracking-tight text-white leading-none mt-0.5" id="stat-pj-clientes">0</h3>
          </div>
        </div>

        <div class="glass-card h-14 sm:h-16 px-4 flex items-center gap-3">
          <div class="p-1.5 bg-rose-500/10 rounded-technical shrink-0">
            <i data-lucide="alert-triangle" class="w-4 h-4 text-rose-500"></i>
          </div>
          <div class="min-w-0">
            <p class="text-white/40 text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold truncate">Pendências de Cônjuge</p>
            <h3 class="text-base sm:text-lg font-bold tracking-tight text-white leading-none mt-0.5" id="stat-incompletos-clientes">0</h3>
          </div>
        </div>
      </div>

      <!-- Tabela Principal de Clientes -->
      <div class="glass-card overflow-hidden border border-white/5 flex flex-col">
        <!-- Filtros / Busca e Ações -->
        <div class="p-4 border-b border-white/5 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white/[0.01]">
          <div class="flex items-center gap-2 flex-1 max-w-md">
            <div class="relative w-full">
              <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30"></i>
              <input type="text" placeholder="Buscar cliente por nome, CPF ou CNPJ..." class="glass-input pl-9 w-full text-xs h-8.5" id="busca-cliente" />
            </div>
          </div>
          <div class="flex gap-2 justify-end">
            <button class="btn-primary h-8.5 text-xs px-4" id="btn-abrir-modal-cliente">
               <i data-lucide="plus" class="w-4 h-4"></i>
               Novo Cliente
            </button>
          </div>
        </div>

        <!-- Tabela -->
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-white/5 text-[9px] sm:text-[10px] uppercase tracking-wider font-bold text-white/40 bg-white/[0.01]">
                <th class="py-3 px-4 w-10">
                  <input type="checkbox" id="check-all-clientes" class="rounded border-white/10 text-mint-vibrant bg-white/5 focus:ring-0 focus:ring-offset-0 cursor-pointer" />
                </th>
                <th class="py-3 px-4">Nome Completo</th>
                <th class="py-3 px-4">CPF / CNPJ</th>
                <th class="py-3 px-4 text-center">Propriedades</th>
                <th class="py-3 px-4 text-center">Projetos</th>
                <th class="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody id="tabela-clientes-body" class="divide-y divide-white/[0.02]">
              <!-- Linhas via JS -->
            </tbody>
          </table>
        </div>

        <!-- Status de Tabela Vazia / Carregando -->
        <div id="tabela-clientes-status" class="text-center py-12 text-white/30 text-sm hidden">
          Carregando clientes...
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
            <span id="paginacao-info">Mostrando 0-0 de 0 clientes</span>
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

    <!-- MODAL DE CADASTRO / EDIÇÃO ULTRA COMPACTO (Sem scroll desnecessário) -->
    <div id="modal-cliente" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
       <div class="glass-card w-full max-w-2xl max-h-[95vh] overflow-y-auto border border-mint-vibrant/10 shadow-2xl">
          <div class="p-4 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
             <h3 class="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <i data-lucide="user-plus" class="w-4.5 h-4.5 text-mint-vibrant"></i>
                <span id="modal-cliente-title">Cadastro de Cliente</span>
             </h3>
             <button class="text-white/40 hover:text-white transition-colors" id="btn-fechar-modal">
                <i data-lucide="x" class="w-4.5 h-4.5"></i>
             </button>
          </div>
          <form id="form-cliente" class="p-4 space-y-3.5">
             <!-- Seção: Identificação -->
             <div class="space-y-3">
                <div class="grid grid-cols-4 gap-3">
                   <div class="col-span-3">
                      <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Nome Completo</label>
                      <input type="text" name="nome_completo" required class="glass-input w-full text-xs h-8">
                   </div>
                   <div>
                      <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Gênero</label>
                      <select name="sexo" class="glass-input w-full text-xs h-8">
                         <option value="M">Masculino</option>
                         <option value="F">Feminino</option>
                      </select>
                   </div>
                </div>
                <div class="grid grid-cols-2 gap-3">
                   <div>
                      <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">CPF / CNPJ</label>
                      <input type="text" name="cpf_cnpj" required class="glass-input w-full text-xs h-8 font-mono">
                   </div>
                   <div>
                      <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">RG / IE</label>
                      <input type="text" name="rg_ie" class="glass-input w-full text-xs h-8 font-mono">
                   </div>
                </div>
                <div class="grid grid-cols-2 gap-3">
                   <div>
                      <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Estado Civil</label>
                      <select name="estado_civil" class="glass-input w-full text-xs h-8">
                         <option value="Solteiro(a)">Solteiro(a)</option>
                         <option value="Casado(a)">Casado(a)</option>
                         <option value="Divorciado(a)">Divorciado(a)</option>
                         <option value="Viúvo(a)">Viúvo(a)</option>
                         <option value="União Estável">União Estável</option>
                      </select>
                   </div>
                   <div>
                      <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Nacionalidade</label>
                      <input type="text" name="nacionalidade" class="glass-input w-full text-xs h-8" value="Brasileiro(a)">
                   </div>
                </div>
             </div>

             <!-- Seção: Cônjuge -->
             <div id="secao-conjuge" class="border-t border-white/5 pt-3.5 space-y-2.5">
                <h5 class="text-[9px] font-bold text-mint-vibrant uppercase tracking-wider leading-none">Dados do Cônjuge</h5>
                <div class="grid grid-cols-4 gap-3">
                   <div class="col-span-2">
                      <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Nome do Cônjuge</label>
                      <input type="text" name="nome_conjuge" class="glass-input w-full text-xs h-8">
                   </div>
                   <div>
                      <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">CPF Cônjuge</label>
                      <input type="text" name="cpf_conjuge" class="glass-input w-full text-xs h-8 font-mono">
                   </div>
                   <div>
                      <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">RG Cônjuge</label>
                      <input type="text" name="rg_conjuge" class="glass-input w-full text-xs h-8 font-mono">
                   </div>
                </div>
                <div class="grid grid-cols-2 gap-3">
                   <div>
                      <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Regime de Bens</label>
                      <select name="regime_bens" class="glass-input w-full text-xs h-8">
                         <option value="">Nenhum / Não aplicável</option>
                         <option value="Comunhão Parcial de Bens">Comunhão Parcial de Bens</option>
                         <option value="Comunhão Universal de Bens">Comunhão Universal de Bens</option>
                         <option value="Separação Total de Bens">Separação Total de Bens</option>
                         <option value="Participação Final nos Aquestos">Participação Final nos Aquestos</option>
                         <option value="Separação Obrigatória de Bens">Separação Obrigatória de Bens</option>
                      </select>
                   </div>
                </div>
             </div>

             <!-- Seção: Contato e Endereço -->
             <div class="border-t border-white/5 pt-3.5 space-y-2.5">
                <h5 class="text-[9px] font-bold text-mint-vibrant uppercase tracking-wider leading-none">Contato & Localização</h5>
                <div class="grid grid-cols-2 gap-3">
                   <div>
                      <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Telefone</label>
                      <input type="text" name="telefone" class="glass-input w-full text-xs h-8 font-mono" placeholder="(99) 99999-9999">
                   </div>
                   <div>
                      <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Email</label>
                      <input type="email" name="email" class="glass-input w-full text-xs h-8">
                   </div>
                </div>
                <div class="grid grid-cols-4 gap-3">
                   <div>
                      <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">CEP</label>
                      <input type="text" name="cep" class="glass-input w-full text-xs h-8 font-mono" placeholder="99999-999">
                   </div>
                   <div class="col-span-2">
                      <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Endereço (Rua, Av, Bairro)</label>
                      <input type="text" name="endereco_sem_numero" class="glass-input w-full text-xs h-8">
                   </div>
                   <div>
                      <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Número</label>
                      <input type="text" name="numero_endereco" class="glass-input w-full text-xs h-8">
                   </div>
                </div>
                <div class="grid grid-cols-2 gap-3">
                   <div>
                      <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Cidade</label>
                      <input type="text" name="cidade" list="cidades-list" class="glass-input w-full text-xs h-8" placeholder="Digite para buscar...">
                      <datalist id="cidades-list">
                         <!-- Carregado dinamicamente -->
                      </datalist>
                   </div>
                   <div>
                      <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Estado (UF)</label>
                      <select name="estado" class="glass-input w-full text-xs h-8">
                         <option value="AC">AC</option>
                         <option value="AL">AL</option>
                         <option value="AM">AM</option>
                         <option value="AP">AP</option>
                         <option value="BA">BA</option>
                         <option value="CE">CE</option>
                         <option value="DF">DF</option>
                         <option value="ES">ES</option>
                         <option value="GO">GO</option>
                         <option value="MA">MA</option>
                         <option value="MG">MG</option>
                         <option value="MS">MS</option>
                         <option value="MT">MT</option>
                         <option value="PA">PA</option>
                         <option value="PB">PB</option>
                         <option value="PE">PE</option>
                         <option value="PI">PI</option>
                         <option value="PR" selected>PR</option>
                         <option value="RJ">RJ</option>
                         <option value="RN">RN</option>
                         <option value="RO">RO</option>
                         <option value="RR">RR</option>
                         <option value="RS">RS</option>
                         <option value="SC">SC</option>
                         <option value="SE">SE</option>
                         <option value="SP">SP</option>
                         <option value="TO">TO</option>
                      </select>
                   </div>
                </div>
             </div>

             <div class="flex justify-end gap-2 pt-4 border-t border-white/5">
                <button type="button" class="btn-secondary h-8 text-xs py-0 px-4" id="btn-cancelar-cliente">Cancelar</button>
                <button type="submit" class="btn-primary h-8 text-xs py-0 px-4">Salvar Cliente</button>
             </div>
          </form>
       </div>
    </div>

    <!-- MODAL DE DETALHES COMPLETO (Dados, Metadados reativos e Logs) -->
    <div id="modal-detalhes-cliente" class="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
       <div class="glass-card w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-mint-vibrant/20 shadow-2xl">
          <div class="p-4.5 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
             <div class="flex items-center gap-3 min-w-0">
                <div class="w-8.5 h-8.5 rounded-full bg-mint-vibrant/10 flex items-center justify-center text-xs font-bold text-mint-vibrant shrink-0" id="det-cli-avatar">
                   ??
                </div>
                <div class="min-w-0">
                   <h3 class="text-sm font-bold text-white truncate" id="det-cli-titulo">Nome do Cliente</h3>
                   <p class="text-[9px] text-white/40 font-mono leading-none mt-1" id="det-cli-subtitulo">CPF: 000.000.000-00</p>
                </div>
             </div>
             <div class="flex items-center gap-1.5 shrink-0">
                <button class="text-white/40 hover:text-mint-vibrant transition-colors p-2 rounded hover:bg-white/5 cursor-pointer" id="btn-det-editar" title="Editar Cliente">
                    <i data-lucide="edit" class="w-4 h-4"></i>
                </button>
                <button class="text-white/40 hover:text-red-400 transition-colors p-2 rounded hover:bg-white/5 cursor-pointer" id="btn-det-excluir" title="Excluir Cliente">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
                <button class="text-white/40 hover:text-white transition-colors p-2 rounded hover:bg-white/5 cursor-pointer" id="btn-fechar-detalhes">
                   <i data-lucide="x" class="w-4.5 h-4.5"></i>
                </button>
             </div>
          </div>
          
          <div class="flex border-b border-white/5 bg-white/[0.01] overflow-x-auto scrollbar-none">
             <button class="px-4 py-2 text-xs font-bold border-b-2 border-mint-vibrant text-mint-vibrant tab-btn-det whitespace-nowrap" data-tab-det="tab-det-dados">Dados Cadastrais</button>
             <button class="px-4 py-2 text-xs font-bold border-b-2 border-transparent text-white/40 hover:text-white transition-colors tab-btn-det whitespace-nowrap" data-tab-det="tab-det-meta">Metadados</button>
             <button class="px-4 py-2 text-xs font-bold border-b-2 border-transparent text-white/40 hover:text-white transition-colors tab-btn-det whitespace-nowrap" data-tab-det="tab-det-historico">Histórico de Alterações</button>
          </div>
          
          <div class="p-4.5 space-y-4">
             <!-- ABA DADOS CADASTRAIS -->
             <div id="tab-det-dados" class="tab-content-det space-y-3.5">
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 bg-white/[0.01] p-3 border border-white/5 rounded-technical">
                   <div>
                      <p class="text-[9px] text-white/40 uppercase tracking-widest font-bold">Gênero</p>
                      <p class="text-xs text-white/80 font-medium mt-0.5" id="det-cli-sexo">-</p>
                   </div>
                   <div>
                      <p class="text-[9px] text-white/40 uppercase tracking-widest font-bold">RG / IE</p>
                      <p class="text-xs text-white/80 font-mono mt-0.5" id="det-cli-rg">-</p>
                   </div>
                   <div>
                      <p class="text-[9px] text-white/40 uppercase tracking-widest font-bold">Estado Civil</p>
                      <p class="text-xs text-white/80 mt-0.5" id="det-cli-estcivil">-</p>
                   </div>
                   <div>
                      <p class="text-[9px] text-white/40 uppercase tracking-widest font-bold">Nacionalidade</p>
                      <p class="text-xs text-white/80 mt-0.5" id="det-cli-nacionalidade">-</p>
                   </div>
                </div>
                
                <div id="det-conjuge-bloco" class="space-y-2 bg-white/[0.01] p-3 border border-white/5 rounded-technical">
                   <h6 class="text-[9px] text-mint-vibrant uppercase tracking-wider font-bold leading-none">Informações do Cônjuge</h6>
                   <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                         <p class="text-[9px] text-white/40 uppercase tracking-widest font-bold">Cônjuge</p>
                         <p class="text-xs text-white/80 font-medium mt-0.5" id="det-cli-nomeconjuge">-</p>
                      </div>
                      <div>
                         <p class="text-[9px] text-white/40 uppercase tracking-widest font-bold">CPF Cônjuge</p>
                         <p class="text-xs text-white/80 font-mono mt-0.5" id="det-cli-cpfconjuge">-</p>
                      </div>
                      <div>
                         <p class="text-[9px] text-white/40 uppercase tracking-widest font-bold">RG Cônjuge</p>
                         <p class="text-xs text-white/80 font-mono mt-0.5" id="det-cli-rgconjuge">-</p>
                      </div>
                      <div class="sm:col-span-3 border-t border-white/5 pt-2 mt-1">
                         <p class="text-[9px] text-white/40 uppercase tracking-widest font-bold">Regime de Bens</p>
                         <p class="text-xs text-white/80 mt-0.5" id="det-cli-regimebens">-</p>
                      </div>
                   </div>
                </div>
                
                <div class="grid grid-cols-2 gap-3 bg-white/[0.01] p-3 border border-white/5 rounded-technical">
                   <div>
                      <p class="text-[9px] text-white/40 uppercase tracking-widest font-bold">Telefone</p>
                      <p class="text-xs text-white/80 font-mono mt-0.5" id="det-cli-telefone">-</p>
                   </div>
                   <div>
                      <p class="text-[9px] text-white/40 uppercase tracking-widest font-bold">E-mail</p>
                      <p class="text-xs text-white/80 mt-0.5" id="det-cli-email">-</p>
                   </div>
                   <div class="col-span-2 border-t border-white/5 pt-2 mt-1">
                      <p class="text-[9px] text-white/40 uppercase tracking-widest font-bold">Endereço Completo</p>
                      <p class="text-xs text-white/80 mt-0.5" id="det-cli-endereco">-</p>
                   </div>
                </div>
                
                <div class="grid grid-cols-2 gap-3">
                   <div class="glass-card p-3.5 flex items-center justify-between">
                      <div>
                         <p class="text-[9px] text-white/40 uppercase tracking-widest font-bold">Projetos/Levantamentos</p>
                         <h4 class="text-lg font-mono mt-0.5 text-white" id="det-cli-total-levs">0</h4>
                      </div>
                      <div class="w-7 h-7 bg-mint-vibrant/10 rounded-full flex items-center justify-center">
                         <i data-lucide="map-pin" class="w-4 h-4 text-mint-vibrant"></i>
                      </div>
                   </div>
                   <div class="glass-card p-3.5 flex items-center justify-between">
                      <div>
                         <p class="text-[9px] text-white/40 uppercase tracking-widest font-bold">Propriedades</p>
                         <h4 class="text-lg font-mono mt-0.5 text-white" id="det-cli-total-props">0</h4>
                      </div>
                      <div class="w-7 h-7 bg-blue-500/10 rounded-full flex items-center justify-center">
                         <i data-lucide="home" class="w-4 h-4 text-blue-500"></i>
                      </div>
                   </div>
                </div>

                <!-- Bloco de Propriedades Vinculadas -->
                <div class="bg-white/[0.01] p-3.5 border border-white/5 rounded-technical space-y-2" id="det-cli-bloco-propriedades">
                   <h6 class="text-[9px] text-mint-vibrant uppercase tracking-wider font-bold leading-none">Propriedades Vinculadas</h6>
                   <div class="divide-y divide-white/5 space-y-1.5 max-h-40 overflow-y-auto pr-1" id="det-cli-lista-propriedades">
                      <!-- Inserido dinamicamente via JS -->
                   </div>
                </div>
             </div>
             
             <!-- ABA METADADOS -->
             <div id="tab-det-meta" class="tab-content-det hidden space-y-3">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                   <h6 class="text-[10px] font-bold text-mint-vibrant uppercase tracking-wider">Campos Adicionais</h6>
                   <form id="form-add-meta" class="flex gap-1.5 items-center w-full sm:w-auto">
                      <input type="text" id="meta-key" placeholder="Chave" required class="glass-input h-7.5 text-xs px-2 py-0 w-24">
                      <input type="text" id="meta-val" placeholder="Valor" required class="glass-input h-7.5 text-xs px-2 py-0 w-28 sm:w-36">
                      <button type="submit" class="bg-mint-vibrant hover:brightness-110 text-forest-deep px-3 h-7.5 rounded text-xs font-bold transition-all flex items-center justify-center shrink-0 cursor-pointer">
                         Adicionar
                      </button>
                   </form>
                </div>
                <div class="bg-white/5 rounded-technical border border-white/5 overflow-hidden">
                   <table class="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr class="bg-white/[0.02] border-b border-white/5 text-[9px] uppercase tracking-wider font-bold text-white/40">
                           <th class="py-2 px-3">Chave</th>
                           <th class="py-2 px-3">Valor</th>
                           <th class="py-2 px-3 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody id="det-cli-metadados" class="divide-y divide-white/5">
                         <!-- Metadados via JS -->
                      </tbody>
                   </table>
                </div>
             </div>
             
             <!-- ABA HISTORICO -->
             <div id="tab-det-historico" class="tab-content-det hidden space-y-2">
                <h6 class="text-[10px] font-bold text-mint-vibrant uppercase tracking-wider mb-2">Logs de Alterações Cadastrais</h6>
                <div class="bg-white/5 rounded-technical border border-white/5 overflow-hidden max-h-[260px] overflow-y-auto pr-1">
                   <table class="w-full text-left text-[11px] border-collapse">
                      <thead>
                         <tr class="bg-white/[0.02] border-b border-white/5 text-[8.5px] uppercase tracking-wider font-bold text-white/40 sticky top-0 z-10">
                            <th class="py-2 px-3 bg-[#0d1611]">Campo</th>
                            <th class="py-2 px-3 bg-[#0d1611]">Antigo</th>
                            <th class="py-2 px-3 bg-[#0d1611]">Novo</th>
                            <th class="py-2 px-3 text-right bg-[#0d1611]">Data/Hora</th>
                         </tr>
                      </thead>
                      <tbody id="det-cli-logs" class="divide-y divide-white/5">
                         <!-- Logs via JS -->
                      </tbody>
                   </table>
                </div>
             </div>
          </div>
       </div>
    </div>
  `,
  setup: () => {
     let clienteSelecionadoId: number | null = null;
     let todosClientes: any[] = [];
     let termoBusca = "";
     let paginaAtual = 1;
     let limitePorPagina = 10;
     const clientesSelecionados = new Set<number>();
     
     // Utilitário de máscara CPF/CNPJ
     const aplicarMascaraCpfCnpj = (value: string): string => {
        const apenasNumeros = value.replace(/\D/g, '');
        if (apenasNumeros.length <= 11) {
           return apenasNumeros
              .replace(/(\d{3})(\d)/, '$1.$2')
              .replace(/(\d{3})(\d)/, '$1.$2')
              .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
        } else {
           return apenasNumeros
              .replace(/(\d{2})(\d)/, '$1.$2')
              .replace(/(\d{3})(\d)/, '$1.$2')
              .replace(/(\d{3})(\d)/, '$1/$2')
              .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
        }
     };

     // Utilitário de máscara de telefone
     const aplicarMascaraTelefone = (value: string): string => {
        const apenasNumeros = value.replace(/\D/g, '');
        if (apenasNumeros.length <= 10) {
           return apenasNumeros
              .replace(/(\d{2})(\d)/, '($1) $2')
              .replace(/(\d{4})(\d{1,4})$/, '$1-$2');
        } else {
           return apenasNumeros
              .replace(/(\d{2})(\d)/, '($1) $2')
              .replace(/(\d{5})(\d{1,4})$/, '$1-$2');
        }
     };

     // Utilitário de máscara de CEP
     const aplicarMascaraCep = (value: string): string => {
        return value.replace(/\D/g, '').replace(/(\d{5})(\d{1,3})$/, '$1-$2');
     };

     // Formulário e campos
     const form = document.getElementById('form-cliente') as HTMLFormElement;
     const inputCpfCnpj = form?.querySelector('[name="cpf_cnpj"]') as HTMLInputElement;
     const inputCpfConjuge = form?.querySelector('[name="cpf_conjuge"]') as HTMLInputElement;
     const inputTelefone = form?.querySelector('[name="telefone"]') as HTMLInputElement;
     const inputCep = form?.querySelector('[name="cep"]') as HTMLInputElement;
     const selectEstado = form?.querySelector('[name="estado"]') as HTMLSelectElement;

     // Aplicando máscaras em tempo real
     inputCpfCnpj?.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        target.value = aplicarMascaraCpfCnpj(target.value);
     });

     inputCpfConjuge?.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        target.value = aplicarMascaraCpfCnpj(target.value);
     });

     inputTelefone?.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        target.value = aplicarMascaraTelefone(target.value);
     });

     // Busca dinâmica de cidades na API do IBGE
     const carregarCidadesPorEstado = async (uf: string) => {
        const datalist = document.getElementById('cidades-list');
        if (!datalist) return;
        datalist.innerHTML = '<option value="Carregando cidades...">';
        
        try {
           const res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`);
           const cidades = await res.json();
           if (Array.isArray(cidades)) {
              datalist.innerHTML = cidades.map((c: any) => `<option value="${c.nome}">`).join('');
           } else {
              datalist.innerHTML = '';
           }
        } catch (err) {
           console.warn("Erro ao buscar cidades do IBGE:", err);
           datalist.innerHTML = '';
        }
     };

     selectEstado?.addEventListener('change', (e) => {
        const uf = (e.target as HTMLSelectElement).value;
        carregarCidadesPorEstado(uf);
     });

     // Busca CEP inteligente via API ViaCEP
     const buscarCep = async (cep: string) => {
        try {
           const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
           const data = await res.json();
           if (data && !data.erro) {
              const inputLogradouro = form.querySelector('[name="endereco_sem_numero"]') as HTMLInputElement;
              const inputCidade = form.querySelector('[name="cidade"]') as HTMLInputElement;
              const inputNumero = form.querySelector('[name="numero_endereco"]') as HTMLInputElement;

              if (inputLogradouro) {
                 const logradouro = data.logradouro || '';
                 const bairro = data.bairro ? ` - ${data.bairro}` : '';
                 inputLogradouro.value = `${logradouro}${bairro}`;
              }

              if (selectEstado) {
                 selectEstado.value = data.uf || 'PR';
                 await carregarCidadesPorEstado(data.uf);
              }

              if (inputCidade) {
                 inputCidade.value = data.localidade || '';
              }

              if (inputNumero) {
                 inputNumero.focus();
              }
           }
        } catch (err) {
           console.warn("Erro ao buscar CEP:", err);
        }
     };

     inputCep?.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        target.value = aplicarMascaraCep(target.value);
        
        const cepLimpo = target.value.replace(/\D/g, '');
        if (cepLimpo.length === 8) {
           buscarCep(cepLimpo);
        }
     });
     
     // Modais
     const modalCadastro = document.getElementById('modal-cliente');
     const modalDetalhes = document.getElementById('modal-detalhes-cliente');
     
     const selectEstadoCivil = form?.querySelector('[name="estado_civil"]') as HTMLSelectElement;
     const secaoConjuge = document.getElementById('secao-conjuge');

     const toggleConjuge = () => {
        if (!selectEstadoCivil || !secaoConjuge) return;
        const val = selectEstadoCivil.value;
        const isCasado = val.includes("Casado") || val.includes("União Estável");
        if (isCasado) {
           secaoConjuge.classList.remove('hidden');
        } else {
           secaoConjuge.classList.add('hidden');
           const nomeConj = form.querySelector('[name="nome_conjuge"]') as HTMLInputElement;
           const cpfConj = form.querySelector('[name="cpf_conjuge"]') as HTMLInputElement;
           const rgConj = form.querySelector('[name="rg_conjuge"]') as HTMLInputElement;
           const regimeBens = form.querySelector('[name="regime_bens"]') as HTMLSelectElement;
           if (nomeConj) nomeConj.value = '';
           if (cpfConj) cpfConj.value = '';
           if (rgConj) rgConj.value = '';
           if (regimeBens) regimeBens.value = '';
        }
     };

     selectEstadoCivil?.addEventListener('change', toggleConjuge);

     // Abrir modal Novo Cliente
     document.getElementById('btn-abrir-modal-cliente')?.addEventListener('click', () => {
         clienteSelecionadoId = null;
         if(form) {
            form.reset();
            // Preenche PR e carrega cidades do PR por padrão
            if (selectEstado) selectEstado.value = 'PR';
            carregarCidadesPorEstado('PR');
            toggleConjuge();
         }
         const title = document.getElementById('modal-cliente-title');
         if(title) title.textContent = 'Cadastro de Cliente';
         modalCadastro?.classList.remove('hidden');
     });
     
     document.getElementById('btn-fechar-modal')?.addEventListener('click', () => modalCadastro?.classList.add('hidden'));
     document.getElementById('btn-cancelar-cliente')?.addEventListener('click', () => modalCadastro?.classList.add('hidden'));
     document.getElementById('btn-fechar-detalhes')?.addEventListener('click', () => modalDetalhes?.classList.add('hidden'));

     // Abas do Modal de Detalhes
     document.querySelectorAll('.tab-btn-det').forEach(btn => {
        btn.addEventListener('click', (e) => {
           const targetTab = (e.target as HTMLElement).getAttribute('data-tab-det');
           document.querySelectorAll('.tab-btn-det').forEach(b => b.classList.replace('border-mint-vibrant', 'border-transparent'));
           document.querySelectorAll('.tab-btn-det').forEach(b => b.classList.replace('text-mint-vibrant', 'text-white/40'));
           (e.target as HTMLElement).classList.replace('border-transparent', 'border-mint-vibrant');
           (e.target as HTMLElement).classList.replace('text-white/40', 'text-mint-vibrant');
           document.querySelectorAll('.tab-content-det').forEach(tc => tc.classList.add('hidden'));
           document.getElementById(targetTab || '')?.classList.remove('hidden');
        });
     });

     // Controle das seleções em lote e exibição da barra inferior
     const updateBatchActionBar = () => {
        const bar = document.getElementById('batch-action-bar');
        const countSpan = document.getElementById('batch-selected-count');
        const checkAll = document.getElementById('check-all-clientes') as HTMLInputElement;
        
        if (clientesSelecionados.size > 0) {
           if (countSpan) countSpan.innerText = clientesSelecionados.size.toString();
           bar?.classList.remove('hidden');
        } else {
           bar?.classList.add('hidden');
        }

        // Atualiza checkbox master
        const totalVisiveis = getClientesPaginaAtual().length;
        const totalSelecionadosVisiveis = getClientesPaginaAtual().filter(c => clientesSelecionados.has(c.id)).length;
        if (checkAll) {
           checkAll.checked = totalVisiveis > 0 && totalSelecionadosVisiveis === totalVisiveis;
           checkAll.indeterminate = totalSelecionadosVisiveis > 0 && totalSelecionadosVisiveis < totalVisiveis;
        }
     };

     // Cancelar seleção em lote
     document.getElementById('btn-batch-cancel')?.addEventListener('click', () => {
        clientesSelecionados.clear();
        updateBatchActionBar();
        renderTabela();
     });

     // Excluir em lote
     document.getElementById('btn-batch-delete')?.addEventListener('click', async () => {
        const count = clientesSelecionados.size;
        if (!confirm(`Deseja realmente excluir os ${count} clientes selecionados?`)) return;
        
        const bar = document.getElementById('batch-action-bar');
        if (bar) bar.style.cursor = 'wait';

        try {
           const promises = Array.from(clientesSelecionados).map(id =>
              fetch(`${API_BASE}/clientes/${id}`, { method: 'DELETE' }).then(res => res.json())
           );
           const results = await Promise.all(promises);
           
           const errors = results.filter(r => r.error);
           if (errors.length > 0) {
              alert(`Algumas exclusões falharam: ${errors.map(e => e.error).join(', ')}`);
           }
           
           clientesSelecionados.clear();
           updateBatchActionBar();
           loadClientes();
        } catch (e) {
           alert("Erro ao excluir clientes selecionados.");
        } finally {
           if (bar) bar.style.cursor = '';
        }
     });

     // Filtro de busca na tabela
     document.getElementById('busca-cliente')?.addEventListener('input', (e) => {
        termoBusca = (e.target as HTMLInputElement).value.toLowerCase();
        paginaAtual = 1;
        renderTabela();
     });

     // Limite por página
     document.getElementById('paginacao-limite')?.addEventListener('change', (e) => {
        limitePorPagina = parseInt((e.target as HTMLSelectElement).value);
        paginaAtual = 1;
        renderTabela();
     });

     const getClientesFiltrados = () => {
        if (!termoBusca) return todosClientes;
        return todosClientes.filter(c => 
           (c.nome_completo || '').toLowerCase().includes(termoBusca) ||
           (c.cpf_cnpj || '').replace(/\D/g, '').includes(termoBusca.replace(/\D/g, ''))
        );
     };

     const getClientesPaginaAtual = () => {
        const filtrados = getClientesFiltrados();
        const inicio = (paginaAtual - 1) * limitePorPagina;
        return filtrados.slice(inicio, inicio + limitePorPagina);
     };

     // Renderização Principal da Tabela
     const renderTabela = () => {
        const body = document.getElementById('tabela-clientes-body');
        const statusDiv = document.getElementById('tabela-clientes-status');
        const info = document.getElementById('paginacao-info');
        const botoes = document.getElementById('paginacao-botoes');
        
        if (!body) return;

        const filtrados = getClientesFiltrados();
        const total = filtrados.length;
        const totalPaginas = Math.ceil(total / limitePorPagina);
        
        if (paginaAtual > totalPaginas) {
           paginaAtual = Math.max(1, totalPaginas);
        }

        const visiveis = getClientesPaginaAtual();

        if (total === 0) {
           body.innerHTML = '';
           statusDiv?.classList.remove('hidden');
           if (statusDiv) statusDiv.innerText = todosClientes.length === 0 ? "Nenhum cliente cadastrado no sistema." : "Nenhum resultado encontrado para a busca.";
           if (info) info.innerText = "Mostrando 0-0 de 0 clientes";
           if (botoes) botoes.innerHTML = '';
           return;
        }

        statusDiv?.classList.add('hidden');

        // Monta as linhas da tabela
        body.innerHTML = visiveis.map(cli => {
           const isSel = clientesSelecionados.has(cli.id);
           const rowClass = isSel ? 'bg-mint-vibrant/5 border-l-2 border-l-mint-vibrant' : 'hover:bg-white/[0.01]';

           return `
              <tr class="border-b border-white/5 transition-all text-xs ${rowClass}" data-id="${cli.id}">
                 <td class="py-2.5 px-4">
                    <input type="checkbox" data-id="${cli.id}" class="check-cliente rounded border-white/10 text-mint-vibrant bg-white/5 focus:ring-0 focus:ring-offset-0 cursor-pointer" ${isSel ? 'checked' : ''} />
                 </td>
                 <td class="py-2.5 px-4 font-medium text-white flex items-center gap-2.5 cursor-pointer hover:text-mint-vibrant truncate w-72" onclick="window.abrirDetalhesCliente(${cli.id})">
                    <div class="w-7 h-7 rounded-full bg-mint-vibrant/10 flex items-center justify-center text-[10px] font-bold text-mint-vibrant shrink-0">
                       ${(cli.nome_completo || '??').substring(0,2).toUpperCase()}
                    </div>
                    <span class="truncate font-semibold">${cli.nome_completo}</span>
                 </td>
                 <td class="py-2.5 px-4 font-mono text-white/75">${aplicarMascaraCpfCnpj(cli.cpf_cnpj || '')}</td>
                 <td class="py-2.5 px-4 text-center font-mono font-medium">${cli.total_propriedades || 0}</td>
                 <td class="py-2.5 px-4 text-center font-mono font-medium">${cli.total_levantamentos || 0}</td>
                 <td class="py-2.5 px-4 text-right">
                    <div class="flex items-center justify-end gap-1">
                       <button class="p-1.5 text-white/40 hover:text-mint-vibrant rounded hover:bg-white/5 transition-colors cursor-pointer" onclick="window.abrirDetalhesCliente(${cli.id})" title="Ver Detalhes">
                          <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                       </button>
                       <button class="p-1.5 text-white/40 hover:text-mint-vibrant rounded hover:bg-white/5 transition-colors cursor-pointer" onclick="window.abrirEdicaoCliente(${cli.id})" title="Editar">
                          <i data-lucide="edit" class="w-3.5 h-3.5"></i>
                       </button>
                       <button class="p-1.5 text-white/40 hover:text-red-400 rounded hover:bg-white/5 transition-colors cursor-pointer" onclick="window.excluirClienteIndividual(${cli.id})" title="Excluir">
                          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                       </button>
                    </div>
                 </td>
              </tr>
           `;
        }).join('');

        // Paginação Info
        const inicioItem = (paginaAtual - 1) * limitePorPagina + 1;
        const fimItem = Math.min(paginaAtual * limitePorPagina, total);
        if (info) info.innerText = `Mostrando ${inicioItem}-${fimItem} de ${total} clientes`;

        // Botões de Paginação
        let pagButtonsHtml = '';
        if (totalPaginas > 1) {
           pagButtonsHtml += `
              <button class="h-7 px-2.5 rounded border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-all font-bold flex items-center justify-center cursor-pointer" ${paginaAtual === 1 ? 'disabled' : ''} onclick="window.mudarPaginaClientes(${paginaAtual - 1})">
                 Anterior
              </button>
           `;
           
           for (let p = 1; p <= totalPaginas; p++) {
              if (p === 1 || p === totalPaginas || (p >= paginaAtual - 1 && p <= paginaAtual + 1)) {
                 const activeClass = p === paginaAtual ? 'bg-mint-vibrant text-forest-deep border-transparent font-bold' : 'border-white/10 hover:bg-white/5 text-white/70';
                 pagButtonsHtml += `
                    <button class="w-7 h-7 rounded border text-xs font-mono transition-all flex items-center justify-center cursor-pointer ${activeClass}" onclick="window.mudarPaginaClientes(${p})">
                       ${p}
                    </button>
                 `;
              } else if (p === paginaAtual - 2 || p === paginaAtual + 2) {
                 pagButtonsHtml += `<span class="px-1 text-white/20 select-none">...</span>`;
              }
           }

           pagButtonsHtml += `
              <button class="h-7 px-2.5 rounded border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-all font-bold flex items-center justify-center cursor-pointer" ${paginaAtual === totalPaginas ? 'disabled' : ''} onclick="window.mudarPaginaClientes(${paginaAtual + 1})">
                 Próxima
              </button>
           `;
        }
        if (botoes) botoes.innerHTML = pagButtonsHtml;

        initIcons();

        // Listeners Checkboxes Individuais
        body.querySelectorAll('.check-cliente').forEach(cb => {
           cb.addEventListener('change', (e) => {
              const check = e.target as HTMLInputElement;
              const id = parseInt(check.getAttribute('data-id') || '0');
              if (check.checked) {
                 clientesSelecionados.add(id);
              } else {
                 clientesSelecionados.delete(id);
              }
              updateBatchActionBar();
              renderTabela();
           });
        });

        updateBatchActionBar();
     };

     // Ações de paginação globais
     (window as any).mudarPaginaClientes = (novaPagina: number) => {
        paginaAtual = novaPagina;
        renderTabela();
     };

     // Checkbox Master
     document.getElementById('check-all-clientes')?.addEventListener('change', (e) => {
        const check = e.target as HTMLInputElement;
        const visiveis = getClientesPaginaAtual();
        if (check.checked) {
           visiveis.forEach(c => clientesSelecionados.add(c.id));
        } else {
           visiveis.forEach(c => clientesSelecionados.delete(c.id));
        }
        updateBatchActionBar();
        renderTabela();
     });

     // Redirecionamento e foco em propriedade
     (window as any).irParaPropriedade = (propId: number) => {
        modalDetalhes?.classList.add('hidden');
        localStorage.setItem('gerencigeo_foco_propriedade_id', propId.toString());
        window.location.hash = '#propriedades';
     };

     // Abertura do Modal de Detalhes Completo
     (window as any).abrirDetalhesCliente = async (id: number) => {
        const cli = todosClientes.find(c => c.id === id);
        if (!cli) return;

        clienteSelecionadoId = id;

        const avatar = document.getElementById('det-cli-avatar');
        const titulo = document.getElementById('det-cli-titulo');
        const subtitulo = document.getElementById('det-cli-subtitulo');
        
        if (avatar) avatar.innerText = (cli.nome_completo || '??').substring(0, 2).toUpperCase();
        if (titulo) titulo.innerText = cli.nome_completo;
        if (subtitulo) subtitulo.innerText = `CPF/CNPJ: ${aplicarMascaraCpfCnpj(cli.cpf_cnpj || '')}`;

        const setDetVal = (id: string, val: any) => {
           const el = document.getElementById(id);
           if (el) el.innerText = val || '-';
        };

        setDetVal('det-cli-sexo', cli.sexo === 'M' ? 'Masculino' : cli.sexo === 'F' ? 'Feminino' : '-');
        setDetVal('det-cli-rg', cli.rg_ie);
        setDetVal('det-cli-estcivil', cli.estado_civil);
        setDetVal('det-cli-nacionalidade', cli.nacionalidade);
        setDetVal('det-cli-telefone', cli.telefone ? aplicarMascaraTelefone(cli.telefone) : '-');
        setDetVal('det-cli-email', cli.email);
        setDetVal('det-cli-endereco', `${cli.endereco_completo || ''} ${cli.cep ? ' · CEP: ' + aplicarMascaraCep(cli.cep) : ''} - ${cli.cidade || ''}/${cli.estado || ''}`);
        setDetVal('det-cli-total-levs', cli.total_levantamentos || 0);
        setDetVal('det-cli-total-props', cli.total_propriedades || 0);

        // Preenche lista de propriedades vinculadas no modal de detalhes
        const listaPropsContainer = document.getElementById('det-cli-lista-propriedades');
        if (listaPropsContainer) {
           const props = cli.propriedades || [];
           if (props.length === 0) {
              listaPropsContainer.innerHTML = `<p class="text-[11px] text-white/30 italic py-1">Nenhuma propriedade vinculada a este cliente.</p>`;
           } else {
              listaPropsContainer.innerHTML = props.map((p: any) => `
                 <div class="flex items-center justify-between py-1.5 text-xs">
                    <div class="min-w-0 flex-1 pr-2">
                       <span class="font-bold text-white truncate block text-[11px]" title="${p.nome_propriedade}">${p.nome_propriedade}</span>
                       <span class="text-[9px] text-white/40 block mt-0.5">Participação: <strong class="text-mint-vibrant font-mono">${(p.percentual_participacao || 0).toFixed(2)}%</strong></span>
                    </div>
                    <button onclick="window.irParaPropriedade(${p.id})" class="text-mint-vibrant hover:text-white transition-colors flex items-center gap-1 hover:underline text-[10px] font-bold shrink-0 cursor-pointer">
                       Ver Propriedade
                       <i data-lucide="external-link" class="w-3 h-3"></i>
                    </button>
                 </div>
              `).join('');
              initIcons();
           }
        }

        // Bloco Cônjuge
        const blocoConjuge = document.getElementById('det-conjuge-bloco');
        const isCasado = (cli.estado_civil || '').includes("Casado") || (cli.estado_civil || '').includes("União Estável");
        if (blocoConjuge) {
           if (isCasado) {
              blocoConjuge.classList.remove('hidden');
              setDetVal('det-cli-nomeconjuge', cli.nome_conjuge);
              setDetVal('det-cli-cpfconjuge', aplicarMascaraCpfCnpj(cli.cpf_conjuge || ''));
              setDetVal('det-cli-rgconjuge', cli.rg_conjuge);
              setDetVal('det-cli-regimebens', cli.regime_bens);
           } else {
              blocoConjuge.classList.add('hidden');
           }
        }

        renderMetadadosDetalhes(cli.metadados || {});

        const activeTabBtn = document.querySelector('.tab-btn-det[data-tab-det="tab-det-dados"]') as HTMLElement;
        if (activeTabBtn) activeTabBtn.click();

        const logsContainer = document.getElementById('det-cli-logs');
        if (logsContainer) logsContainer.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-white/30">Carregando logs...</td></tr>';
        
        try {
           const res = await fetch(`${API_BASE}/clientes/${id}/historico`);
           const logs = await res.json();
           if (logsContainer) {
              if (Array.isArray(logs) && logs.length > 0) {
                 logsContainer.innerHTML = logs.map(log => {
                    const dataFormatada = new Date(log.data_alteracao).toLocaleString('pt-BR');
                    return `
                       <tr class="hover:bg-white/[0.01]">
                          <td class="py-2 px-3 font-medium text-white/80">${log.campo_alterado}</td>
                          <td class="py-2 px-3 text-red-400 font-mono truncate max-w-[120px]" title="${log.valor_antigo || ''}">${log.valor_antigo || '-'}</td>
                          <td class="py-2 px-3 text-mint-vibrant font-mono truncate max-w-[120px]" title="${log.valor_novo || ''}">${log.valor_novo || '-'}</td>
                          <td class="py-2 px-3 text-right text-white/40 font-mono">${dataFormatada}</td>
                       </tr>
                    `;
                 }).join('');
              } else {
                 logsContainer.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-white/20">Nenhum log de alteração gravado.</td></tr>';
              }
           }
        } catch (e) {
           if (logsContainer) logsContainer.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-red-400">Falha ao obter histórico.</td></tr>';
        }

        modalDetalhes?.classList.remove('hidden');
     };

     // Render Metadados na Aba correspondente
     const renderMetadadosDetalhes = (metadadosObj: Record<string, string>) => {
        const metasContainer = document.getElementById('det-cli-metadados');
        if (!metasContainer) return;
        
        const entries = Object.entries(metadadosObj);
        metasContainer.innerHTML = entries.length ? entries.map(([k, v]) => `
           <tr class="hover:bg-white/[0.01]">
              <td class="py-2 px-3 font-semibold text-white/90 font-mono">${k}</td>
              <td class="py-2 px-3 text-white/60 font-mono">${v}</td>
              <td class="py-2 px-3 text-right">
                 <button onclick="window.excluirMetadadoDetalhe('${k}')" class="text-white/45 hover:text-red-400 p-1 rounded hover:bg-white/5 transition-colors cursor-pointer" title="Remover Campo">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                 </button>
              </td>
           </tr>
        `).join('') : '<tr><td colspan="3" class="text-white/30 text-center py-4">Nenhum metadado customizado cadastrado.</td></tr>';
        initIcons();
     };

     // Excluir Metadado Reativo no Modal de Detalhes
     (window as any).excluirMetadadoDetalhe = async (key: string) => {
        if (!clienteSelecionadoId) return;
        const cli = todosClientes.find(c => c.id === clienteSelecionadoId);
        if (!cli) return;

        if (!confirm(`Remover metadado "${key}" do cliente?`)) return;

        const metadadosCopy = { ...(cli.metadados || {}) };
        delete metadadosCopy[key];

        const payload = {
           nome_completo: cli.nome_completo,
           cpf_cnpj: cli.cpf_cnpj,
           rg_ie: cli.rg_ie,
           estado_civil: cli.estado_civil,
           sexo: cli.sexo,
           nacionalidade: cli.nacionalidade,
           nome_conjuge: cli.nome_conjuge,
           cpf_conjuge: cli.cpf_conjuge,
           rg_conjuge: cli.rg_conjuge,
           regime_bens: cli.regime_bens,
           telefone: cli.telefone,
           email: cli.email,
           endereco_completo: cli.endereco_completo,
           cidade: cli.cidade,
           estado: cli.estado,
           metadados: metadadosCopy
        };

        try {
           const res = await fetch(`${API_BASE}/clientes/${clienteSelecionadoId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
           });
           
           if (res.ok) {
              cli.metadados = metadadosCopy;
              renderMetadadosDetalhes(metadadosCopy);
              loadClientes(); 
           } else {
              alert("Erro ao remover metadado.");
           }
        } catch (e) {
           alert("Erro ao atualizar metadados.");
        }
     };

     // Adicionar Metadado Reativo no Modal de Detalhes
     document.getElementById('form-add-meta')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!clienteSelecionadoId) return;
        
        const cli = todosClientes.find(c => c.id === clienteSelecionadoId);
        if (!cli) return;

        const keyInput = document.getElementById('meta-key') as HTMLInputElement;
        const valInput = document.getElementById('meta-val') as HTMLInputElement;
        
        const key = keyInput.value.trim();
        const val = valInput.value.trim();
        
        if (!key || !val) return;

        const metadadosCopy = { ...(cli.metadados || {}) };
        metadadosCopy[key] = val;

        const payload = {
           nome_completo: cli.nome_completo,
           cpf_cnpj: cli.cpf_cnpj,
           rg_ie: cli.rg_ie,
           estado_civil: cli.estado_civil,
           sexo: cli.sexo,
           nacionalidade: cli.nacionalidade,
           nome_conjuge: cli.nome_conjuge,
           cpf_conjuge: cli.cpf_conjuge,
           rg_conjuge: cli.rg_conjuge,
           regime_bens: cli.regime_bens,
           telefone: cli.telefone,
           email: cli.email,
           endereco_completo: cli.endereco_completo,
           cidade: cli.cidade,
           estado: cli.estado,
           metadados: metadadosCopy
        };

        try {
           const res = await fetch(`${API_BASE}/clientes/${clienteSelecionadoId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
           });
           
           if (res.ok) {
              cli.metadados = metadadosCopy;
              renderMetadadosDetalhes(metadadosCopy);
              keyInput.value = '';
              valInput.value = '';
              loadClientes(); 
           } else {
              alert("Erro ao adicionar metadado.");
           }
        } catch (e) {
           alert("Erro ao salvar metadado.");
        }
     });

     // Abertura do Modal de Edição a partir das ações
     (window as any).abrirEdicaoCliente = async (id: number) => {
         const cli = todosClientes.find(c => c.id === id);
         if(!cli) return;

         clienteSelecionadoId = id;

         if(!form) return;

         const setFormVal = (name: string, val: any) => {
            const input = form.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement;
            if(input) input.value = val || '';
         };

         // Quebra o endereço completo para separar rua e número
         const enderecoCompleto = cli.endereco_completo || '';
         let enderecoSemNumero = enderecoCompleto;
         let numero = '';
         if (enderecoCompleto.includes(', ')) {
            const partes = enderecoCompleto.split(', ');
            numero = partes[partes.length - 1];
            enderecoSemNumero = partes.slice(0, -1).join(', ');
         }

         setFormVal('nome_completo', cli.nome_completo);
         setFormVal('cpf_cnpj', aplicarMascaraCpfCnpj(cli.cpf_cnpj || ''));
         setFormVal('rg_ie', cli.rg_ie);
         setFormVal('estado_civil', cli.estado_civil);
         setFormVal('sexo', cli.sexo || 'M');
         setFormVal('nacionalidade', cli.nacionalidade);
         setFormVal('nome_conjuge', cli.nome_conjuge);
         setFormVal('cpf_conjuge', aplicarMascaraCpfCnpj(cli.cpf_conjuge || ''));
         setFormVal('rg_conjuge', cli.rg_conjuge);
         setFormVal('regime_bens', cli.regime_bens);
         setFormVal('telefone', cli.telefone ? aplicarMascaraTelefone(cli.telefone) : '');
         setFormVal('email', cli.email);
         setFormVal('cep', cli.cep ? aplicarMascaraCep(cli.cep) : '');
         setFormVal('endereco_sem_numero', enderecoSemNumero);
         setFormVal('numero_endereco', numero);
         setFormVal('estado', cli.estado || 'PR');

         // Dispara a carga de cidades daquele estado antes de selecionar a cidade
         if (cli.estado) {
            await carregarCidadesPorEstado(cli.estado);
            const inputCidade = form.querySelector('[name="cidade"]') as HTMLInputElement;
            if (inputCidade) inputCidade.value = cli.cidade || '';
         }

         toggleConjuge();

         const title = document.getElementById('modal-cliente-title');
         if(title) title.textContent = 'Editar Cliente';

         modalDetalhes?.classList.add('hidden');
         modalCadastro?.classList.remove('hidden');
     };

     // Excluir Individual
     (window as any).excluirClienteIndividual = async (id: number) => {
        const cli = todosClientes.find(c => c.id === id);
        if (!cli || !confirm(`Deseja realmente excluir o cliente "${cli.nome_completo}"?`)) return;
        
        try {
           const res = await fetch(`${API_BASE}/clientes/${id}`, { method: 'DELETE' });
           const data = await res.json();
           if(data.error) alert(data.error);
           else {
              modalDetalhes?.classList.add('hidden');
              clientesSelecionados.delete(id);
              updateBatchActionBar();
              loadClientes();
           }
        } catch(e) {
           alert("Erro ao excluir o cliente.");
        }
     };

     // Atalho para editar a partir da view de detalhes
     document.getElementById('btn-det-editar')?.addEventListener('click', () => {
        if (clienteSelecionadoId) {
           (window as any).abrirEdicaoCliente(clienteSelecionadoId);
        }
     });

     // Atalho para excluir a partir da view de detalhes
     document.getElementById('btn-det-excluir')?.addEventListener('click', () => {
        if (clienteSelecionadoId) {
           (window as any).excluirClienteIndividual(clienteSelecionadoId);
        }
     });

     // Carregar Lista Geral e Estatísticas
     const loadClientes = () => {
        const body = document.getElementById('tabela-clientes-body');
        const statusDiv = document.getElementById('tabela-clientes-status');
        
        if(!body) return Promise.resolve();
        
        body.innerHTML = '';
        statusDiv?.classList.remove('hidden');
        if (statusDiv) statusDiv.innerText = "Carregando clientes...";
        
        return fetch(`${API_BASE}/clientes`)
           .then(res => res.json())
           .then(data => {
              if(data.error) {
                 statusDiv?.classList.remove('hidden');
                 if (statusDiv) statusDiv.innerHTML = `<span class="text-red-400 font-bold">Erro: ${data.error}</span>`;
                 return;
              }
              todosClientes = Array.isArray(data) ? data : [];
              
              const total = todosClientes.length;
              let pf = 0;
              let pj = 0;
              let incompletos = 0;

              todosClientes.forEach(cli => {
                 const docLimpo = (cli.cpf_cnpj || '').replace(/\D/g, '');
                 if (docLimpo.length > 11) {
                    pj++;
                 } else {
                    pf++;
                 }

                 const estCivil = cli.estado_civil || '';
                 const casadoOuUniao = estCivil.includes("Casado") || estCivil.includes("União Estável");
                 const conjugeEmBranco = !cli.nome_conjuge || cli.nome_conjuge.trim() === '';
                 if (casadoOuUniao && conjugeEmBranco) {
                    incompletos++;
                 }
              });

              const setKpiText = (id: string, text: string) => {
                 const el = document.getElementById(id);
                 if (el) el.innerText = text;
              };

              setKpiText('stat-total-clientes', total.toString());
              setKpiText('stat-pf-clientes', pf.toString());
              setKpiText('stat-pj-clientes', pj.toString());
              setKpiText('stat-incompletos-clientes', incompletos.toString());
              
              renderTabela();
           }).catch(err => {
              console.error("Erro ao obter clientes:", err);
              statusDiv?.classList.remove('hidden');
              if (statusDiv) statusDiv.innerHTML = '<span class="text-red-400 font-bold">Erro de conexão ao servidor.</span>';
           });
     };

     loadClientes();

     // Form Submit (Salvar ou Criar Cliente)
     form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        const payload = Object.fromEntries(formData.entries()) as any;
        
        // Junta o endereço e o número para salvar em endereco_completo
        const enderecoSemNumero = payload.endereco_sem_numero || '';
        const numero = payload.numero_endereco || '';
        payload.endereco_completo = numero ? `${enderecoSemNumero}, ${numero}` : enderecoSemNumero;
        
        // Remove campos temporários auxiliares do payload para validação
        delete payload.endereco_sem_numero;
        delete payload.numero_endereco;
         
        // Preserva os metadados existentes na edição
        if (clienteSelecionadoId) {
           const cli = todosClientes.find(c => c.id === clienteSelecionadoId);
           if (cli && cli.metadados) {
              payload.metadados = cli.metadados;
           }
        }
        
        try {
           const url = clienteSelecionadoId ? `${API_BASE}/clientes/${clienteSelecionadoId}` : `${API_BASE}/clientes`;
           const method = clienteSelecionadoId ? 'PUT' : 'POST';
           
           const res = await fetch(url, {
              method: method,
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify(payload)
           });
           
           if (!res.ok) {
              const errData = await res.json();
              let errMsg = "Erro ao salvar.";
              if (errData.error) {
                 errMsg = errData.error;
              } else if (errData.detail) {
                 errMsg = Array.isArray(errData.detail) 
                    ? errData.detail.map((d: any) => `${d.loc.join('.')}: ${d.msg}`).join('\n') 
                    : JSON.stringify(errData.detail);
              }
              alert(errMsg);
              return;
           }
           
           const data = await res.json();
           if(data.error) {
              alert(data.error);
           } else {
              modalCadastro?.classList.add('hidden');
              (e.target as HTMLFormElement).reset();
              loadClientes();
           }
        } catch(e) { 
           alert("Erro ao salvar."); 
        }
     });
  }
};
