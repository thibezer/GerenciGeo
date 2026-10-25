import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { initIcons, formatarCAR, formatarCCIR, showToast, customAlert, customConfirm, escapeHtml, formatarDataHoraUtc } from '../utils';
import { renderBotoesPaginacaoHtml } from '../utils/lista_padrao';
import {
  filtrarPropriedades,
  filtrarPorSegmentoProp,
  contarSegmentosProp,
  ordenarPropriedades,
  renderLinhasPropHtml
} from './propriedades/propriedades_helpers';
import type { SegmentoProp, CampoOrdemProp, DirecaoOrdem } from './propriedades/propriedades_helpers';


let clickOutsideHandlerClientes: ((e: MouseEvent) => void) | null = null;
let keydownHandlerModal: ((e: KeyboardEvent) => void) | null = null;
let atalhoBuscaProp: ((e: KeyboardEvent) => void) | null = null;

// O backend (FastAPI) devolve erros em `detail` com status HTTP de erro; normaliza para `error`,
// que é o campo verificado pelos handlers desta tela.
const lerRespostaApi = async (res: Response): Promise<any> => {
  let data: any;
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (data === null || typeof data !== 'object') data = {};
  if (!res.ok && !data.error) {
    const detail = data.detail;
    data.error = Array.isArray(detail)
      ? detail.map((d: any) => d?.msg || String(d)).join('\n')
      : (detail || `Erro ${res.status} ao processar a requisição.`);
  }
  return data;
};

export const propriedadesRoute: RouteDef = {
  render: () => `
    <div class="gap-2 animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col h-full min-h-0 flex-1">
      <!-- Barra superior (padrão de listagem): título + segmentos + busca + ação primária -->
      <div class="lp-bar">
        <div class="lp-bar-left">
          <h2 class="lp-titulo">Propriedades</h2>
          <div class="lp-seg" id="seg-propriedades" role="group" aria-label="Filtrar propriedades">
            <button type="button" class="lp-seg-btn is-active" data-seg="todos" aria-pressed="true">Todas <span class="lp-seg-n" id="seg-n-todos">0</span></button>
            <button type="button" class="lp-seg-btn" data-seg="com-lev" aria-pressed="false" title="Propriedades com levantamento">Com levantamento <span class="lp-seg-n" id="seg-n-com-lev">0</span></button>
            <button type="button" class="lp-seg-btn" data-seg="sem-lev" aria-pressed="false" title="Propriedades sem levantamento">Sem levantamento <span class="lp-seg-n" id="seg-n-sem-lev">0</span></button>
            <button type="button" class="lp-seg-btn" data-seg="pendencias" data-tom="warn" aria-pressed="false" title="Sem proprietário, composição incompleta ou sem matrícula">Pendências <span class="lp-seg-n" id="seg-n-pendencias">0</span></button>
          </div>
        </div>
        <div class="lp-bar-right">
          <label class="lp-busca" id="busca-wrap" style="width:clamp(150px,15vw,300px)">
            <i data-lucide="search"></i>
            <input type="text" id="busca-propriedade" placeholder="Buscar por nome, município, proprietário…" title="Busca por nome, município, proprietário, CAR ou CCIR" autocomplete="off" aria-label="Buscar propriedade" />
            <span class="lp-busca-fim">
              <button type="button" class="lp-busca-limpar" id="busca-limpar" aria-label="Limpar busca"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
              <kbd class="lp-kbd" title="Atalho: pressione / para buscar">/</kbd>
            </span>
          </label>
          <button type="button" class="lp-btn-primario" id="btn-abrir-modal-propriedade" title="Nova propriedade" aria-label="Nova propriedade">
            <i data-lucide="plus" class="w-4 h-4"></i>
            Nova propriedade
          </button>
        </div>
      </div>

      <!-- Tabela Principal de Propriedades (lp-card, NÃO ui-card: ver guia de listagem §8) -->
      <div class="lp-card">
        <div class="lp-wrap overflow-x-auto overflow-y-auto flex-1 min-h-0">
          <table class="lp-tabela">
            <thead>
              <tr>
                <th class="lp-col-check"><ui-checkbox id="check-all-propriedades"></ui-checkbox></th>
                <th class="lp-ordenavel" data-ordem="nome" aria-sort="ascending" tabindex="0">Imóvel rural<span class="lp-sort-ico"></span></th>
                <th>Proprietário</th>
                <th class="lp-oculta-xl">Documentos</th>
                <th class="lp-ordenavel lp-col-num" data-ordem="vinculos" tabindex="0" title="Matrículas e levantamentos vinculados">Vínculos<span class="lp-sort-ico"></span></th>
                <th class="lp-ordenavel lp-oculta-lg" data-ordem="cadastro" tabindex="0">Cadastro<span class="lp-sort-ico"></span></th>
                <th class="lp-oculta-sm">Situação</th>
                <th class="lp-col-acoes"><span class="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody id="tabela-propriedades-body">
              <!-- Linhas via JS -->
            </tbody>
          </table>

          <!-- Estado vazio / carregando / erro -->
          <div id="tabela-propriedades-status" class="hidden" role="status" aria-live="polite"></div>
        </div>

        <!-- Rodapé / Paginação -->
        <div class="lp-rodape">
          <div class="flex items-center gap-2">
            <span>Linhas por página</span>
            <ui-select id="paginacao-limite" value="25" class="w-16 h-7">
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </ui-select>
            <span id="paginacao-info">Mostrando 0-0 de 0 propriedades</span>
          </div>
          <div class="flex items-center gap-1" id="paginacao-botoes">
            <!-- Botões dinâmicos -->
          </div>
        </div>
      </div>
    </div>

    <!-- BARRA DE AÇÕES EM LOTE FLUTUANTE -->
    <div id="batch-action-bar" class="lp-lote hidden animate-in fade-in slide-in-from-bottom-6 duration-300" role="region" aria-label="Ações em lote">
      <span><b id="batch-selected-count">0</b> selecionada(s)</span>
      <div class="h-4 w-px bg-white/10"></div>
      <div class="flex gap-2">
        <ui-botao variante="destrutivo" id="btn-batch-delete">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          Excluir selecionadas
        </ui-botao>
        <ui-botao variante="secundario" id="btn-batch-cancel">
          Cancelar
        </ui-botao>
      </div>
    </div>

    <!-- MODAL UNIFICADO DE PROPRIEDADE (CADASTRO, EDIÇÃO, ANEXOS, PROPRIETÁRIOS E MATRÍCULAS) -->
    <ui-modal id="modal-propriedade" titulo="Nova Propriedade" tamanho="grande" class="modal-compact-header modal-propriedade-amplo" style="--ui-modal-largura: 900px; max-width: 900px; --ui-modal-padding-x: 20px;">
       <div class="flex flex-col h-full overflow-hidden">
          <!-- Subtítulo e Ações -->
          <div class="px-2 py-1.5 border-b border-white/5 flex justify-between items-center bg-white/[0.01] shrink-0">
             <div class="min-w-0">
                <p class="text-[10px] text-white/40 font-mono leading-none truncate" id="modal-prop-subtitulo">Preencha os dados cadastrais do imóvel rural</p>
             </div>
             <div class="flex items-center gap-1.5 shrink-0">
                <ui-botao variante="destrutivo" class="hidden" id="btn-prop-excluir" title="Excluir Propriedade">
                   <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                   Excluir
                </ui-botao>
                <button type="button" class="hidden" id="btn-fechar-modal-prop"></button>
             </div>
          </div>
          
          <!-- Abas de Navegação -->
          <div class="flex border-b border-white/5 bg-white/[0.01] overflow-x-auto scrollbar-none px-2 shrink-0">
             <button class="px-3 py-2 text-xs font-bold border-b-2 border-mint-vibrant text-mint-vibrant tab-btn-prop whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer" data-tab-prop="tab-prop-dados">
                <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
                Dados Gerais & Anexos
             </button>
             <button class="px-3 py-2 text-xs font-bold border-b-2 border-transparent text-white/40 hover:text-white tab-btn-prop whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer" data-tab-prop="tab-prop-proprietarios" id="tab-btn-proprietarios">
                <i data-lucide="users" class="w-3.5 h-3.5"></i>
                Proprietários
                <span class="ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-mono bg-white/5 text-white/60" id="tab-badge-proprietarios">0</span>
             </button>
             <button class="px-3 py-2 text-xs font-bold border-b-2 border-transparent text-white/40 hover:text-white tab-btn-prop whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer" data-tab-prop="tab-prop-matriculas" id="tab-btn-matriculas">
                <i data-lucide="layers" class="w-3.5 h-3.5"></i>
                Glebas & Matrículas
                <span class="ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-mono bg-white/5 text-white/60" id="tab-badge-matriculas">0</span>
             </button>
          </div>
          
          <!-- Conteúdo com Scroll -->
          <div class="p-4 overflow-y-auto flex-1 space-y-3">
             <!-- ABA 1: DADOS GERAIS & ANEXOS -->
             <div id="tab-prop-dados" class="tab-content-prop space-y-4">
                <!-- Formulário de Dados Cadastrais -->
                <form id="form-propriedade" class="space-y-2.5">
                   <div class="flex items-center justify-between pb-1 border-b border-white/5">
                      <span class="text-[10px] font-bold text-mint-vibrant uppercase tracking-wider">Identificação Cadastral</span>
                      <span class="text-[9px] text-white/30 font-mono">* Campos obrigatórios</span>
                   </div>

                   <div class="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2.5">
                      <div class="col-span-2">
                         <label class="block text-[9px] text-white/50 uppercase font-bold mb-1">Nome da Propriedade *</label>
                         <input type="text" name="nome_propriedade" required class="glass-input w-full text-xs h-8 font-medium" placeholder="Ex: Fazenda Três Barras">
                      </div>
                      <div>
                         <label class="block text-[9px] text-white/50 uppercase font-bold mb-1">Município *</label>
                         <input type="text" name="municipio" required class="glass-input w-full text-xs h-8" placeholder="Ex: Umuarama">
                      </div>
                      <div>
                         <label class="block text-[9px] text-white/50 uppercase font-bold mb-1">UF *</label>
                         <input type="text" name="uf" required maxlength="2" class="glass-input w-full text-xs h-8 uppercase font-mono" placeholder="PR">
                      </div>
                      <div class="col-span-2">
                         <label class="block text-[9px] text-white/50 uppercase font-bold mb-1">Código do CAR</label>
                         <input type="text" name="codigo_car" class="glass-input w-full text-xs h-8 font-mono text-mint-vibrant" placeholder="PR-4128104-58A2...">
                      </div>
                      <div class="col-span-2">
                         <label class="block text-[9px] text-white/50 uppercase font-bold mb-1">Código do CCIR</label>
                         <input type="text" name="codigo_ccir" class="glass-input w-full text-xs h-8 font-mono text-blue-400" placeholder="000.000.000.000-0">
                      </div>
                   </div>

                   <div class="flex justify-end gap-2">
                      <button type="button" class="btn-secondary h-8 text-xs py-0 px-4 cursor-pointer" id="btn-cancelar-prop">Cancelar</button>
                      <button type="submit" class="btn-primary h-8 text-xs py-0 px-5 font-bold cursor-pointer" id="btn-submit-prop">
                         Salvar Alterações
                      </button>
                   </div>
                </form>

                <!-- Seção de Anexos Físicos (CAR & CCIR) -->
                <div id="secao-anexos-propriedade" class="space-y-2 pt-3 border-t border-white/5">
                   <div class="flex items-center justify-between">
                      <span class="text-[10px] font-bold text-mint-vibrant uppercase tracking-wider">Documentos Digitais & Certidões</span>
                      <span class="text-[9px] text-white/30 font-mono">Upload e gestão de arquivos</span>
                   </div>

                   <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <!-- Bloco CAR -->
                      <div class="flex flex-col space-y-1.5">
                         <div class="flex items-center justify-between">
                            <span class="text-[8.5px] font-mono font-bold text-mint-vibrant bg-mint-vibrant/10 px-2 py-0.5 rounded border border-mint-vibrant/20 w-max">DOCUMENTO DO CAR</span>
                         </div>
                         
                         <!-- Área de Upload do CAR -->
                         <div class="border border-dashed border-white/10 hover:border-mint-vibrant/40 rounded px-3 py-2 cursor-pointer transition-colors flex flex-row justify-center items-center gap-2.5 group relative" id="dropzone-car">
                            <input type="file" id="input-file-car" class="hidden" accept=".pdf,.png,.jpg,.jpeg,.dwg" />
                            <i data-lucide="upload" class="w-5 h-5 text-white/40 group-hover:text-mint-vibrant group-hover:scale-110 transition-all shrink-0"></i>
                            <div class="text-left">
                              <p class="text-[10px] font-bold text-white/80">Anexar arquivo do CAR</p>
                            <p class="text-[8px] text-white/30 uppercase mt-0.5">Arraste ou clique para selecionar</p>
                            </div>
                         </div>

                         <div class="hidden flex items-center justify-between p-2 bg-white/[0.02] border border-white/5 rounded text-xs" id="container-anexo-car">
                            <div class="min-w-0 flex-1 flex items-center gap-1.5 pr-2 select-none">
                               <i data-lucide="file-text" class="w-3.5 h-3.5 text-mint-vibrant shrink-0"></i>
                               <span class="truncate font-mono text-[10px] cursor-pointer hover:underline hover:text-mint-vibrant font-bold" id="txt-anexo-car-nome" title="Clique para abrir o documento">Arquivo</span>
                            </div>
                            <div class="flex gap-1 shrink-0">
                               <button class="text-mint-vibrant hover:text-white p-1 hover:bg-mint-vibrant/20 rounded transition-all cursor-pointer" id="btn-download-car" title="Baixar arquivo">
                                  <i data-lucide="download" class="w-3.5 h-3.5"></i>
                               </button>
                               <button class="text-white/40 hover:text-red-400 p-1 hover:bg-red-500/10 rounded transition-all cursor-pointer" id="btn-delete-car" title="Excluir CAR">
                                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                               </button>
                            </div>
                         </div>
                      </div>

                      <!-- Bloco CCIR -->
                      <div class="flex flex-col space-y-1.5">
                         <div class="flex items-center justify-between">
                            <span class="text-[8.5px] font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 w-max">DOCUMENTO DO CCIR</span>
                         </div>
                         
                         <!-- Área de Upload do CCIR -->
                         <div class="border border-dashed border-white/10 hover:border-blue-500/40 rounded px-3 py-2 cursor-pointer transition-colors flex flex-row justify-center items-center gap-2.5 group relative" id="dropzone-ccir">
                            <input type="file" id="input-file-ccir" class="hidden" accept=".pdf,.png,.jpg,.jpeg" />
                            <i data-lucide="upload" class="w-5 h-5 text-white/40 group-hover:text-blue-400 group-hover:scale-110 transition-all shrink-0"></i>
                            <div class="text-left">
                              <p class="text-[10px] font-bold text-white/80">Anexar arquivo do CCIR</p>
                            <p class="text-[8px] text-white/30 uppercase mt-0.5">Arraste ou clique para selecionar</p>
                            </div>
                         </div>

                         <div class="hidden flex items-center justify-between p-2 bg-white/[0.02] border border-white/5 rounded text-xs" id="container-anexo-ccir">
                            <div class="min-w-0 flex-1 flex items-center gap-1.5 pr-2 select-none">
                               <i data-lucide="file-text" class="w-3.5 h-3.5 text-blue-400 shrink-0"></i>
                               <span class="truncate font-mono text-[10px] cursor-pointer hover:underline hover:text-blue-400 font-bold" id="txt-anexo-ccir-nome" title="Clique para abrir o documento">Arquivo</span>
                            </div>
                            <div class="flex gap-1 shrink-0">
                               <button class="text-blue-400 hover:text-white p-1 hover:bg-blue-500/20 rounded transition-all cursor-pointer" id="btn-download-ccir" title="Baixar arquivo">
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
             </div>
             
             <!-- ABA 2: PROPRIETÁRIOS -->
             <div id="tab-prop-proprietarios" class="tab-content-prop hidden space-y-3">
                <!-- Aviso se propriedade for nova -->
                <div id="aviso-proprietarios-nova" class="hidden py-8 text-center">
                   <i data-lucide="info" class="w-7 h-7 text-mint-vibrant/60 mx-auto mb-2"></i>
                   <h4 class="text-xs font-bold text-white">Cadastre a propriedade primeiro</h4>
                   <p class="text-[10px] text-white/40 mt-1 max-w-sm mx-auto">Salve os dados cadastrais na primeira aba para habilitar o vínculo de coproprietários e quotas.</p>
                </div>

                <div id="conteudo-tab-proprietarios" class="space-y-3">
                   <!-- Formulário de vínculo compacto -->
                   <div class="space-y-2.5">
                      <div class="flex items-center justify-between">
                         <h5 class="text-[10px] font-bold text-mint-vibrant uppercase tracking-wider leading-none">Vincular Proprietário</h5>
                         <div id="badge-status-composicao"></div>
                      </div>
                      <form id="form-vincular-proprietario" class="grid grid-cols-1 md:grid-cols-[1fr_140px_auto] gap-3 items-end">
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
                            <input type="number" id="vinc-participacao" min="0.01" max="100" step="0.01" placeholder="Ex: 50.00" required class="glass-input w-full text-xs h-8 font-mono">
                         </div>
                         <button type="submit" class="btn-primary h-8 text-xs font-bold px-5 cursor-pointer whitespace-nowrap" id="btn-submit-vinc-prop">Vincular</button>
                      </form>
                      <div class="flex items-center justify-between text-[9px] text-white/30 font-mono uppercase">
                         <p>Quota Restante Disponível: <span class="text-mint-vibrant font-bold" id="lbl-quota-restante">100.00%</span></p>
                         <p id="lbl-aviso-vinculo-existente" class="text-amber-400 font-bold hidden"></p>
                      </div>
                   </div>

                   <!-- Tabela de Proprietários -->
                   <div class="mt-3 rounded border border-white/5 overflow-hidden">
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
             </div>
             
             <!-- ABA 3: MATRÍCULAS -->
             <div id="tab-prop-matriculas" class="tab-content-prop hidden space-y-3">
                <!-- Aviso se propriedade for nova -->
                <div id="aviso-matriculas-nova" class="hidden py-8 text-center">
                   <i data-lucide="info" class="w-7 h-7 text-mint-vibrant/60 mx-auto mb-2"></i>
                   <h4 class="text-xs font-bold text-white">Cadastre a propriedade primeiro</h4>
                   <p class="text-[10px] text-white/40 mt-1 max-w-sm mx-auto">Salve os dados cadastrais na primeira aba para cadastrar matrículas, glebas e certidões em PDF.</p>
                </div>

                <div id="conteudo-tab-matriculas" class="space-y-3">
                   <!-- Cadastro de Matrícula Compacto -->
                   <div class="space-y-2.5">
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
                         <div class="col-span-2">
                            <label class="block text-[9px] text-white/40 uppercase font-bold mb-1">Desenho Territorial / Gleba Unificada</label>
                            <select id="select-new-mat-origem-desenho" class="glass-input w-full text-xs h-8 bg-[#0c1510] text-white/90">
                               <option value="">Desenho próprio independente (Não unificada)</option>
                            </select>
                         </div>
                         <div class="col-span-2 md:col-span-4 flex justify-end gap-2">
                            <button type="button" class="btn-secondary h-8 text-xs font-bold px-4 hidden cursor-pointer" id="btn-cancelar-edicao-mat">Cancelar</button>
                            <button type="submit" class="btn-primary h-8 text-xs font-bold px-6 cursor-pointer" id="btn-submit-mat">Salvar Matrícula</button>
                         </div>
                      </form>
                   </div>

                   <!-- Tabela de Matrículas -->
                   <div class="rounded border border-white/5 overflow-hidden">
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
    </div>
    </ui-modal>

    <!-- MODAL DE HISTÓRICO DE ALTERAÇÃO DA MATRÍCULA -->
    <ui-modal id="modal-historico-matricula" titulo="Histórico da Matrícula" tamanho="medio">
       <div class="p-4 max-h-[50vh] overflow-y-auto pr-1">
          <div class="det-tabela-wrap">
             <table class="det-tabela det-tabela-sm">
                <thead>
                   <tr>
                      <th>Campo</th>
                      <th>Antigo</th>
                      <th>Novo</th>
                      <th class="text-right">Data/Hora</th>
                   </tr>
                </thead>
                <tbody id="tbl-hist-mat-corpo">
                   <!-- Logs de alteração da matrícula -->
                </tbody>
             </table>
          </div>
       </div>
       <div slot="footer" class="flex justify-end p-2.5 border-t border-white/5">
          <ui-botao variante="secundario" id="btn-fechar-modal-hist-mat" dismiss-modal>Fechar</ui-botao>
       </div>
    </ui-modal>
  `,
  setup: () => {
    initIcons();
    let propriedadeSelecionadaId: number | null = null;
    let todasPropriedades: any[] = [];
    let termoBusca = "";
    let paginaAtual = 1;
    let limitePorPagina = 25;
    let segmentoAtual: SegmentoProp = 'todos';
    let campoOrdem: CampoOrdemProp = 'nome';
    let direcaoOrdem: DirecaoOrdem = 'asc';
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
       const d = val.replace(/\D/g, '').slice(0, 13);
       if (d.length === 13) {
          return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{3})(\d{1})$/, "$1.$2.$3.$4-$5");
       }
       return d;
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

    // --- MODAL UNIFICADO E ABAS ---
    const modalPropriedade = document.getElementById('modal-propriedade') as any;
    const modalHistMat = document.getElementById('modal-historico-matricula') as any;

    const abrirModalPropriedadeEl = () => {
       if (modalPropriedade?.abrir) modalPropriedade.abrir();
       else modalPropriedade?.classList.remove('hidden');
    };

    const fecharModalPropriedade = () => {
       if (modalPropriedade?.fechar) modalPropriedade.fechar();
       else modalPropriedade?.classList.add('hidden');
       propriedadeSelecionadaId = null;
    };

    const abrirModalHistMat = () => {
       if (modalHistMat?.abrir) modalHistMat.abrir();
       else modalHistMat?.classList.remove('hidden');
    };

    const fecharModalHistMat = () => {
       if (modalHistMat?.fechar) modalHistMat.fechar();
       else modalHistMat?.classList.add('hidden');
    };

    const ativarAba = (targetTab: string) => {
       document.querySelectorAll('.tab-btn-prop').forEach(btn => {
          const isTarget = btn.getAttribute('data-tab-prop') === targetTab;
          if (isTarget) {
             btn.classList.add('border-mint-vibrant', 'text-mint-vibrant');
             btn.classList.remove('border-transparent', 'text-white/40');
          } else {
             btn.classList.remove('border-mint-vibrant', 'text-mint-vibrant');
             btn.classList.add('border-transparent', 'text-white/40');
          }
       });
       document.querySelectorAll('.tab-content-prop').forEach(tc => {
          if (tc.id === targetTab) {
             tc.classList.remove('hidden');
          } else {
             tc.classList.add('hidden');
          }
       });
       initIcons();
    };

    document.querySelectorAll('.tab-btn-prop').forEach(btn => {
       btn.addEventListener('click', (e) => {
          const targetTab = (e.currentTarget as HTMLElement).getAttribute('data-tab-prop');
          if (targetTab) ativarAba(targetTab);
       });
    });



    document.getElementById('btn-fechar-modal-prop')?.addEventListener('click', fecharModalPropriedade);
    document.getElementById('btn-cancelar-prop')?.addEventListener('click', fecharModalPropriedade);
    document.getElementById('btn-fechar-modal-hist-mat')?.addEventListener('click', fecharModalHistMat);

    document.getElementById('btn-abrir-modal-propriedade')?.addEventListener('click', () => {
       abrirModalPropriedade(null);
    });

    document.getElementById('btn-prop-excluir')?.addEventListener('click', () => {
       if (propriedadeSelecionadaId) {
          excluirPropriedadeIndividual(propriedadeSelecionadaId);
       }
    });

    const handleKeyDownModal = (e: KeyboardEvent) => {
       if (e.key === 'Escape') {
          if (modalHistMat && (modalHistMat.aberto || !modalHistMat.classList.contains('hidden'))) {
             fecharModalHistMat();
             return;
          }
          if (modalPropriedade && (modalPropriedade.aberto || !modalPropriedade.classList.contains('hidden'))) {
             fecharModalPropriedade();
          }
       }
    };
    keydownHandlerModal = handleKeyDownModal;
    document.addEventListener('keydown', keydownHandlerModal);

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
       if (!(await customConfirm(`ATENÇÃO: A exclusão destas ${count} propriedades selecionadas removerá de forma definitiva os vínculos de proprietários e as matrículas. Propriedades com levantamentos não serão excluídas. Deseja continuar?`))) return;
       
       const bar = document.getElementById('batch-action-bar');
       if (bar) bar.style.cursor = 'wait';

       try {
          const promises = Array.from(propriedadesSelecionadas).map(id =>
             fetch(`${API_BASE}/propriedades/${id}`, { method: 'DELETE' }).then(lerRespostaApi)
          );
          const results = await Promise.all(promises);
          
          const errors = results.filter(r => r.error);
          if (errors.length > 0) {
             customAlert(`Algumas exclusões falharam: ${errors.map(e => e.error).join(', ')}`);
          } else {
             showToast("Propriedades selecionadas excluídas com sucesso.", "success");
          }
          
          propriedadesSelecionadas.clear();
          updateBatchActionBar();
          loadPropriedades();
       } catch (e) {
          showToast("Erro ao excluir propriedades selecionadas.", "error");
       } finally {
          if (bar) bar.style.cursor = '';
       }
    });

    // --- FILTROS, BUSCA E ORDENAÇÃO ---
    // Pipeline único: segmento -> busca -> ordenação -> página
    const getPropriedadesOrdenadas = (): any[] =>
       ordenarPropriedades(filtrarPropriedades(filtrarPorSegmentoProp(todasPropriedades, segmentoAtual), termoBusca), campoOrdem, direcaoOrdem);

    const getPropriedadesPaginaAtual = (): any[] => {
       const inicio = (paginaAtual - 1) * limitePorPagina;
       return getPropriedadesOrdenadas().slice(inicio, inicio + limitePorPagina);
    };

    // Seleção só vale para o que está na tela: excluir "selecionadas" fora do filtro é perigoso
    const podarSelecaoFiltrada = () => {
       const idsVisiveis = new Set(getPropriedadesOrdenadas().map(p => p.id));
       Array.from(propriedadesSelecionadas).forEach(id => { if (!idsVisiveis.has(id)) propriedadesSelecionadas.delete(id); });
    };

    let timeoutBuscaProp: ReturnType<typeof setTimeout>;
    const buscaInputProp = document.getElementById('busca-propriedade') as HTMLInputElement | null;
    const buscaWrap = document.getElementById('busca-wrap');
    const handleBuscaProp = () => {
       buscaWrap?.classList.toggle('tem-valor', (buscaInputProp?.value || '').length > 0);
       clearTimeout(timeoutBuscaProp);
       timeoutBuscaProp = setTimeout(() => {
          termoBusca = buscaInputProp?.value || '';
          paginaAtual = 1;
          podarSelecaoFiltrada();
          renderTabela();
       }, 250);
    };
    buscaInputProp?.addEventListener('input', handleBuscaProp);

    const limparBusca = () => {
       if (!buscaInputProp) return;
       buscaInputProp.value = '';
       buscaWrap?.classList.remove('tem-valor');
       clearTimeout(timeoutBuscaProp);
       termoBusca = '';
       paginaAtual = 1;
       renderTabela();
    };
    document.getElementById('busca-limpar')?.addEventListener('click', () => { limparBusca(); buscaInputProp?.focus(); });
    buscaInputProp?.addEventListener('keydown', (e: KeyboardEvent) => {
       if (e.key === 'Escape') { limparBusca(); buscaInputProp.blur(); }
    });

    // Atalho "/" foca a busca (ignorado ao digitar em outro campo)
    atalhoBuscaProp = (e: KeyboardEvent) => {
       if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
       const alvo = e.target as HTMLElement | null;
       if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable)) return;
       e.preventDefault();
       buscaInputProp?.focus();
    };
    document.addEventListener('keydown', atalhoBuscaProp);

    // Segmentos
    document.getElementById('seg-propriedades')?.addEventListener('click', (e: MouseEvent) => {
       const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-seg]');
       if (!btn) return;
       segmentoAtual = (btn.getAttribute('data-seg') as SegmentoProp) || 'todos';
       paginaAtual = 1;
       podarSelecaoFiltrada();
       renderTabela();
    });

    // Ordenação por cabeçalho (clique ou Enter/Espaço); clicar de novo inverte a direção
    const alternarOrdem = (th: HTMLElement) => {
       const campo = th.getAttribute('data-ordem') as CampoOrdemProp | null;
       if (!campo) return;
       if (campo === campoOrdem) direcaoOrdem = direcaoOrdem === 'asc' ? 'desc' : 'asc';
       else { campoOrdem = campo; direcaoOrdem = campo === 'nome' ? 'asc' : 'desc'; }
       paginaAtual = 1;
       renderTabela();
    };
    document.querySelectorAll<HTMLElement>('.lp-tabela th[data-ordem]').forEach(th => {
       th.addEventListener('click', () => alternarOrdem(th));
       th.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternarOrdem(th); }
       });
    });

    const selectPaginacaoProp = document.getElementById('paginacao-limite');
    const handlePaginacaoChange = (e: Event) => {
       const customEv = e as CustomEvent<{ id?: string }>;
       const val = customEv.detail?.id || (e.target as HTMLSelectElement).value;
       if (val) {
          limitePorPagina = parseInt(val, 10);
          paginaAtual = 1;
          renderTabela();
       }
    };
    selectPaginacaoProp?.addEventListener('change', handlePaginacaoChange);
    selectPaginacaoProp?.addEventListener('ui-selecionar', handlePaginacaoChange);

    // --- RENDERIZAÇÃO DA TABELA ---
    const renderEstadoVazio = (statusDiv: HTMLElement, semCadastro: boolean) => {
       statusDiv.classList.remove('hidden');
       statusDiv.innerHTML = semCadastro
          ? `<div class="lp-estado">
               <div class="lp-estado-ico"><i data-lucide="home"></i></div>
               <div class="lp-estado-titulo">Nenhuma propriedade cadastrada</div>
               <div class="lp-estado-txt">Cadastre um imóvel rural para vincular proprietários, matrículas e levantamentos.</div>
               <button type="button" class="lp-btn-primario" data-estado-acao="novo"><i data-lucide="plus" class="w-4 h-4"></i>Nova propriedade</button>
             </div>`
          : `<div class="lp-estado">
               <div class="lp-estado-ico"><i data-lucide="search"></i></div>
               <div class="lp-estado-titulo">Nenhuma propriedade encontrada</div>
               <div class="lp-estado-txt">Nada corresponde à busca ou ao filtro aplicado.</div>
               <button type="button" class="lp-btn-sec" data-estado-acao="limpar">Limpar busca e filtros</button>
             </div>`;
    };

    // Chips de segmento (contagem sobre a lista inteira) e indicador de ordenação nos cabeçalhos
    const atualizarCabecalhoLista = () => {
       const contagem = contarSegmentosProp(todasPropriedades);
       (Object.keys(contagem) as SegmentoProp[]).forEach(seg => {
          const n = document.getElementById(`seg-n-${seg}`);
          if (n) { n.innerText = String(contagem[seg]); n.classList.toggle('is-zero', contagem[seg] === 0); }
       });
       document.querySelectorAll<HTMLElement>('#seg-propriedades [data-seg]').forEach(btn => {
          const ativo = btn.getAttribute('data-seg') === segmentoAtual;
          btn.classList.toggle('is-active', ativo);
          btn.setAttribute('aria-pressed', String(ativo));
       });
       document.querySelectorAll<HTMLElement>('.lp-tabela th[data-ordem]').forEach(th => {
          if (th.getAttribute('data-ordem') === campoOrdem) th.setAttribute('aria-sort', direcaoOrdem === 'asc' ? 'ascending' : 'descending');
          else th.removeAttribute('aria-sort');
       });
    };

    const renderTabela = () => {
       const body = document.getElementById('tabela-propriedades-body');
       const statusDiv = document.getElementById('tabela-propriedades-status');
       const info = document.getElementById('paginacao-info');
       const botoes = document.getElementById('paginacao-botoes');
       if (!body) return;

       atualizarCabecalhoLista();

       const total = getPropriedadesOrdenadas().length;
       const totalPaginas = Math.ceil(total / limitePorPagina);
       if (paginaAtual > totalPaginas) paginaAtual = Math.max(1, totalPaginas);

       const visiveis = getPropriedadesPaginaAtual();

       if (total === 0) {
          body.innerHTML = '';
          if (statusDiv) renderEstadoVazio(statusDiv, todasPropriedades.length === 0);
          if (info) info.innerText = "Mostrando 0-0 de 0 propriedades";
          if (botoes) botoes.innerHTML = '';
          initIcons();
          updateBatchActionBar();
          return;
       }

       statusDiv?.classList.add('hidden');
       body.innerHTML = renderLinhasPropHtml(visiveis, propriedadesSelecionadas);

       const inicioItem = (paginaAtual - 1) * limitePorPagina + 1;
       const fimItem = Math.min(paginaAtual * limitePorPagina, total);
       if (info) info.innerText = `Mostrando ${inicioItem}-${fimItem} de ${total} propriedades`;
       if (botoes) botoes.innerHTML = renderBotoesPaginacaoHtml(paginaAtual, totalPaginas);

       initIcons();

       // Atualiza Checkbox Master
       const checkAll = document.getElementById('check-all-propriedades') as any;
       if (checkAll) {
          const todosSel = visiveis.length > 0 && visiveis.every(p => propriedadesSelecionadas.has(p.id));
          const algumSel = visiveis.some(p => propriedadesSelecionadas.has(p.id)) && !todosSel;
          if ('marcado' in checkAll) checkAll.marcado = todosSel;
          else checkAll.checked = todosSel;
          if ('indeterminado' in checkAll) checkAll.indeterminado = algumSel;
          else checkAll.indeterminate = algumSel;
       }

       updateBatchActionBar();
    };

    // Delegação de eventos da tabela: seleção, ações, linha inteira e teclado
    const bodyTabelaProp = document.getElementById('tabela-propriedades-body');
    bodyTabelaProp?.addEventListener('change', (e: Event) => {
       const check = (e.target as HTMLElement).closest<HTMLInputElement>('.check-propriedade');
       if (!check) return;
       const id = parseInt(check.getAttribute('data-id') || '0');
       if (check.checked) propriedadesSelecionadas.add(id);
       else propriedadesSelecionadas.delete(id);
       updateBatchActionBar();
       renderTabela();
    });
    bodyTabelaProp?.addEventListener('click', (e: MouseEvent) => {
       const alvo = e.target as HTMLElement;
       const btn = alvo.closest<HTMLElement>('.btn-action');
       if (btn) {
          const id = parseInt(btn.getAttribute('data-id') || '0');
          if (!id) return;
          if (btn.getAttribute('data-action') === 'editar') abrirModalPropriedade(id, 'tab-prop-dados');
          else if (btn.getAttribute('data-action') === 'excluir') excluirPropriedadeIndividual(id);
          return;
       }
       if (alvo.closest('.lp-col-check')) return;
       const linhaId = parseInt(alvo.closest<HTMLElement>('tr[data-id]')?.getAttribute('data-id') || '0');
       if (linhaId) abrirModalPropriedade(linhaId, 'tab-prop-dados');
    });
    bodyTabelaProp?.addEventListener('keydown', (e: KeyboardEvent) => {
       if (e.key !== 'Enter' || !(e.target as HTMLElement).matches('tr[data-id]')) return;
       const linhaId = parseInt((e.target as HTMLElement).getAttribute('data-id') || '0');
       if (linhaId) abrirModalPropriedade(linhaId, 'tab-prop-dados');
    });

    // Ações do estado vazio (cadastrar / limpar filtros)
    document.getElementById('tabela-propriedades-status')?.addEventListener('click', (e: MouseEvent) => {
       const acao = (e.target as HTMLElement).closest<HTMLElement>('[data-estado-acao]')?.getAttribute('data-estado-acao');
       if (acao === 'novo') document.getElementById('btn-abrir-modal-propriedade')?.click();
       else if (acao === 'limpar') { segmentoAtual = 'todos'; limparBusca(); }
    });

    // Paginação
    document.getElementById('paginacao-botoes')?.addEventListener('click', (e: MouseEvent) => {
       const alvo = (e.target as HTMLElement).closest<HTMLElement>('.btn-page');
       const pagina = parseInt(alvo?.getAttribute('data-page') || '0');
       if (pagina) { paginaAtual = pagina; renderTabela(); }
    });

    // Checkbox Master
    const checkAllPropEl = document.getElementById('check-all-propriedades');
    const handleCheckAllProps = (e: Event) => {
       const check = e.target as any;
       const isChecked = check.marcado ?? check.checked ?? false;
       const visiveis = getPropriedadesPaginaAtual();
       if (isChecked) {
          visiveis.forEach(p => propriedadesSelecionadas.add(p.id));
       } else {
          visiveis.forEach(p => propriedadesSelecionadas.delete(p.id));
       }
       updateBatchActionBar();
       renderTabela();
    };
    checkAllPropEl?.addEventListener('change', handleCheckAllProps);
    checkAllPropEl?.addEventListener('ui-change', handleCheckAllProps);

    // --- CARREGAR DADOS GERAIS ---
    const mostrarErroLista = (statusDiv: HTMLElement | null, mensagem: string) => {
       if (!statusDiv) return;
       statusDiv.classList.remove('hidden');
       statusDiv.innerHTML = `<div class="lp-estado"><div class="lp-estado-ico"><i data-lucide="alert-triangle"></i></div><div class="lp-estado-titulo">${escapeHtml(mensagem)}</div><div class="lp-estado-txt">Não foi possível carregar as propriedades.</div><button type="button" class="lp-btn-sec" id="btn-recarregar-prop">Tentar novamente</button></div>`;
       document.getElementById('btn-recarregar-prop')?.addEventListener('click', () => { loadPropriedades(); });
       initIcons();
    };

    const loadPropriedades = () => {
       const body = document.getElementById('tabela-propriedades-body');
       const statusDiv = document.getElementById('tabela-propriedades-status');
       
       if (!body) return Promise.resolve();

       statusDiv?.classList.add('hidden');
       body.innerHTML = Array.from({ length: 8 }, () => '<tr><td colspan="8" class="!p-0"><div class="lp-skel"></div></td></tr>').join('');

       return fetch(`${API_BASE}/propriedades`)
          .then(res => res.json())
          .then(data => {
             if (data.error) {
                body.innerHTML = '';
                mostrarErroLista(statusDiv, `Erro: ${data.error}`);
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
             body.innerHTML = '';
             mostrarErroLista(statusDiv, 'Erro de conexão com o servidor.');
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
                <div class="opcao-vinc-item p-2 hover:bg-mint-vibrant/10 cursor-pointer text-xs transition-colors flex flex-col" data-id="${c.id}" data-nome="${escapeHtml(c.nome_completo)}">
                   <span class="font-bold text-white">${escapeHtml(c.nome_completo)}</span>
                   <span class="text-[9px] text-white/40 font-mono mt-0.5">Doc: ${escapeHtml(c.cpf_cnpj)}</span>
                </div>
             `).join('');

             listaFlutuante.querySelectorAll('.opcao-vinc-item').forEach(item => {
                item.addEventListener('click', () => {
                   const selId = item.getAttribute('data-id') || '';
                   inputBusca.value = item.getAttribute('data-nome') || '';
                   inputHidden.value = selId;
                   listaFlutuante.classList.add('hidden');

                   const pAtual = todasPropriedades.find(x => String(x.id) === String(propriedadeSelecionadaId));
                   const proprietarioExistente = pAtual?.clientes?.find((c: any) => String(c.id) === String(selId));
                   const avisoExistente = document.getElementById('lbl-aviso-vinculo-existente');
                   const btnSubmit = document.getElementById('btn-submit-vinc-prop');
                   const inputPart = document.getElementById('vinc-participacao') as HTMLInputElement;

                   if (proprietarioExistente) {
                      if (inputPart) inputPart.value = String(proprietarioExistente.percentual_participacao || '');
                      if (avisoExistente) {
                         avisoExistente.innerText = `⚠ Cliente já vinculado (${(proprietarioExistente.percentual_participacao || 0).toFixed(2)}%) — o valor será atualizado`;
                         avisoExistente.classList.remove('hidden');
                      }
                      if (btnSubmit) btnSubmit.innerText = 'Atualizar Participação';
                   } else {
                      if (avisoExistente) avisoExistente.classList.add('hidden');
                      if (btnSubmit) btnSubmit.innerText = 'Vincular Proprietário';
                   }
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

       clickOutsideHandlerClientes = (e: MouseEvent) => {
          if (!inputBusca.contains(e.target as Node) && !listaFlutuante.contains(e.target as Node)) {
             listaFlutuante.classList.add('hidden');
          }
       };
       document.addEventListener('click', clickOutsideHandlerClientes);
    };

    // --- GESTÃO DO MODAL UNIFICADO DE PROPRIEDADE ---
    const abrirModalPropriedade = (id: number | null, abaInicial: string = 'tab-prop-dados') => {
       propriedadeSelecionadaId = id;

       const modalTitulo = document.getElementById('modal-prop-titulo');
       const modalSubtitulo = document.getElementById('modal-prop-subtitulo');
       const submitBtn = document.getElementById('btn-submit-prop');
       const btnExcluir = document.getElementById('btn-prop-excluir');
       const secaoAnexos = document.getElementById('secao-anexos-propriedade');
       const avisoProp = document.getElementById('aviso-proprietarios-nova');
       const conteudoProp = document.getElementById('conteudo-tab-proprietarios');
       const avisoMat = document.getElementById('aviso-matriculas-nova');
       const conteudoMat = document.getElementById('conteudo-tab-matriculas');
       const badgeProp = document.getElementById('tab-badge-proprietarios');
       const badgeMat = document.getElementById('tab-badge-matriculas');

       resetaFormularioMatricula();

       if (id === null) {
          // Novo Cadastro
          formProp?.reset();
          if (modalTitulo) modalTitulo.innerText = "Nova Propriedade";
          if (modalSubtitulo) modalSubtitulo.innerText = "Preencha os dados cadastrais do imóvel rural";
          if (submitBtn) submitBtn.innerText = "Cadastrar Propriedade";
          btnExcluir?.classList.add('hidden');
          secaoAnexos?.classList.add('hidden');

          avisoProp?.classList.remove('hidden');
          conteudoProp?.classList.add('hidden');
          avisoMat?.classList.remove('hidden');
          conteudoMat?.classList.add('hidden');

          if (badgeProp) badgeProp.innerText = '0';
          if (badgeMat) badgeMat.innerText = '0';

          ativarAba('tab-prop-dados');
       } else {
          // Edição / Detalhes de Propriedade Existente
          const p = todasPropriedades.find(x => String(x.id) === String(id));
          if (!p) return;

          if (modalTitulo) modalTitulo.innerText = p.nome_propriedade;
          if (modalSubtitulo) modalSubtitulo.innerText = `${p.municipio} / ${p.uf} • Cadastro ID: #${p.id}`;
          if (submitBtn) submitBtn.innerText = "Salvar Alterações";
          btnExcluir?.classList.remove('hidden');
          secaoAnexos?.classList.remove('hidden');

          avisoProp?.classList.add('hidden');
          conteudoProp?.classList.remove('hidden');
          avisoMat?.classList.add('hidden');
          conteudoMat?.classList.remove('hidden');

          const setFormVal = (name: string, val: string) => {
             const input = formProp.querySelector(`[name="${name}"]`) as HTMLInputElement;
             if (input) input.value = val || '';
          };
          setFormVal('nome_propriedade', p.nome_propriedade);
          setFormVal('codigo_car', p.codigo_car ? formatarCAR(p.codigo_car) : '');
          setFormVal('codigo_ccir', p.codigo_ccir ? formatarCCIR(p.codigo_ccir) : '');
          setFormVal('municipio', p.municipio);
          setFormVal('uf', p.uf);

          if (badgeProp) badgeProp.innerText = String((p.clientes || []).length);
          if (badgeMat) badgeMat.innerText = String(p.total_matriculas || 0);

          configurarExibicaoArquivo('car', p.caminho_arquivo_car);
          configurarExibicaoArquivo('ccir', p.caminho_arquivo_ccir);

          renderProprietariosTabela(p.clientes || []);
          loadMatriculasDaPropriedade(id);

          ativarAba(abaInicial);
       }

       abrirModalPropriedadeEl();
       initIcons();
    };

    (window as any).abrirModalPropriedade = (id: number | null, aba?: string) => abrirModalPropriedade(id, aba);
    (window as any).abrirDetalhesPropriedade = (id: number) => abrirModalPropriedade(id, 'tab-prop-dados');
    (window as any).abrirEdicaoPropriedade = (id: number) => abrirModalPropriedade(id, 'tab-prop-dados');

    // --- DELEÇÃO DE ANEXO DE PROPRIEDADE ---
    const excluirArquivoPropriedade = async (tipo: 'car' | 'ccir') => {
       if (!propriedadeSelecionadaId) return;
       if (!(await customConfirm(`Deseja realmente excluir o arquivo de certidão do ${tipo.toUpperCase()} anexado?`))) return;

       try {
          const res = await fetch(`${API_BASE}/propriedades/${propriedadeSelecionadaId}/arquivo-${tipo}`, {
             method: 'DELETE'
          });
          const data = await lerRespostaApi(res);
          if (data.error) {
             customAlert(data.error);
          } else {
             showToast("Arquivo removido com sucesso.", "success");
             // Recarrega propriedade
             const propRes = await fetch(`${API_BASE}/propriedades`);
             todasPropriedades = await propRes.json();
             const pAtual = todasPropriedades.find(x => String(x.id) === String(propriedadeSelecionadaId));
             configurarExibicaoArquivo(tipo, pAtual ? pAtual[`caminho_arquivo_${tipo}`] : null);
             renderTabela();
          }
       } catch (err) {
          showToast("Erro de conexão ao remover o arquivo.", "error");
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
          textNome.title = "Clique para abrir o documento";
          
          textNome.onclick = () => window.open(`${API_BASE}/propriedades/${propriedadeSelecionadaId}/arquivo-${tipo}`, '_blank');
          btnDownload.title = "Baixar arquivo";
          btnDownload.onclick = () => window.open(`${API_BASE}/propriedades/${propriedadeSelecionadaId}/arquivo-${tipo}?download=true`, '_blank');
       } else {
          dropzone.classList.remove('hidden');
          containerAnexo.classList.add('hidden');
          textNome.innerText = '';
          textNome.title = '';
          textNome.onclick = null;
          btnDownload.onclick = null;
       }
    };

    // --- TABELA DE PROPRIETÁRIOS VINCULADOS ---
    const renderProprietariosTabela = (clientes: any[]) => {
       const corpo = document.getElementById('tbl-prop-proprietarios-corpo');
       const lblQuota = document.getElementById('lbl-quota-restante');
       const lblSoma = document.getElementById('lbl-soma-participacao-total');
       const badgeStatus = document.getElementById('badge-status-composicao');
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
                   <td class="px-3 py-1.5 font-bold text-white">${escapeHtml(c.nome_completo)}</td>
                   <td class="px-3 py-1.5 font-mono text-white/60">${escapeHtml(c.cpf_cnpj)}</td>
                   <td class="px-3 py-1.5 text-right font-mono text-mint-vibrant font-bold">${(c.percentual_participacao || 0).toFixed(2)}%</td>
                   <td class="px-3 py-1.5 text-center">
                      <div class="flex items-center justify-center gap-1.5">
                         <button class="text-white/40 hover:text-mint-vibrant p-1 btn-editar-vinculo cursor-pointer transition-colors" data-cli-id="${c.id}" data-cli-nome="${escapeHtml(c.nome_completo)}" data-cli-part="${c.percentual_participacao || 0}" title="Editar Participação">
                            <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                         </button>
                         <button class="text-white/40 hover:text-red-400 p-1 btn-remover-vinculo cursor-pointer transition-colors" data-cli-id="${c.id}" title="Desvincular Proprietário">
                            <i data-lucide="x" class="w-3.5 h-3.5"></i>
                         </button>
                      </div>
                   </td>
                </tr>
             `;
          }).join('');

          initIcons();

          corpo.querySelectorAll('.btn-editar-vinculo').forEach(btn => {
             btn.addEventListener('click', () => {
                const cliId = btn.getAttribute('data-cli-id') || '';
                const cliNome = btn.getAttribute('data-cli-nome') || '';
                const cliPart = btn.getAttribute('data-cli-part') || '';

                const inputBusca = document.getElementById('busca-proprietario-cliente') as HTMLInputElement;
                const inputHidden = document.getElementById('vinc-cliente-id') as HTMLInputElement;
                const inputPart = document.getElementById('vinc-participacao') as HTMLInputElement;
                const avisoExistente = document.getElementById('lbl-aviso-vinculo-existente');
                const btnSubmit = document.getElementById('btn-submit-vinc-prop');

                if (inputBusca) inputBusca.value = cliNome;
                if (inputHidden) inputHidden.value = cliId;
                if (inputPart) {
                   inputPart.value = cliPart;
                   inputPart.focus();
                   inputPart.select();
                }
                if (avisoExistente) {
                   avisoExistente.innerText = `Editando participação de ${cliNome} (${parseFloat(cliPart || '0').toFixed(2)}%)`;
                   avisoExistente.classList.remove('hidden');
                }
                if (btnSubmit) btnSubmit.innerText = 'Atualizar Participação';

                showToast(`Editando participação de ${cliNome}. Ajuste a porcentagem e confirme.`, "info");
             });
          });

          corpo.querySelectorAll('.btn-remover-vinculo').forEach(btn => {
             btn.addEventListener('click', async () => {
                const cliId = btn.getAttribute('data-cli-id');
                if (await customConfirm("Tem certeza que deseja remover a vinculação de copropriedade deste cliente?")) {
                   try {
                      const res = await fetch(`${API_BASE}/propriedades/${propriedadeSelecionadaId}/clientes/${cliId}`, { method: 'DELETE' });
                      const data = await lerRespostaApi(res);
                      if (data.error) {
                         customAlert(data.error);
                      } else {
                         showToast("Vínculo removido com sucesso.", "success");
                         const propRes = await fetch(`${API_BASE}/propriedades`);
                         todasPropriedades = await propRes.json();
                         const pAtual = todasPropriedades.find(x => String(x.id) === String(propriedadeSelecionadaId));
                         renderProprietariosTabela(pAtual ? pAtual.clientes || [] : []);
                         renderTabela();
                         const badgeProp = document.getElementById('badge-prop-proprietarios-count');
                         if (badgeProp && pAtual) badgeProp.innerText = String((pAtual.clientes || []).length);
                      }
                   } catch (err) {
                      showToast("Erro ao remover proprietário.", "error");
                   }
                }
             });
          });
       }

       const quotaDisponivel = Math.max(0, 100 - somaParticipacao);
       lblQuota.innerText = `${quotaDisponivel.toFixed(2)}%`;
       if (lblSoma) lblSoma.innerText = `${somaParticipacao.toFixed(2)}%`;

       if (badgeStatus) {
          if (Math.abs(somaParticipacao - 100.0) <= 0.01) {
             badgeStatus.className = "px-2.5 py-1 rounded text-[10px] font-bold font-mono tracking-tight bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/20 w-fit";
             badgeStatus.innerHTML = "✓ Composição Completa (100.00%)";
          } else if (somaParticipacao > 100.01) {
             badgeStatus.className = "px-2.5 py-1 rounded text-[10px] font-bold font-mono tracking-tight bg-rose-500/10 text-rose-400 border border-rose-500/20 w-fit";
             badgeStatus.innerHTML = `❌ Quota Excedida (${somaParticipacao.toFixed(2)}%)`;
          } else {
             badgeStatus.className = "px-2.5 py-1 rounded text-[10px] font-bold font-mono tracking-tight bg-amber-500/10 text-amber-400 border border-amber-500/20 w-fit";
             badgeStatus.innerHTML = `⚠ Incompleto (${somaParticipacao.toFixed(2)}%) — Restam ${quotaDisponivel.toFixed(2)}%`;
          }
       }
    };

    // --- CARREGAR MATRÍCULAS ---
    const loadMatriculasDaPropriedade = async (propId: number) => {
       const corpo = document.getElementById('tbl-prop-matriculas-corpo');
       if (!corpo) return;

       corpo.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-white/30 italic">Carregando glebas...</td></tr>';

       try {
          const res = await fetch(`${API_BASE}/propriedades/${propId}/matriculas`);
          const matriculas = await lerRespostaApi(res);

          if (matriculas.error) {
             corpo.innerHTML = `<tr><td colspan="5" class="text-center py-5 text-red-400">${matriculas.error}</td></tr>`;
             return;
          }

          matriculasCache = Array.isArray(matriculas) ? matriculas : [];
          atualizarSelectOrigemDesenho(matriculaSendoEditadaId);

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
                      <a href="${API_BASE}/matriculas/${m.id}/download-pdf" target="_blank" class="text-mint-vibrant hover:text-white transition-colors p-1" title="Ver Certidão PDF (${escapeHtml(pdfName)})">
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

             // Gleba unificada: indica a matrícula que fornece o desenho ou as que o utilizam
             let desenhoHtml = '';
             if (m.matricula_origem_desenho_id) {
                const origem = matriculasCache.find(x => String(x.id) === String(m.matricula_origem_desenho_id));
                desenhoHtml = `<span class="block text-[9px] text-blue-400">🔗 Usa o desenho da matrícula nº ${escapeHtml(String(origem ? origem.numero_matricula : m.matricula_origem_desenho_id))}</span>`;
             } else {
                const derivadas = matriculasCache.filter(x => String(x.matricula_origem_desenho_id) === String(m.id));
                if (derivadas.length > 0) {
                   desenhoHtml = `<span class="block text-[9px] text-blue-400">🔗 Desenho compartilhado com nº ${derivadas.map(d => escapeHtml(String(d.numero_matricula))).join(', ')}</span>`;
                }
             }

             const pAtual = todasPropriedades.find(x => String(x.id) === String(propriedadeSelecionadaId));
             const fallbackCcir = pAtual ? pAtual.codigo_ccir : null;
             const displayCcir = m.ccir ? escapeHtml(formatarCCIR(m.ccir)) : (fallbackCcir ? escapeHtml(formatarCCIR(fallbackCcir)) : 'N/A');

             return `
                <tr class="hover:bg-white/[0.01] border-b border-white/5 text-xs text-white/80">
                   <td class="px-3 py-1.5 text-white">
                      <span class="block font-bold">Matrícula nº ${escapeHtml(String(m.numero_matricula))}</span>
                      <span class="block text-[9px] text-white/40">${escapeHtml(m.denominacao) || 'Lote sem nome'}</span>
                      ${desenhoHtml}
                   </td>
                   <td class="px-3 py-1.5 text-right font-mono text-white/90 font-medium">${areaFormatada} ha</td>
                   <td class="px-3 py-1.5 text-white/60 leading-tight">
                      <span class="block">CCIR: ${displayCcir}</span>
                      <span class="block">ITR/NIRF: ${escapeHtml(m.itr) || 'N/A'} ${m.valor_itr ? `(R$ ${m.valor_itr.toLocaleString('pt-BR', {minimumFractionDigits: 2})})` : ''}</span>
                      <span class="block text-[9px] text-mint-vibrant truncate font-mono max-w-[170px]" title="${escapeHtml(m.georreferenciamento) || ''}">SIGEF: ${m.georreferenciamento ? 'Sim' : 'Não'}</span>
                   </td>
                   <td class="px-3 py-1.5 text-center">${pdfHtml}</td>
                   <td class="px-3 py-1.5 text-right">
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
          const data = await lerRespostaApi(res);
          if (data.error) {
             customAlert(data.error);
          } else {
             showToast("Certidão em PDF anexada à matrícula com sucesso!", "success");
             loadMatriculasDaPropriedade(propriedadeSelecionadaId!);
          }
       } catch (err) {
          showToast("Erro de conexão ao enviar o PDF da matrícula.", "error");
       }
    };

    (window as any).excluirPdfMatricula = async (mid: number) => {
       if (!(await customConfirm("Deseja realmente remover o arquivo PDF da certidão desta matrícula?"))) return;

       try {
          const res = await fetch(`${API_BASE}/matriculas/${mid}/pdf`, {
             method: 'DELETE'
          });
          const data = await lerRespostaApi(res);
          if (data.error) {
             customAlert(data.error);
          } else {
             showToast("PDF removido com sucesso.", "success");
             loadMatriculasDaPropriedade(propriedadeSelecionadaId!);
          }
       } catch (err) {
          showToast("Erro de conexão ao remover o PDF.", "error");
       }
    };

    // --- HISTÓRICO DE AUDITORIA DA MATRÍCULA ---
    (window as any).abrirHistoricoMatricula = async (mid: number) => {
       const m = matriculasCache.find(x => String(x.id) === String(mid));
       if (!m) return;

       const tit = document.getElementById('modal-hist-mat-titulo');
       if (tit) tit.innerText = `Histórico de Alterações - Matrícula nº ${m.numero_matricula}`;

       const corpoHist = document.getElementById('tbl-hist-mat-corpo');
       if (corpoHist) corpoHist.innerHTML = '<tr><td colspan="4" class="det-vazio text-center py-3">Carregando histórico...</td></tr>';

       abrirModalHistMat();

       try {
          const res = await fetch(`${API_BASE}/matriculas/${mid}/historico`);
          const logs = await res.json();

          if (corpoHist) {
             if (Array.isArray(logs) && logs.length > 0) {
                corpoHist.innerHTML = logs.map(l => {
                   const dataFormatada = formatarDataHoraUtc(l.data_alteracao);
                   return `
                      <tr class="hover:bg-white/[0.01]">
                         <td class="font-medium text-white/80">${escapeHtml(l.campo_alterado)}</td>
                         <td class="text-red-400 font-mono truncate max-w-[120px]" title="${escapeHtml(l.valor_antigo || '')}">${escapeHtml(l.valor_antigo || '-')}</td>
                         <td class="text-mint-vibrant font-mono truncate max-w-[120px]" title="${escapeHtml(l.valor_novo || '')}">${escapeHtml(l.valor_novo || '-')}</td>
                         <td class="text-right text-white/40 font-mono">${dataFormatada}</td>
                      </tr>
                   `;
                }).join('');
             } else {
                corpoHist.innerHTML = '<tr><td colspan="4" class="det-vazio text-center py-3">Nenhum log gravado para esta matrícula.</td></tr>';
             }
          }
       } catch (e) {
          if (corpoHist) corpoHist.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-red-400">Falha ao obter histórico.</td></tr>';
       }
    };

    const atualizarSelectOrigemDesenho = (matriculaAtualId?: number | null, valorPreSelecionado?: string | number | null) => {
       const select = document.getElementById('select-new-mat-origem-desenho') as HTMLSelectElement;
       if (!select) return;
       let html = `<option value="">Desenho próprio independente (Não unificada)</option>`;
       matriculasCache.forEach(m => {
          if (matriculaAtualId && String(m.id) === String(matriculaAtualId)) return;
          html += `<option value="${m.id}">🔗 Usa o desenho da Matrícula nº ${escapeHtml(String(m.numero_matricula))} (${escapeHtml(String(m.denominacao || 'Lote sem nome'))})</option>`;
       });
       select.innerHTML = html;
       select.value = (valorPreSelecionado !== undefined && valorPreSelecionado !== null) ? String(valorPreSelecionado) : '';
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
       atualizarSelectOrigemDesenho(null, '');

       const formTitulo = document.getElementById('form-matricula-titulo');
       if (formTitulo) formTitulo.innerText = "Cadastrar Gleba / Matrícula";

       const btnSub = document.getElementById('btn-submit-mat');
       if (btnSub) btnSub.innerText = "Salvar Matrícula";

       document.getElementById('btn-cancelar-edicao-mat')?.classList.add('hidden');
    };

    const btnCancel = document.getElementById('btn-cancelar-edicao-mat');
    if (btnCancel) {
       btnCancel.removeEventListener('click', resetaFormularioMatricula);
       btnCancel.addEventListener('click', resetaFormularioMatricula);
    }

    (window as any).abrirEdicaoMatricula = (mid: number) => {
       const m = matriculasCache.find(x => String(x.id) === String(mid));
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
       atualizarSelectOrigemDesenho(mid, m.matricula_origem_desenho_id);

       const formTitulo = document.getElementById('form-matricula-titulo');
       if (formTitulo) formTitulo.innerText = "Editar Gleba / Matrícula";

       const btnSub = document.getElementById('btn-submit-mat');
       if (btnSub) btnSub.innerText = "Salvar Alterações";

       document.getElementById('btn-cancelar-edicao-mat')?.classList.remove('hidden');
    };

    (window as any).excluirMatriculaIndividual = async (mid: number) => {
       if (await customConfirm("ATENÇÃO: A exclusão da matrícula removerá em cascata todos os vértices e limites vinculados. Deseja prosseguir com a exclusão jurídica?")) {
          try {
             const deleteRes = await fetch(`${API_BASE}/matriculas/${mid}`, { method: 'DELETE' });
             const deleteData = await lerRespostaApi(deleteRes);
             if (deleteData.error) {
                customAlert(deleteData.error);
             } else {
                showToast("Matrícula excluída com sucesso.", "success");
                if (matriculaSendoEditadaId === mid) {
                   resetaFormularioMatricula();
                }
                loadMatriculasDaPropriedade(propriedadeSelecionadaId!);
                const propRes = await fetch(`${API_BASE}/propriedades`);
                todasPropriedades = await propRes.json();
                renderTabela();
             }
          } catch (err) {
             showToast("Erro ao excluir matrícula.", "error");
          }
       }
    };

    document.getElementById('form-cadastrar-matricula-prop')?.addEventListener('submit', async (e) => {
       e.preventDefault();
       const numero_matricula = (document.getElementById('input-new-mat-numero') as HTMLInputElement).value.trim();
       const denominacao = (document.getElementById('input-new-mat-denominacao') as HTMLInputElement).value.trim();
       
       // Números no formato brasileiro: "1.234,5678" -> 1234.5678 (ponto de milhar só é removido quando há vírgula)
       const paraNumero = (texto: string): number => {
          const limpo = texto.trim().replace(/\s/g, '');
          return parseFloat(limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo);
       };

       const area_raw = (document.getElementById('input-new-mat-area') as HTMLInputElement).value.trim();
       const area_ha = paraNumero(area_raw);
       
       const ccir = (document.getElementById('input-new-mat-ccir') as HTMLInputElement).value.trim();
       const itr = (document.getElementById('input-new-mat-itr') as HTMLInputElement).value.trim();
       const raw_valor = (document.getElementById('input-new-mat-valor-itr') as HTMLInputElement).value;
       const valor_itr = raw_valor.trim() ? paraNumero(raw_valor) : null;
       const georreferenciamento = (document.getElementById('input-new-mat-georreferenciamento') as HTMLInputElement).value.trim();
       const origem_raw = (document.getElementById('select-new-mat-origem-desenho') as HTMLSelectElement)?.value;
       const matricula_origem_desenho_id = origem_raw ? parseInt(origem_raw) : null;

       const faltando: string[] = [];
       if (!numero_matricula) faltando.push('número da matrícula');
       if (!denominacao) faltando.push('denominação');
       if (isNaN(area_ha)) faltando.push('área (ha)');
       if (faltando.length > 0) {
          customAlert(`Preencha: ${faltando.join(', ')}.`);
          return;
       }
       if (valor_itr !== null && isNaN(valor_itr)) {
          customAlert('Valor do ITR inválido.');
          return;
       }

       try {
          const url = matriculaSendoEditadaId ? `${API_BASE}/matriculas/${matriculaSendoEditadaId}` : `${API_BASE}/propriedades/${propriedadeSelecionadaId}/matriculas`;
          const method = matriculaSendoEditadaId ? 'PUT' : 'POST';

          const res = await fetch(url, {
             method: method,
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ numero_matricula, ccir, itr, area_ha, valor_itr, denominacao, georreferenciamento, matricula_origem_desenho_id })
          });
          const data = await lerRespostaApi(res);
          if (data.error) {
             customAlert(data.error);
          } else {
             showToast("Dados da matrícula salvos com sucesso.", "success");
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
          showToast("Erro ao salvar dados da matrícula.", "error");
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
          const data = await lerRespostaApi(res);
          if (data.error) {
             customAlert(data.error);
          } else {
             showToast("Proprietário vinculado com sucesso.", "success");
             (document.getElementById('busca-proprietario-cliente') as HTMLInputElement).value = '';
             (document.getElementById('vinc-cliente-id') as HTMLInputElement).value = '';
             (document.getElementById('vinc-participacao') as HTMLInputElement).value = '';
             const avisoExistente = document.getElementById('lbl-aviso-vinculo-existente');
             if (avisoExistente) avisoExistente.classList.add('hidden');
             const btnSubmit = document.getElementById('btn-submit-vinc-prop');
             if (btnSubmit) btnSubmit.innerText = 'Vincular Proprietário';

             // Recarrega
             const propRes = await fetch(`${API_BASE}/propriedades`);
             todasPropriedades = await propRes.json();
             const pAtual = todasPropriedades.find(x => String(x.id) === String(propriedadeSelecionadaId));
             renderProprietariosTabela(pAtual ? pAtual.clientes || [] : []);
             renderTabela();
             const badgeProp = document.getElementById('badge-prop-proprietarios-count');
             if (badgeProp && pAtual) badgeProp.innerText = String((pAtual.clientes || []).length);
          }
       } catch (err) {
          showToast("Erro de conexão ao vincular proprietário.", "error");
       }
    });

    // --- SUBMIT DE CADASTRO/EDIÇÃO DE PROPRIEDADE ---
    formProp?.addEventListener('submit', async (e) => {
       e.preventDefault();
       const formData = new FormData(e.target as HTMLFormElement);
       const payload = Object.fromEntries(formData.entries());

       const submitBtn = document.getElementById('btn-submit-prop') as HTMLButtonElement;
       if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.style.opacity = '0.7';
       }

       try {
          const url = propriedadeSelecionadaId ? `${API_BASE}/propriedades/${propriedadeSelecionadaId}` : `${API_BASE}/propriedades`;
          const method = propriedadeSelecionadaId ? 'PUT' : 'POST';

          const res = await fetch(url, {
             method: method,
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify(payload)
          });

          const data = await lerRespostaApi(res);
          if (data.error) {
             customAlert(data.error);
          } else {
             const idFinal = propriedadeSelecionadaId || data.id;
             showToast(propriedadeSelecionadaId ? "Propriedade atualizada com sucesso." : "Propriedade cadastrada com sucesso.", "success");
             
             await loadPropriedades();
             
             if (idFinal) {
                abrirModalPropriedade(idFinal, 'tab-prop-dados');
             } else {
                fecharModalPropriedade();
             }
          }
       } catch (err) {
          showToast("Erro de conexão ao salvar propriedade.", "error");
       } finally {
          if (submitBtn) {
             submitBtn.disabled = false;
             submitBtn.style.opacity = '';
          }
       }
    });

    // --- EXCLUSÃO DE PROPRIEDADE ---
    const excluirPropriedadeIndividual = async (id: number) => {
       const p = todasPropriedades.find(x => String(x.id) === String(id));
       if (!p || !(await customConfirm(`Tem certeza absoluta que deseja excluir a propriedade "${p.nome_propriedade}"? Isso apagará todas as matrículas e vínculos de proprietários de forma definitiva.`))) return;

       try {
          const res = await fetch(`${API_BASE}/propriedades/${id}`, { method: 'DELETE' });
          const data = await lerRespostaApi(res);
          if (data.error) customAlert(data.error);
          else {
             showToast("Propriedade excluída com sucesso.", "success");
             fecharModalPropriedade();
             propriedadesSelecionadas.delete(id);
             updateBatchActionBar();
             loadPropriedades();
          }
       } catch (err) {
          showToast("Erro ao excluir propriedade.", "error");
       }
    };

    (window as any).excluirPropriedadeIndividual = excluirPropriedadeIndividual;

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
             const data = await lerRespostaApi(res);
             if (data.error) {
                customAlert(`Erro ao fazer upload do ${tipo.toUpperCase()}: ${data.error}`);
             } else {
                showToast(`Documento do ${tipo.toUpperCase()} enviado com sucesso!`, "success");
                const propRes = await fetch(`${API_BASE}/propriedades`);
                todasPropriedades = await propRes.json();
                
                const pAtual = todasPropriedades.find(x => String(x.id) === String(propriedadeSelecionadaId));
                configurarExibicaoArquivo(tipo, pAtual ? pAtual[`caminho_arquivo_${tipo}`] : null);
             }
          } catch (err) {
             showToast("Erro de conexão com o servidor no upload.", "error");
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
  },
  cleanup: () => {
    if (atalhoBuscaProp) {
      document.removeEventListener('keydown', atalhoBuscaProp);
      atalhoBuscaProp = null;
    }
    if (clickOutsideHandlerClientes) {
      document.removeEventListener('click', clickOutsideHandlerClientes);
      clickOutsideHandlerClientes = null;
    }
    if (keydownHandlerModal) {
      document.removeEventListener('keydown', keydownHandlerModal);
      keydownHandlerModal = null;
    }
  }
};
