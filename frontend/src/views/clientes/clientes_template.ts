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
       <form id="form-cliente" class="space-y-4" style="--ui-altura-minima: 36px;">
          <input type="hidden" name="tipo_pessoa" id="input-tipo-pessoa" value="PF">

          <!-- Alternador de Tipo de Pessoa (PF / PJ) -->
          <div class="flex items-center gap-2 p-1 bg-white/[0.03] border border-white/5 rounded-technical w-fit">
             <button type="button" id="btn-tipo-pf" class="px-3 py-1.5 text-xs font-bold rounded transition-all cursor-pointer bg-mint-vibrant text-forest-deep shadow-sm">
                Pessoa Física (PF)
             </button>
             <button type="button" id="btn-tipo-pj" class="px-3 py-1.5 text-xs font-bold rounded transition-all cursor-pointer text-white/50 hover:text-white">
                Pessoa Jurídica (PJ)
             </button>
          </div>

          <!-- SEÇÃO: IDENTIFICAÇÃO PESSOA FÍSICA -->
          <div id="bloco-campos-pf" class="space-y-3">
             <div class="grid grid-cols-4 gap-3 items-end">
                <div class="col-span-3">
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Nome Completo</label>
                   <ui-campo-texto name="nome_completo" id="input-nome-completo" required></ui-campo-texto>
                </div>
                <div>
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Gênero</label>
                   <ui-select name="sexo" value="M">
                      <option value="M">Masculino</option>
                      <option value="F">Feminino</option>
                   </ui-select>
                </div>
             </div>
             
             <div class="grid grid-cols-4 gap-3 items-end">
                <div class="col-span-2">
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">CPF</label>
                   <ui-campo-texto name="cpf_cnpj" id="input-cpf-cnpj" required></ui-campo-texto>
                </div>
                <div>
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">RG</label>
                   <ui-campo-texto name="rg_ie" placeholder="Número do RG"></ui-campo-texto>
                </div>
                <div class="grid grid-cols-2 gap-1.5">
                   <div>
                      <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Órgão</label>
                      <ui-campo-texto name="rg_orgao" placeholder="SSP"></ui-campo-texto>
                   </div>
                   <div>
                      <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">UF</label>
                      <ui-campo-texto name="rg_uf" placeholder="PR"></ui-campo-texto>
                   </div>
                </div>
             </div>

             <div class="grid grid-cols-3 gap-3 items-end">
                <div>
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Naturalidade</label>
                   <ui-campo-texto name="naturalidade" placeholder="Cidade - UF"></ui-campo-texto>
                </div>
                <div>
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Nacionalidade</label>
                   <ui-campo-texto name="nacionalidade" value="Brasileiro(a)"></ui-campo-texto>
                </div>
                <div>
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Data de Nascimento</label>
                   <ui-campo-texto name="data_nascimento_fundacao" id="input-data-nasc" tipo="date"></ui-campo-texto>
                </div>
             </div>

             <!-- Documentação CNH Opcional -->
             <div class="bg-white/[0.02] p-3 border border-white/5 rounded-technical space-y-2">
                <span class="text-[10px] font-bold text-mint-vibrant uppercase tracking-wider block">Carteira Nacional de Habilitação (CNH)</span>
                <div class="grid grid-cols-4 gap-3 items-end">
                   <div class="col-span-2">
                      <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Número CNH</label>
                      <ui-campo-texto name="cnh_numero" placeholder="Nº de Registro"></ui-campo-texto>
                   </div>
                   <div>
                      <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Categoria</label>
                      <ui-campo-texto name="cnh_categoria" placeholder="Ex: AB, B, C"></ui-campo-texto>
                   </div>
                   <div>
                      <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Validade CNH</label>
                      <ui-campo-texto name="cnh_validade" tipo="date"></ui-campo-texto>
                   </div>
                </div>
             </div>

             <div>
                <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Estado Civil</label>
                <ui-select name="estado_civil" id="select-estado-civil" texto-padrao="Selecione o Estado Civil...">
                   <option value="">Não informado / Solteiro(a)</option>
                   <option value="Solteiro(a)">Solteiro(a)</option>
                   <option value="Casado(a)">Casado(a)</option>
                   <option value="Divorciado(a)">Divorciado(a)</option>
                   <option value="Viúvo(a)">Viúvo(a)</option>
                   <option value="União Estável">União Estável</option>
                </ui-select>
             </div>
          </div>

          <!-- SEÇÃO: IDENTIFICAÇÃO PESSOA JURÍDICA (Oculta por padrão) -->
          <div id="bloco-campos-pj" class="space-y-3 hidden">
             <div class="grid grid-cols-2 gap-3 items-end">
                <div>
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Razão Social</label>
                   <ui-campo-texto name="razao_social" id="input-razao-social"></ui-campo-texto>
                </div>
                <div>
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Nome Fantasia</label>
                   <ui-campo-texto name="nome_fantasia" id="input-nome-fantasia"></ui-campo-texto>
                </div>
             </div>
             <div class="grid grid-cols-3 gap-3 items-end">
                <div>
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Inscrição Estadual (IE)</label>
                   <ui-campo-texto name="inscricao_estadual" placeholder="Isento / Nº"></ui-campo-texto>
                </div>
                <div>
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Inscrição Municipal (IM)</label>
                   <ui-campo-texto name="inscricao_municipal" placeholder="Opcional"></ui-campo-texto>
                </div>
                <div>
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Data de Fundação</label>
                   <ui-campo-texto name="data_fundacao_pj" id="input-data-fundacao" tipo="date"></ui-campo-texto>
                </div>
             </div>
             <div>
                <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Representante Legal (Vincular Cliente PF)</label>
                <ui-select name="representante_legal_id" id="select-representante-legal" texto-padrao="Selecione um cliente PF já cadastrado...">
                   <!-- Opções de clientes PF via JS -->
                </ui-select>
             </div>
          </div>

          <!-- SEÇÃO: CÔNJUGE & REGIME NOTARIAL (Visível para Casado e União Estável) -->
          <div id="secao-conjuge" class="border-t border-white/5 pt-3.5 space-y-2.5 hidden">
             <h5 class="text-[10px] font-bold text-mint-vibrant uppercase tracking-wider leading-none">Dados do Cônjuge & Regime Notarial</h5>
             <div class="grid grid-cols-4 gap-3 items-end">
                <div class="col-span-2">
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Nome do Cônjuge</label>
                   <ui-campo-texto name="nome_conjuge"></ui-campo-texto>
                </div>
                <div>
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">CPF Cônjuge</label>
                   <ui-campo-texto name="cpf_conjuge"></ui-campo-texto>
                </div>
                <div>
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">RG Cônjuge</label>
                   <ui-campo-texto name="rg_conjuge"></ui-campo-texto>
                </div>
             </div>
             <div class="grid grid-cols-2 gap-3 items-end">
                <div>
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Regime de Bens</label>
                   <ui-select name="regime_bens">
                      <option value="">Nenhum / Não aplicável</option>
                      <option value="Comunhão Parcial de Bens">Comunhão Parcial de Bens</option>
                      <option value="Comunhão Universal de Bens">Comunhão Universal de Bens</option>
                      <option value="Separação Total de Bens">Separação Total de Bens</option>
                      <option value="Participação Final nos Aquestos">Participação Final nos Aquestos</option>
                      <option value="Separação Obrigatória de Bens">Separação Obrigatória de Bens</option>
                   </ui-select>
                </div>
                <div>
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Matrícula Certidão de Casamento</label>
                   <ui-campo-texto name="certidao_casamento_matricula" placeholder="Nº da Matrícula do Cartório"></ui-campo-texto>
                </div>
             </div>
          </div>

          <!-- SEÇÃO: CONTATO E LOCALIZAÇÃO -->
          <div class="border-t border-white/5 pt-3.5 space-y-2.5">
             <h5 class="text-[10px] font-bold text-mint-vibrant uppercase tracking-wider leading-none">Contato & Localização</h5>
             <div class="grid grid-cols-3 gap-3 items-end">
                <div class="col-span-2">
                    <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Telefone / Celular</label>
                    <ui-campo-texto name="telefone" placeholder="(99) 99999-9999"></ui-campo-texto>
                </div>
                <div class="col-span-2">
                    <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Email</label>
                    <ui-campo-texto name="email" tipo="email"></ui-campo-texto>
                </div>
                <div class="col-span-2">
                    <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Profissão / Ramo de Atuação</label>
                    <ui-campo-texto name="profissao"></ui-campo-texto>
                </div>
                <div>
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1 flex items-center justify-between">
                     <span>Senha GOV</span>
                     <span class="text-[9px] text-mint-vibrant lowercase font-mono">criptografada</span>
                   </label>
                   <ui-campo-texto name="senha_gov" placeholder="Senha GOV"></ui-campo-texto>
                </div>
             </div>
             <div class="grid grid-cols-4 gap-3 items-end">
                <div>
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">CEP</label>
                   <ui-campo-texto name="cep" placeholder="99999-999"></ui-campo-texto>
                </div>
                <div class="col-span-2">
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Endereço (Rua, Av, Bairro)</label>
                   <ui-campo-texto name="endereco_sem_numero"></ui-campo-texto>
                </div>
                <div>
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Número</label>
                   <ui-campo-texto name="numero_endereco"></ui-campo-texto>
                </div>
             </div>
             <div class="grid grid-cols-2 gap-3 items-end">
                <div>
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Cidade</label>
                   <ui-campo-texto name="cidade" placeholder="Digite para buscar..."></ui-campo-texto>
                   <datalist id="cidades-list">
                      <!-- Carregado dinamicamente -->
                   </datalist>
                </div>
                <div>
                   <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Estado (UF)</label>
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

    <!-- MODAL DE DETALHES COMPLETO (ALTA DENSIDADE & GRID DEFENSIVO) -->
    <ui-modal id="modal-detalhes-cliente" titulo="Detalhes do Cliente">
       <div class="space-y-4">
          <!-- Cabeçalho do Modal de Detalhes -->
          <div class="flex items-center justify-between pb-3 border-b border-white/5">
             <div class="flex items-center gap-3 min-w-0">
                <ui-avatar id="det-cli-avatar" nome="??" tamanho="md"></ui-avatar>
                <div class="min-w-0">
                   <div class="flex items-center gap-2">
                      <h3 class="text-sm font-bold text-white truncate" id="det-cli-titulo">Nome do Cliente</h3>
                      <span id="det-cli-badge-tipo" class="text-[8.5px] px-1.5 py-0.5 rounded font-mono font-bold bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/20">PF</span>
                   </div>
                   <div class="flex items-center gap-2 mt-1">
                      <p class="text-[11px] text-white/50 font-mono leading-none" id="det-cli-subtitulo">CPF: 000.000.000-00</p>
                      <button type="button" class="btn-copy-field text-white/40 hover:text-mint-vibrant p-0.5 rounded hover:bg-white/5 transition-colors cursor-pointer" data-copy-target="det-cli-subtitulo" title="Copiar CPF/CNPJ" aria-label="Copiar documento principal">
                         <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                      </button>
                   </div>
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
          
          <!-- Abas de Navegação -->
          <div class="flex border-b border-white/5 bg-white/[0.01] overflow-x-auto scrollbar-none gap-1">
             <button class="px-3.5 py-2 text-xs font-bold border-b-2 border-mint-vibrant text-mint-vibrant tab-btn-det whitespace-nowrap" data-tab-det="tab-det-dados">Dados Cadastrais</button>
             <button class="px-3.5 py-2 text-xs font-bold border-b-2 border-transparent text-white/40 hover:text-white transition-colors tab-btn-det whitespace-nowrap" data-tab-det="tab-det-docs">Documentos</button>
             <button class="px-3.5 py-2 text-xs font-bold border-b-2 border-transparent text-white/40 hover:text-white transition-colors tab-btn-det whitespace-nowrap" data-tab-det="tab-det-meta">Metadados</button>
             <button class="px-3.5 py-2 text-xs font-bold border-b-2 border-transparent text-white/40 hover:text-white transition-colors tab-btn-det whitespace-nowrap" data-tab-det="tab-det-historico">Histórico & Auditoria</button>
          </div>
          
          <div class="space-y-4">
             <!-- ABA 1: DADOS CADASTRAIS (GRID DEFENSIVO 4 COLUNAS COM HIERARQUIA ASSIMÉTRICA) -->
             <div id="tab-det-dados" class="tab-content-det space-y-3.5">
                
                <!-- Bloco PJ (Exibido apenas para PJ) -->
                <div id="det-bloco-pj" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-white/[0.01] p-4 border border-white/5 rounded-technical hidden">
                   <div class="min-w-0">
                      <p class="text-[11px] font-medium tracking-wider uppercase text-white/40">Razão Social</p>
                      <p class="text-sm font-semibold text-white mt-1 break-words" id="det-cli-razaosocial">-</p>
                   </div>
                   <div class="min-w-0">
                      <p class="text-[11px] font-medium tracking-wider uppercase text-white/40">Nome Fantasia</p>
                      <p class="text-sm font-semibold text-white/90 mt-1 break-words" id="det-cli-nomefantasia">-</p>
                   </div>
                   <div class="min-w-0">
                      <p class="text-[11px] font-medium tracking-wider uppercase text-white/40">Inscrição Estadual</p>
                      <p class="text-sm font-semibold font-mono text-white/90 mt-1 break-words" id="det-cli-ie">-</p>
                   </div>
                   <div class="min-w-0">
                      <p class="text-[11px] font-medium tracking-wider uppercase text-white/40">Representante Legal</p>
                      <p class="text-sm font-semibold text-mint-vibrant mt-1 break-words" id="det-cli-representante">-</p>
                   </div>
                </div>

                <!-- Grid Defensivo de Qualificação Civil (4 Colunas) -->
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-white/[0.01] p-4 border border-white/5 rounded-technical">
                   <div class="min-w-0">
                      <p class="text-[11px] font-medium tracking-wider uppercase text-white/40">Gênero</p>
                      <p class="text-sm font-semibold text-white mt-1 truncate" id="det-cli-sexo">-</p>
                   </div>
                   <div class="min-w-0">
                      <p class="text-[11px] font-medium tracking-wider uppercase text-white/40">Estado Civil</p>
                      <p class="text-sm font-semibold text-white mt-1 truncate" id="det-cli-estcivil">-</p>
                   </div>
                   <div class="min-w-0">
                      <p class="text-[11px] font-medium tracking-wider uppercase text-white/40">Naturalidade</p>
                      <p class="text-sm font-semibold text-white mt-1 truncate" id="det-cli-naturalidade">-</p>
                   </div>
                   <div class="min-w-0">
                      <p class="text-[11px] font-medium tracking-wider uppercase text-white/40">Nacionalidade</p>
                      <p class="text-sm font-semibold text-white mt-1 truncate" id="det-cli-nacionalidade">-</p>
                   </div>
                   <div class="min-w-0">
                      <p class="text-[11px] font-medium tracking-wider uppercase text-white/40">Data Nasc./Fundação</p>
                      <p class="text-sm font-semibold font-mono text-white mt-1" id="det-cli-datanasc">-</p>
                   </div>
                   <div class="min-w-0 col-span-1 sm:col-span-2 lg:col-span-3">
                      <p class="text-[11px] font-medium tracking-wider uppercase text-white/40">Profissão / Ramo de Atuação</p>
                      <p class="text-sm font-semibold text-white mt-1 truncate" id="det-cli-profissao">-</p>
                   </div>
                </div>

                <!-- Seletor de Documentação Rápida (Pills RG / CNH) -->
                <div class="bg-white/[0.01] p-4 border border-white/5 rounded-technical space-y-3">
                   <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                         <span class="text-[11px] font-medium tracking-wider uppercase text-white/40">Documento Principal:</span>
                         <div class="flex gap-1 p-0.5 bg-white/[0.03] border border-white/5 rounded">
                            <button type="button" id="pill-doc-rg" class="px-2.5 py-1 text-[10px] font-bold rounded transition-all cursor-pointer bg-mint-vibrant text-forest-deep">RG</button>
                            <button type="button" id="pill-doc-cnh" class="px-2.5 py-1 text-[10px] font-bold rounded transition-all cursor-pointer text-white/50 hover:text-white">CNH</button>
                         </div>
                      </div>
                      <span id="det-doc-badge-validade" class="hidden text-[9px] px-2 py-0.5 rounded font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse">
                         <i data-lucide="alert-triangle" class="w-3 h-3 inline mr-1"></i> CNH Vencida
                      </span>
                   </div>

                   <!-- Detalhes do RG -->
                   <div id="bloco-pill-rg" class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div class="min-w-0">
                         <p class="text-[11px] font-medium tracking-wider uppercase text-white/40">Número RG</p>
                         <div class="flex items-center gap-1.5 mt-1">
                            <p class="text-sm font-semibold font-mono text-white" id="det-cli-rg">-</p>
                            <button type="button" class="btn-copy-field text-white/40 hover:text-mint-vibrant p-1 rounded hover:bg-white/5 transition-colors cursor-pointer" data-copy-target="det-cli-rg" title="Copiar RG" aria-label="Copiar RG">
                               <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                            </button>
                         </div>
                      </div>
                      <div class="min-w-0">
                         <p class="text-[11px] font-medium tracking-wider uppercase text-white/40">Órgão Emissor</p>
                         <p class="text-sm font-semibold text-white mt-1" id="det-cli-rg-orgao">-</p>
                      </div>
                      <div class="min-w-0">
                         <p class="text-[11px] font-medium tracking-wider uppercase text-white/40">UF Emissor</p>
                         <p class="text-sm font-semibold text-white mt-1" id="det-cli-rg-uf">-</p>
                      </div>
                   </div>

                   <!-- Detalhes da CNH -->
                   <div id="bloco-pill-cnh" class="grid grid-cols-1 sm:grid-cols-4 gap-4 hidden">
                      <div class="min-w-0">
                         <p class="text-[11px] font-medium tracking-wider uppercase text-white/40">Número CNH</p>
                         <div class="flex items-center gap-1.5 mt-1">
                            <p class="text-sm font-semibold font-mono text-white" id="det-cli-cnh-num">-</p>
                            <button type="button" class="btn-copy-field text-white/40 hover:text-mint-vibrant p-1 rounded hover:bg-white/5 transition-colors cursor-pointer" data-copy-target="det-cli-cnh-num" title="Copiar CNH" aria-label="Copiar CNH">
                               <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                            </button>
                         </div>
                      </div>
                      <div class="min-w-0">
                         <p class="text-[11px] font-medium tracking-wider uppercase text-white/40">Categoria</p>
                         <p class="text-sm font-semibold font-mono text-white mt-1" id="det-cli-cnh-cat">-</p>
                      </div>
                      <div class="min-w-0">
                         <p class="text-[11px] font-medium tracking-wider uppercase text-white/40">Validade CNH</p>
                         <p class="text-sm font-semibold font-mono text-white mt-1" id="det-cli-cnh-val">-</p>
                      </div>
                      <div class="min-w-0">
                         <p class="text-[11px] font-medium tracking-wider uppercase text-white/40">Órgão / UF</p>
                         <p class="text-sm font-semibold text-white mt-1" id="det-cli-cnh-orgaouf">-</p>
                      </div>
                   </div>
                </div>
                
                <!-- Bloco de Cônjuge & Dados Notariais -->
                <div id="det-conjuge-bloco" class="space-y-3 bg-white/[0.01] p-4 border border-white/5 rounded-technical hidden">
                   <h6 class="text-[10px] text-mint-vibrant uppercase tracking-wider font-bold leading-none">Informações do Cônjuge & Regime Notarial</h6>
                   <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div class="min-w-0 sm:col-span-2">
                         <p class="text-[11px] font-medium tracking-wider uppercase text-white/40">Cônjuge</p>
                         <p class="text-sm font-semibold text-white mt-1 break-words" id="det-cli-nomeconjuge">-</p>
                      </div>
                      <div class="min-w-0">
                         <p class="text-[11px] font-medium tracking-wider uppercase text-white/40">CPF Cônjuge</p>
                         <div class="flex items-center gap-1.5 mt-1">
                            <p class="text-sm font-semibold font-mono text-white" id="det-cli-cpfconjuge">-</p>
                            <button type="button" class="btn-copy-field text-white/40 hover:text-mint-vibrant p-1 rounded hover:bg-white/5 transition-colors cursor-pointer" data-copy-target="det-cli-cpfconjuge" title="Copiar CPF Cônjuge" aria-label="Copiar CPF do cônjuge">
                               <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                            </button>
                         </div>
                      </div>
                      <div class="min-w-0">
                         <p class="text-[11px] font-medium tracking-wider uppercase text-white/40">RG Cônjuge</p>
                         <p class="text-sm font-semibold font-mono text-white mt-1" id="det-cli-rgconjuge">-</p>
                      </div>
                      <div class="min-w-0 sm:col-span-2 border-t border-white/5 pt-2 mt-1">
                         <p class="text-[11px] font-medium tracking-wider uppercase text-white/40">Regime de Bens</p>
                         <p class="text-sm font-semibold text-white mt-1" id="det-cli-regimebens">-</p>
                      </div>
                      <div class="min-w-0 sm:col-span-2 border-t border-white/5 pt-2 mt-1">
                         <p class="text-[11px] font-medium tracking-wider uppercase text-white/40">Matrícula Certidão de Casamento</p>
                         <p class="text-sm font-semibold font-mono text-white mt-1" id="det-cli-certidaocasamento">-</p>
                      </div>
                   </div>
                </div>
                
                <!-- Bloco de Contato, Endereço e Senha GOV -->
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 bg-white/[0.01] p-4 border border-white/5 rounded-technical">
                   <div class="min-w-0">
                      <p class="text-[11px] font-medium tracking-wider uppercase text-white/40">Telefone / Celular</p>
                      <div class="flex items-center gap-2 mt-1">
                         <p class="text-sm font-semibold font-mono text-white" id="det-cli-telefone">-</p>
                         <a id="btn-det-whatsapp" href="#" target="_blank" rel="noopener noreferrer" class="hidden inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 text-xs font-bold transition-all" title="Abrir no WhatsApp" aria-label="Conversar no WhatsApp">
                            <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>
                            WhatsApp
                         </a>
                      </div>
                   </div>
                   <div class="min-w-0">
                      <p class="text-[11px] font-medium tracking-wider uppercase text-white/40">E-mail</p>
                      <p class="text-sm font-semibold text-white mt-1 break-words" id="det-cli-email">-</p>
                   </div>
                   <div class="min-w-0">
                      <p class="text-[11px] font-medium tracking-wider uppercase text-white/40 flex items-center justify-between">
                         <span>Senha GOV</span>
                         <span class="text-[9px] text-mint-vibrant lowercase font-mono">auditada</span>
                      </p>
                      <div class="flex items-center gap-2 mt-1">
                         <p class="text-sm font-semibold font-mono text-white" id="det-cli-senhagov">-</p>
                         <button type="button" id="btn-revelar-senhagov-det" class="text-white/40 hover:text-mint-vibrant hidden transition-colors cursor-pointer p-0.5" title="Mostrar/Ocultar Senha GOV" aria-label="Mostrar ou ocultar Senha GOV">
                            <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                         </button>
                         <button type="button" id="btn-copy-senhagov-det" class="btn-copy-field text-white/40 hover:text-mint-vibrant hidden transition-colors cursor-pointer p-0.5" data-copy-target="det-cli-senhagov" title="Copiar Senha GOV" aria-label="Copiar Senha GOV">
                            <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                         </button>
                      </div>
                   </div>
                   <div class="sm:col-span-2 lg:col-span-3 border-t border-white/5 pt-2 mt-1 min-w-0">
                      <p class="text-[11px] font-medium tracking-wider uppercase text-white/40">Endereço Completo</p>
                      <p class="text-sm font-semibold text-white mt-1 break-words" id="det-cli-endereco">-</p>
                   </div>
                </div>
                
                <!-- KPIs de Levantamentos e Propriedades -->
                <div class="grid grid-cols-2 gap-3">
                   <div class="glass-card p-3.5 flex items-center justify-between">
                      <div>
                         <p class="text-[11px] font-medium tracking-wider uppercase text-white/40">Projetos/Levantamentos</p>
                         <h4 class="text-lg font-mono font-bold mt-0.5 text-white" id="det-cli-total-levs">0</h4>
                      </div>
                      <div class="w-7 h-7 bg-mint-vibrant/10 rounded-full flex items-center justify-center">
                         <i data-lucide="map-pin" class="w-4 h-4 text-mint-vibrant"></i>
                      </div>
                   </div>
                   <div class="glass-card p-3.5 flex items-center justify-between">
                      <div>
                         <p class="text-[11px] font-medium tracking-wider uppercase text-white/40">Propriedades</p>
                         <h4 class="text-lg font-mono font-bold mt-0.5 text-white" id="det-cli-total-props">0</h4>
                      </div>
                      <div class="w-7 h-7 bg-blue-500/10 rounded-full flex items-center justify-center">
                         <i data-lucide="home" class="w-4 h-4 text-blue-500"></i>
                      </div>
                   </div>
                </div>

                <!-- Bloco de Propriedades Vinculadas -->
                <div class="bg-white/[0.01] p-3.5 border border-white/5 rounded-technical space-y-2" id="det-cli-bloco-propriedades">
                   <h6 class="text-[10px] text-mint-vibrant uppercase tracking-wider font-bold leading-none">Propriedades Vinculadas</h6>
                   <div class="divide-y divide-white/5 space-y-1.5 max-h-40 overflow-y-auto pr-1" id="det-cli-lista-propriedades">
                      <!-- Inserido dinamicamente via JS -->
                   </div>
                </div>
             </div>

             <!-- ABA 2: DOCUMENTOS DE IDENTIFICAÇÃO (RG, CNH COM VALIDADE, CONSELHOS) -->
             <div id="tab-det-docs" class="tab-content-det hidden space-y-3.5">
                <!-- Formulário de Adicionar Documento -->
                <div class="bg-white/[0.02] p-3 border border-white/5 rounded-technical space-y-2.5">
                   <h6 class="text-[10px] font-bold text-mint-vibrant uppercase tracking-wider">Adicionar Novo Documento</h6>
                   <form id="form-add-doc" class="grid grid-cols-1 sm:grid-cols-6 gap-2 items-end">
                      <div class="sm:col-span-1">
                         <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Tipo</label>
                         <ui-select id="doc-tipo" value="RG" class="w-full">
                            <option value="RG">RG</option>
                            <option value="CNH">CNH</option>
                            <option value="CREA">CREA</option>
                            <option value="CAU">CAU</option>
                            <option value="OAB">OAB</option>
                            <option value="PASSAPORTE">Passaporte</option>
                            <option value="OUTRO">Outro</option>
                         </ui-select>
                      </div>
                      <div class="sm:col-span-2">
                         <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Número</label>
                         <ui-campo-texto id="doc-numero" placeholder="Nº do documento" required class="w-full"></ui-campo-texto>
                      </div>
                      <div class="sm:col-span-1">
                         <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Órgão / UF</label>
                         <ui-campo-texto id="doc-orgao" placeholder="SSP/PR" class="w-full"></ui-campo-texto>
                      </div>
                      <div class="sm:col-span-1">
                         <label class="block text-[11px] font-medium tracking-wider uppercase text-white/40 mb-1">Validade (CNH)</label>
                         <ui-campo-texto id="doc-validade" tipo="date" class="w-full"></ui-campo-texto>
                      </div>
                      <div class="sm:col-span-1 flex justify-end">
                         <ui-botao tipo-submit variante="primario" class="w-full">
                            <i data-lucide="plus" class="w-3.5 h-3.5"></i>
                            Adicionar
                         </ui-botao>
                      </div>
                   </form>
                </div>

                <!-- Tabela de Documentos -->
                <div class="bg-white/5 rounded-technical border border-white/5 overflow-hidden">
                   <table class="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr class="bg-white/[0.02] border-b border-white/5 text-[9px] uppercase tracking-wider font-bold text-white/40">
                           <th class="py-2.5 px-3">Tipo</th>
                           <th class="py-2.5 px-3">Número</th>
                           <th class="py-2.5 px-3">Órgão Emissor</th>
                           <th class="py-2.5 px-3">Categoria</th>
                           <th class="py-2.5 px-3">Validade</th>
                           <th class="py-2.5 px-3 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody id="det-cli-documentos" class="divide-y divide-white/5">
                         <!-- Documentos via JS -->
                      </tbody>
                   </table>
                </div>
             </div>
             
             <!-- ABA 3: METADADOS -->
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
             
             <!-- ABA 4: HISTÓRICO & AUDITORIA DE ACESSO -->
             <div id="tab-det-historico" class="tab-content-det hidden space-y-3">
                <div class="flex items-center justify-between border-b border-white/5 pb-2">
                   <div class="flex gap-2">
                      <button type="button" id="btn-subtab-historico" class="px-2.5 py-1 text-[11px] font-bold rounded bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/20 cursor-pointer">
                         Edições Cadastrais
                      </button>
                      <button type="button" id="btn-subtab-acessos" class="px-2.5 py-1 text-[11px] font-bold rounded text-white/40 hover:text-white border border-transparent cursor-pointer">
                         Auditoria de Acesso Sensível
                      </button>
                   </div>
                </div>

                <!-- Sub-aba: Edições -->
                <div id="subtab-content-historico" class="space-y-2">
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

                <!-- Sub-aba: Acessos Sensíveis -->
                <div id="subtab-content-acessos" class="space-y-2 hidden">
                   <div class="bg-white/5 rounded-technical border border-white/5 overflow-hidden max-h-[260px] overflow-y-auto pr-1">
                      <table class="w-full text-left text-[11px] border-collapse">
                         <thead>
                            <tr class="bg-white/[0.02] border-b border-white/5 text-[8.5px] uppercase tracking-wider font-bold text-white/40 sticky top-0 z-10">
                               <th class="py-2 px-3 bg-[#0d1611]">Dado</th>
                               <th class="py-2 px-3 bg-[#0d1611]">Ação</th>
                               <th class="py-2 px-3 bg-[#0d1611]">Usuário</th>
                               <th class="py-2 px-3 bg-[#0d1611]">Origem</th>
                               <th class="py-2 px-3 text-right bg-[#0d1611]">Data/Hora</th>
                            </tr>
                         </thead>
                         <tbody id="det-cli-acessos" class="divide-y divide-white/5">
                            <!-- Acessos via JS -->
                         </tbody>
                      </table>
                   </div>
                </div>
             </div>
          </div>
       </div>
    </ui-modal>


`;
