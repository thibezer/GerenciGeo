export const renderClientesTemplate = (): string => `
    <div class="space-y-4 sm:space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <!-- Cabeçalho Principal -->
      <div class="flex justify-between items-center h-10 sm:h-12 border-b border-white/5 pb-2 sm:pb-3">
        <div>
          <h2 class="text-lg sm:text-xl font-bold tracking-tight text-white leading-none">Clientes</h2>
          <p class="text-white/40 text-[10px] mt-1.5 hidden sm:block">Gestão cadastral, metadados extensíveis e logs de auditoria jurídica.</p>
        </div>
      </div>

      <!-- Mini Cards de Estatísticas Rápidas (KPIs Compactos) -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <ui-card elevacao="baixa" class="h-14 sm:h-16 flex items-center">
          <div class="px-4 flex items-center gap-3 w-full">
            <div class="p-1.5 bg-mint-vibrant/10 rounded-technical shrink-0">
              <i data-lucide="users" class="w-4 h-4 text-mint-vibrant"></i>
            </div>
            <div class="min-w-0">
              <p class="text-white/40 text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold truncate">Total de Clientes</p>
              <h3 class="text-base sm:text-lg font-bold tracking-tight text-white leading-none mt-0.5" id="stat-total-clientes">0</h3>
            </div>
          </div>
        </ui-card>

        <ui-card elevacao="baixa" class="h-14 sm:h-16 flex items-center">
          <div class="px-4 flex items-center gap-3 w-full">
            <div class="p-1.5 bg-blue-500/10 rounded-technical shrink-0">
              <i data-lucide="user" class="w-4 h-4 text-blue-500"></i>
            </div>
            <div class="min-w-0">
              <p class="text-white/40 text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold truncate">Pessoas Físicas</p>
              <h3 class="text-base sm:text-lg font-bold tracking-tight text-white leading-none mt-0.5" id="stat-pf-clientes">0</h3>
            </div>
          </div>
        </ui-card>

        <ui-card elevacao="baixa" class="h-14 sm:h-16 flex items-center">
          <div class="px-4 flex items-center gap-3 w-full">
            <div class="p-1.5 bg-indigo-500/10 rounded-technical shrink-0">
              <i data-lucide="building-2" class="w-4 h-4 text-indigo-500"></i>
            </div>
            <div class="min-w-0">
              <p class="text-white/40 text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold truncate">Pessoas Jurídicas</p>
              <h3 class="text-base sm:text-lg font-bold tracking-tight text-white leading-none mt-0.5" id="stat-pj-clientes">0</h3>
            </div>
          </div>
        </ui-card>

        <ui-card elevacao="baixa" class="h-14 sm:h-16 flex items-center">
          <div class="px-4 flex items-center gap-3 w-full">
            <div class="p-1.5 bg-rose-500/10 rounded-technical shrink-0">
              <i data-lucide="alert-triangle" class="w-4 h-4 text-rose-500"></i>
            </div>
            <div class="min-w-0">
              <p class="text-white/40 text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold truncate">Pendências de Cônjuge</p>
              <h3 class="text-base sm:text-lg font-bold tracking-tight text-white leading-none mt-0.5" id="stat-incompletos-clientes">0</h3>
            </div>
          </div>
        </ui-card>
      </div>

      <!-- Tabela Principal de Clientes -->
      <ui-card elevacao="baixa" class="overflow-hidden flex flex-col">
        <!-- Filtros / Busca e Ações -->
        <div class="p-4 border-b border-white/5 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white/[0.01]">
          <div class="flex items-center gap-2 flex-1 max-w-md">
            <ui-campo-texto id="busca-cliente" placeholder="Buscar cliente por nome, CPF ou CNPJ..." class="w-full"></ui-campo-texto>
          </div>
          <div class="flex gap-2 justify-end">
            <ui-botao variante="primario" id="btn-abrir-modal-cliente">
               <i data-lucide="plus" class="w-4 h-4"></i>
               Novo Cliente
            </ui-botao>
          </div>
        </div>

        <!-- Tabela -->
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-white/5 text-[9px] sm:text-[10px] uppercase tracking-wider font-bold text-white/40 bg-white/[0.01]">
                <th class="py-3 px-4 w-10">
                  <ui-checkbox id="check-all-clientes"></ui-checkbox>
                </th>
                <th class="py-3 px-4">Nome Completo</th>
                <th class="py-3 px-4">CPF / CNPJ</th>
                <th class="py-3 px-4">Senha GOV</th>
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
            <ui-select id="paginacao-limite" value="10" class="w-16 h-7">
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </ui-select>
            <span id="paginacao-info">Mostrando 0-0 de 0 clientes</span>
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

    <!-- MODAL DE CADASTRO / EDIÇÃO -->
    <ui-modal id="modal-cliente" titulo="Cadastro de Cliente">
       <form id="form-cliente" class="space-y-3.5" style="--ui-altura-minima: 36px;">
          <!-- Seção: Identificação -->
          <div class="space-y-3">
             <div class="grid grid-cols-4 gap-3 items-end">
                <div class="col-span-3">
                   <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Nome Completo</label>
                   <ui-campo-texto name="nome_completo" required></ui-campo-texto>
                </div>
                <div>
                   <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Gênero</label>
                   <ui-select name="sexo" value="M">
                      <option value="M">Masculino</option>
                      <option value="F">Feminino</option>
                   </ui-select>
                </div>
             </div>
             <div class="grid grid-cols-2 gap-3 items-end">
                <div>
                   <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">CPF / CNPJ</label>
                   <ui-campo-texto name="cpf_cnpj" required></ui-campo-texto>
                </div>
                <div>
                   <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">RG / IE</label>
                   <ui-campo-texto name="rg_ie"></ui-campo-texto>
                </div>
             </div>
             <div class="grid grid-cols-2 gap-3 items-end">
                <div>
                   <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Estado Civil</label>
                   <ui-select name="estado_civil" texto-padrao="Selecione o Estado Civil...">
                      <option value="">Não informado / Solteiro(a)</option>
                      <option value="Solteiro(a)">Solteiro(a)</option>
                      <option value="Casado(a)">Casado(a)</option>
                      <option value="Divorciado(a)">Divorciado(a)</option>
                      <option value="Viúvo(a)">Viúvo(a)</option>
                      <option value="União Estável">União Estável</option>
                   </ui-select>
                </div>
                <div>
                   <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Nacionalidade</label>
                   <ui-campo-texto name="nacionalidade" value="Brasileiro(a)"></ui-campo-texto>
                </div>
             </div>
          </div>

          <!-- Seção: Cônjuge -->
          <div id="secao-conjuge" class="border-t border-white/5 pt-3.5 space-y-2.5">
             <h5 class="text-[9px] font-bold text-mint-vibrant uppercase tracking-wider leading-none">Dados do Cônjuge</h5>
             <div class="grid grid-cols-4 gap-3 items-end">
                <div class="col-span-2">
                   <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Nome do Cônjuge</label>
                   <ui-campo-texto name="nome_conjuge"></ui-campo-texto>
                </div>
                <div>
                   <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">CPF Cônjuge</label>
                   <ui-campo-texto name="cpf_conjuge"></ui-campo-texto>
                </div>
                <div>
                   <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">RG Cônjuge</label>
                   <ui-campo-texto name="rg_conjuge"></ui-campo-texto>
                </div>
             </div>
             <div class="grid grid-cols-2 gap-3 items-end">
                <div>
                   <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Regime de Bens</label>
                   <ui-select name="regime_bens">
                      <option value="">Nenhum / Não aplicável</option>
                      <option value="Comunhão Parcial de Bens">Comunhão Parcial de Bens</option>
                      <option value="Comunhão Universal de Bens">Comunhão Universal de Bens</option>
                      <option value="Separação Total de Bens">Separação Total de Bens</option>
                      <option value="Participação Final nos Aquestos">Participação Final nos Aquestos</option>
                      <option value="Separação Obrigatória de Bens">Separação Obrigatória de Bens</option>
                   </ui-select>
                </div>
             </div>
          </div>

          <!-- Seção: Contato e Endereço -->
          <div class="border-t border-white/5 pt-3.5 space-y-2.5">
             <h5 class="text-[9px] font-bold text-mint-vibrant uppercase tracking-wider leading-none">Contato & Localização</h5>
             <div class="grid grid-cols-3 gap-3 items-end">
                <div>
                   <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Telefone</label>
                   <ui-campo-texto name="telefone" placeholder="(99) 99999-9999"></ui-campo-texto>
                </div>
                <div>
                   <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Email</label>
                   <ui-campo-texto name="email" tipo="email"></ui-campo-texto>
                </div>
                <div>
                   <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Senha GOV</label>
                   <ui-campo-texto name="senha_gov" placeholder="Senha GOV"></ui-campo-texto>
                </div>
             </div>
             <div class="grid grid-cols-4 gap-3 items-end">
                <div>
                   <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">CEP</label>
                   <ui-campo-texto name="cep" placeholder="99999-999"></ui-campo-texto>
                </div>
                <div class="col-span-2">
                   <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Endereço (Rua, Av, Bairro)</label>
                   <ui-campo-texto name="endereco_sem_numero"></ui-campo-texto>
                </div>
                <div>
                   <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Número</label>
                   <ui-campo-texto name="numero_endereco"></ui-campo-texto>
                </div>
             </div>
             <div class="grid grid-cols-2 gap-3 items-end">
                <div>
                   <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Cidade</label>
                   <ui-campo-texto name="cidade" placeholder="Digite para buscar..."></ui-campo-texto>
                   <datalist id="cidades-list">
                      <!-- Carregado dinamicamente -->
                   </datalist>
                </div>
                <div>
                   <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Estado (UF)</label>
                   <ui-select name="estado" value="PR">
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
                      <option value="PR">PR</option>
                      <option value="RJ">RJ</option>
                      <option value="RN">RN</option>
                      <option value="RO">RO</option>
                      <option value="RR">RR</option>
                      <option value="RS">RS</option>
                      <option value="SC">SC</option>
                      <option value="SE">SE</option>
                      <option value="SP">SP</option>
                      <option value="TO">TO</option>
                   </ui-select>
                </div>
             </div>
          </div>
       </form>
       <div slot="rodape" class="flex justify-end gap-1 w-full">
          <ui-botao variante="primario" id="btn-salvar-cliente">Salvar Cliente</ui-botao>
          <ui-botao variante="secundario" id="btn-cancelar-cliente">Cancelar</ui-botao>
       </div>
    </ui-modal>

    <!-- MODAL DE DETALHES COMPLETO -->
    <ui-modal id="modal-detalhes-cliente" titulo="Detalhes do Cliente">
       <div class="space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-white/5">
             <div class="flex items-center gap-3 min-w-0">
                <ui-avatar id="det-cli-avatar" nome="??" tamanho="md"></ui-avatar>
                <div class="min-w-0">
                   <h3 class="text-sm font-bold text-white truncate" id="det-cli-titulo">Nome do Cliente</h3>
                   <p class="text-[9px] text-white/40 font-mono leading-none mt-1" id="det-cli-subtitulo">CPF: 000.000.000-00</p>
                </div>
             </div>
             <div class="flex items-center gap-1.5 shrink-0">
                <ui-botao variante="secundario" id="btn-det-editar" title="Editar Cliente">
                    <i data-lucide="edit" class="w-4 h-4"></i>
                </ui-botao>
                <ui-botao variante="destrutivo" id="btn-det-excluir" title="Excluir Cliente">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </ui-botao>
             </div>
          </div>
          
          <div class="flex border-b border-white/5 bg-white/[0.01] overflow-x-auto scrollbar-none">
             <button class="px-4 py-2 text-xs font-bold border-b-2 border-mint-vibrant text-mint-vibrant tab-btn-det whitespace-nowrap" data-tab-det="tab-det-dados">Dados Cadastrais</button>
             <button class="px-4 py-2 text-xs font-bold border-b-2 border-transparent text-white/40 hover:text-white transition-colors tab-btn-det whitespace-nowrap" data-tab-det="tab-det-meta">Metadados</button>
             <button class="px-4 py-2 text-xs font-bold border-b-2 border-transparent text-white/40 hover:text-white transition-colors tab-btn-det whitespace-nowrap" data-tab-det="tab-det-historico">Histórico de Alterações</button>
          </div>
          
          <div class="space-y-4">
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
                
                <div class="grid grid-cols-3 gap-3 bg-white/[0.01] p-3 border border-white/5 rounded-technical">
                   <div>
                      <p class="text-[9px] text-white/40 uppercase tracking-widest font-bold">Telefone</p>
                      <p class="text-xs text-white/80 font-mono mt-0.5" id="det-cli-telefone">-</p>
                   </div>
                   <div>
                      <p class="text-[9px] text-white/40 uppercase tracking-widest font-bold">E-mail</p>
                      <p class="text-xs text-white/80 mt-0.5" id="det-cli-email">-</p>
                   </div>
                   <div>
                      <p class="text-[9px] text-white/40 uppercase tracking-widest font-bold">Senha GOV</p>
                      <p class="text-xs text-white/80 font-mono mt-0.5" id="det-cli-senhagov">-</p>
                   </div>
                   <div class="col-span-3 border-t border-white/5 pt-2 mt-1">
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
                      <ui-campo-texto id="meta-key" placeholder="Chave" required class="w-28"></ui-campo-texto>
                      <ui-campo-texto id="meta-val" placeholder="Valor" required class="w-36"></ui-campo-texto>
                      <ui-botao tipo-submit variante="primario">
                         Adicionar
                      </ui-botao>
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
    </ui-modal>
`;
