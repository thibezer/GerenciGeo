import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { initIcons, showToast, customConfirm, customAlert } from '../utils';
import { realtimeSyncClient } from '../utils/realtime_sync_client';
import {
  aplicarMascaraCPF,
  validarCPF,
  filtrarProfissionais,
  renderLinhasProfissionais,
  renderLinhasBancoPontos,
  type Profissional
} from './configuracoes/configuracoes_helpers';

let atalhoBuscaCfg: ((e: KeyboardEvent) => void) | null = null;
let escModalBanco: ((e: KeyboardEvent) => void) | null = null;

export const configuracoesRoute: RouteDef = {
  render: () => `
    <div class="gap-2 animate-in fade-in duration-300 select-text flex flex-col h-full min-h-0 flex-1">
      <!-- Barra superior (padrão de listagem): título + total + busca + ação primária -->
      <div class="lp-bar">
        <div class="lp-bar-left">
          <h2 class="lp-titulo" title="Parâmetros globais e cadastro de Responsáveis Técnicos do GerenciGeo">Configurações</h2>
          <span class="lp-tag lp-tag-pf" id="cfg-prof-count" title="Responsáveis técnicos cadastrados">0 profissionais</span>
        </div>
        <div class="lp-bar-right">
          <label class="lp-busca" id="busca-wrap" style="width:clamp(170px,18vw,320px)">
            <i data-lucide="search"></i>
            <input type="text" id="busca-profissional" placeholder="Buscar profissional" autocomplete="off" aria-label="Buscar profissional" />
            <span class="lp-busca-fim">
              <button type="button" class="lp-busca-limpar" id="busca-limpar" aria-label="Limpar busca"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
              <kbd class="lp-kbd" title="Atalho: pressione / para buscar">/</kbd>
            </span>
          </label>
          <button type="button" id="btn-novo-profissional" class="lp-btn-primario">
            <i data-lucide="user-plus" class="w-4 h-4"></i>
            Adicionar profissional
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-2 flex-1 min-h-0 overflow-y-auto lg:overflow-visible">
        <!-- Esquerda: responsáveis técnicos (tabela que rola por dentro) -->
        <div class="lp-card lg:min-h-0" style="min-height:280px">
          <div class="lp-card-titulo"><i data-lucide="users"></i>Responsáveis técnicos cadastrados</div>
          <div class="lp-wrap overflow-x-auto overflow-y-auto flex-1 min-h-0">
            <table class="lp-tabela">
              <thead>
                <tr>
                  <th>Responsável</th>
                  <th class="lp-oculta-md">Conselho / registro</th>
                  <th class="lp-oculta-lg">CPF</th>
                  <th>Cód. INCRA</th>
                  <th class="lp-col-num lp-oculta-sm" title="Vértices homologados (M + P + V)">Vértices</th>
                  <th class="lp-col-acoes" style="width:120px"><span class="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody id="profissionais-lista-container"></tbody>
            </table>
            <div id="profissionais-status" class="hidden" role="status" aria-live="polite"></div>
          </div>
          <div class="lp-rodape"><span id="cfg-rodape">Carregando profissionais...</span><span class="lp-muted" style="font-size:11px">Clique na linha para editar</span></div>
        </div>

        <!-- Direita: formulário (quando aberto), nuvem e ajuda — rola por dentro -->
        <div class="flex flex-col gap-2 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
          <div class="lp-card hidden" id="card-profissional-form" style="flex:none;overflow:visible">
            <div class="lp-card-titulo" id="form-prof-titulo" style="color:var(--lp-accent)"><i data-lucide="user-plus"></i>Cadastrar novo profissional</div>
            <form id="form-profissional" class="flex flex-col gap-2.5 select-text" style="padding:12px">
              <input type="hidden" id="input-prof-id" value="" />

              <label class="lp-campo"><span>Nome completo *</span>
                <input type="text" id="input-prof-nome" required placeholder="Ex: Eng. João da Silva" />
              </label>

              <div class="grid grid-cols-2 gap-2">
                <label class="lp-campo"><span>Formação técnica *</span>
                  <input type="text" id="input-prof-formacao" required placeholder="Ex: Engenheiro Agrônomo" />
                </label>
                <label class="lp-campo"><span>Nacionalidade</span>
                  <input type="text" id="input-prof-nacionalidade" placeholder="Ex: brasileiro(a)" value="brasileiro(a)" />
                </label>
              </div>

              <div class="grid grid-cols-2 gap-2">
                <label class="lp-campo"><span>CPF *</span>
                  <input type="text" id="input-prof-cpf" required class="lp-mono" placeholder="000.000.000-00" inputmode="numeric" />
                  <span id="cpf-validation-msg" class="hidden" style="color:var(--lp-danger);letter-spacing:.06em">CPF inválido</span>
                </label>
                <label class="lp-campo"><span>RG *</span>
                  <input type="text" id="input-prof-rg" required class="lp-mono" placeholder="Ex: 12.345.678-9" />
                </label>
              </div>

              <div class="grid grid-cols-2 gap-2">
                <label class="lp-campo"><span>Conselho *</span>
                  <input type="text" id="input-prof-conselho" required style="text-transform:uppercase" placeholder="Ex: CFTA ou CREA" />
                </label>
                <label class="lp-campo"><span>Registro *</span>
                  <input type="text" id="input-prof-registro" required class="lp-mono" style="text-transform:uppercase" placeholder="Ex: CFTA-PR-12345" />
                </label>
              </div>

              <label class="lp-campo"><span>Código credenciado INCRA *</span>
                <input type="text" id="input-prof-codigo" required class="lp-mono" style="text-transform:uppercase" placeholder="Ex: ABCD" />
              </label>
              <label class="lp-campo"><span>Endereço residencial</span>
                <input type="text" id="input-prof-endereco-res" placeholder="Rua, número, bairro, cidade - UF" />
              </label>
              <label class="lp-campo"><span>Endereço comercial (profissional)</span>
                <input type="text" id="input-prof-endereco" placeholder="Av. Brasil, 1500, Paranavaí - PR" />
              </label>

              <div class="flex justify-end gap-2 pt-2" style="border-top:1px solid var(--lp-line)">
                <button type="button" id="btn-cancelar-prof" class="lp-btn-sec">Cancelar</button>
                <button type="submit" id="btn-salvar-prof" class="lp-btn-primario">
                  <i data-lucide="save" class="w-4 h-4"></i>
                  Salvar
                </button>
              </div>
            </form>
          </div>

          <!-- Sincronização com a Nuvem -->
          <div class="lp-card" style="flex:none;overflow:visible">
            <div class="lp-card-titulo"><i data-lucide="cloud"></i>Sincronização com a nuvem</div>
            <div class="flex flex-col gap-2" style="padding:12px">
              <p class="lp-sub" style="font-size:12.5px;line-height:1.5">Status da conexão em tempo real com a Nuvem GerenciGeo. Clique para entrar, sincronizar manualmente ou pausar.</p>
              <button id="btn-global-sync-pill" type="button" class="btn-abrir-nuvem w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-mint-vibrant/30 transition-all cursor-pointer group" title="Sincronização em Tempo Real com a Nuvem">
                <span class="flex items-center gap-2.5">
                  <span id="sync-pill-dot" class="w-2 h-2 rounded-full bg-slate-400"></span>
                  <span id="sync-pill-text" class="font-mono text-xs text-white/80 group-hover:text-white font-medium">Nuvem</span>
                </span>
                <span id="sync-pill-badge" class="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-white/10 text-white/50">Verificando...</span>
              </button>
            </div>
          </div>

          <!-- Instruções técnicas (recolhidas por padrão) -->
          <details class="lp-aviso" style="border-color:var(--lp-line-strong);background:rgba(255,255,255,.02)">
            <summary style="color:var(--lp-text-2)"><i data-lucide="info" class="w-4 h-4" style="color:var(--lp-accent)"></i>Instruções técnicas</summary>
            <div class="lp-aviso-corpo lp-sub" style="font-size:12.5px;line-height:1.55;max-height:none">
              <p>O Responsável Técnico é o profissional que assinará os laudos de faixa de fronteira, cartas de anuência de confrontação e requerimentos imobiliários do sistema GerenciGeo.</p>
              <p style="margin-top:8px">Certifique-se de preencher o <strong>Registro CREA/CFTA</strong> e o <strong>Código Credenciado INCRA</strong> corretamente para evitar erros de consistência nos templates HTML oficiais das matrículas.</p>
            </div>
          </details>
        </div>
      </div>

      <!-- MODAL BANCO DE PONTOS DO PROFISSIONAL -->
      <div id="modal-banco-pontos" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
         <div class="glass-card w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
            <div class="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02] shrink-0">
               <h3 class="text-lg font-bold flex items-center gap-2">
                  <i data-lucide="shield" class="text-mint-vibrant"></i>
                  Banco de Vértices & Numeração INCRA: <span id="txt-banco-prof-nome" class="text-mint-vibrant">-</span>
               </h3>
               <button class="text-white/40 hover:text-white" id="btn-fechar-modal-banco" type="button">
                  <i data-lucide="x" class="w-5 h-5"></i>
               </button>
            </div>
            
            <div class="p-6 overflow-y-auto space-y-6 flex-1 text-xs select-text">
               <!-- Bloco 1: Estatísticas Rápidas de Sequencial e Lacunas -->
               <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <!-- Marcos (M) -->
                  <div class="bg-[#0c1510]/40 border border-white/5 p-4 rounded-xl space-y-3">
                     <div class="flex justify-between items-center border-b border-white/5 pb-1">
                        <span class="font-bold text-white uppercase tracking-wider font-mono">1. Marcos (M)</span>
                        <span class="text-[9px] bg-mint-vibrant/10 text-mint-vibrant px-1.5 py-0.5 rounded-full font-mono font-bold" id="est-m-total">0 Usados</span>
                     </div>
                     <div class="space-y-1 font-mono text-[11px]">
                        <p><strong>Último Usado:</strong> <span class="text-white font-bold" id="est-m-ultimo">-</span></p>
                        <p><strong>Próximo Sugerido:</strong> <span class="text-mint-vibrant font-bold" id="est-m-proximo">-</span></p>
                        <p class="pt-1.5 border-t border-white/5 text-[9px] text-white/40">
                           <strong>Lacunas/Pulados:</strong> <span class="text-yellow-400 break-words" id="est-m-lacunas">Nenhuma</span>
                        </p>
                     </div>
                  </div>
                  
                  <!-- Pontos (P) -->
                  <div class="bg-[#0c1510]/40 border border-white/5 p-4 rounded-xl space-y-3">
                     <div class="flex justify-between items-center border-b border-white/5 pb-1">
                        <span class="font-bold text-white uppercase tracking-wider font-mono">2. Pontos (P)</span>
                        <span class="text-[9px] bg-mint-vibrant/10 text-mint-vibrant px-1.5 py-0.5 rounded-full font-mono font-bold" id="est-p-total">0 Usados</span>
                     </div>
                     <div class="space-y-1 font-mono text-[11px]">
                        <p><strong>Último Usado:</strong> <span class="text-white font-bold" id="est-p-ultimo">-</span></p>
                        <p><strong>Próximo Sugerido:</strong> <span class="text-mint-vibrant font-bold" id="est-p-proximo">-</span></p>
                        <p class="pt-1.5 border-t border-white/5 text-[9px] text-white/40">
                           <strong>Lacunas/Pulados:</strong> <span class="text-yellow-400 break-words" id="est-p-lacunas">Nenhuma</span>
                        </p>
                     </div>
                  </div>
                  
                  <!-- Virtuais (V) -->
                  <div class="bg-[#0c1510]/40 border border-white/5 p-4 rounded-xl space-y-3">
                     <div class="flex justify-between items-center border-b border-white/5 pb-1">
                        <span class="font-bold text-white uppercase tracking-wider font-mono">3. Virtuais (V)</span>
                        <span class="text-[9px] bg-mint-vibrant/10 text-mint-vibrant px-1.5 py-0.5 rounded-full font-mono font-bold" id="est-v-total">0 Usados</span>
                     </div>
                     <div class="space-y-1 font-mono text-[11px]">
                        <p><strong>Último Usado:</strong> <span class="text-white font-bold" id="est-v-ultimo">-</span></p>
                        <p><strong>Próximo Sugerido:</strong> <span class="text-mint-vibrant font-bold" id="est-v-proximo">-</span></p>
                        <p class="pt-1.5 border-t border-white/5 text-[9px] text-white/40">
                           <strong>Lacunas/Pulados:</strong> <span class="text-yellow-400 break-words" id="est-v-lacunas">Nenhuma</span>
                        </p>
                     </div>
                  </div>
               </div>
               
               <!-- Bloco 2: Tabela de Histórico de Uso -->
               <div class="space-y-3">
                  <span class="block text-[10px] font-bold text-white/40 uppercase tracking-wider border-b border-white/5 pb-1">Registro Detalhado de Vértices Homologados</span>
                  <div class="overflow-x-auto border border-white/5 rounded-technical max-h-[300px] overflow-y-auto">
                     <table class="w-full text-left border-collapse">
                        <thead>
                           <tr class="bg-white/5 text-[9px] font-bold uppercase tracking-widest text-white/30 border-b border-white/5 sticky top-0 z-10">
                              <th class="px-4 py-2.5">Código Completo</th>
                              <th class="px-4 py-2.5">Tipo</th>
                              <th class="px-4 py-2.5 text-right">Número</th>
                              <th class="px-4 py-2.5">Projeto Vinculado</th>
                              <th class="px-4 py-2.5">Data Homologação</th>
                           </tr>
                        </thead>
                        <tbody id="tbl-banco-pontos-corpo" class="text-xs divide-y divide-white/5 text-white/80 font-sans font-normal">
                           <tr>
                              <td colspan="5" class="px-4 py-8 text-center text-white/30">Nenhum ponto registrado no banco de dados.</td>
                           </tr>
                        </tbody>
                     </table>
                  </div>
               </div>
            </div>
            
            <div class="p-6 border-t border-white/5 flex justify-end shrink-0 bg-white/[0.01]">
               <button type="button" class="btn-secondary text-xs" id="btn-fechar-modal-banco-rod">Fechar Banco de Pontos</button>
            </div>
         </div>
      </div>
    </div>
  `,
  setup: () => {
    initIcons();
    realtimeSyncClient.renderizarStatus();
    const listContainer = document.getElementById('profissionais-lista-container');
    const status = document.getElementById('profissionais-status');
    const formCard = document.getElementById('card-profissional-form');
    const btnNovo = document.getElementById('btn-novo-profissional');
    const btnCancel = document.getElementById('btn-cancelar-prof');
    const formProf = document.getElementById('form-profissional') as HTMLFormElement;
    const formTitulo = document.getElementById('form-prof-titulo');

    const inputId = document.getElementById('input-prof-id') as HTMLInputElement;
    const inputNome = document.getElementById('input-prof-nome') as HTMLInputElement;
    const inputRegistro = document.getElementById('input-prof-registro') as HTMLInputElement;
    const inputCodigo = document.getElementById('input-prof-codigo') as HTMLInputElement;
    const inputEndereco = document.getElementById('input-prof-endereco') as HTMLInputElement;
    const inputFormacao = document.getElementById('input-prof-formacao') as HTMLInputElement;
    const inputNacionalidade = document.getElementById('input-prof-nacionalidade') as HTMLInputElement;
    const inputCpf = document.getElementById('input-prof-cpf') as HTMLInputElement;
    const inputRg = document.getElementById('input-prof-rg') as HTMLInputElement;
    const inputConselho = document.getElementById('input-prof-conselho') as HTMLInputElement;
    const inputEnderecoRes = document.getElementById('input-prof-endereco-res') as HTMLInputElement;
    const msgCpf = document.getElementById('cpf-validation-msg');

    let profissionais: Profissional[] = [];
    let termo = '';

    const CLASSES_INVALIDO = ['border-red-500/50', 'bg-red-500/5', 'text-red-200'];
    const marcarCpf = (invalido: boolean) => {
      CLASSES_INVALIDO.forEach(c => inputCpf.classList.toggle(c, invalido));
      msgCpf?.classList.toggle('hidden', !invalido);
    };
    // Só avalia com os 11 dígitos digitados: antes disso não há o que reclamar
    const avaliarCpf = () => marcarCpf(inputCpf.value.replace(/\D/g, '').length === 11 && !validarCPF(inputCpf.value));

    inputCpf?.addEventListener('input', () => {
      inputCpf.value = aplicarMascaraCPF(inputCpf.value);
      avaliarCpf();
    });

    // --- LISTA ---
    const getVisiveis = (): Profissional[] => filtrarProfissionais(profissionais, termo);

    const renderProfissionais = () => {
      if (!listContainer) return;
      const visiveis = getVisiveis();
      const contador = document.getElementById('cfg-prof-count');
      if (contador) contador.innerText = `${profissionais.length} profissiona${profissionais.length === 1 ? 'l' : 'is'}`;
      const rodape = document.getElementById('cfg-rodape');
      if (rodape) rodape.innerText = `Mostrando ${visiveis.length} de ${profissionais.length} profissional(is)`;

      if (visiveis.length === 0) {
        listContainer.innerHTML = '';
        if (status) {
          status.classList.remove('hidden');
          status.innerHTML = profissionais.length === 0
            ? `<div class="lp-estado"><div class="lp-estado-ico"><i data-lucide="users"></i></div><div class="lp-estado-titulo">Nenhum profissional cadastrado</div><div class="lp-estado-txt">O responsável técnico assina laudos, anuências e requerimentos.</div><button type="button" class="lp-btn-primario" data-estado-acao="novo"><i data-lucide="user-plus" class="w-4 h-4"></i>Adicionar profissional</button></div>`
            : `<div class="lp-estado"><div class="lp-estado-ico"><i data-lucide="search"></i></div><div class="lp-estado-titulo">Nenhum profissional encontrado</div><div class="lp-estado-txt">Nada corresponde à busca.</div><button type="button" class="lp-btn-sec" data-estado-acao="limpar">Limpar busca</button></div>`;
        }
      } else {
        status?.classList.add('hidden');
        listContainer.innerHTML = renderLinhasProfissionais(visiveis);
      }
      initIcons();
    };

    const loadProfissionais = async () => {
      if (listContainer) listContainer.innerHTML = Array.from({ length: 4 }, () => '<tr><td colspan="6" class="!p-0"><div class="lp-skel"></div></td></tr>').join('');
      status?.classList.add('hidden');
      try {
        const res = await fetch(`${API_BASE}/profissionais`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        profissionais = Array.isArray(data) ? data : [];
        renderProfissionais();
      } catch (err) {
        console.error(err);
        if (listContainer) listContainer.innerHTML = '';
        if (status) {
          status.classList.remove('hidden');
          status.innerHTML = `<div class="lp-estado"><div class="lp-estado-ico"><i data-lucide="alert-triangle"></i></div><div class="lp-estado-titulo">Falha ao carregar profissionais</div><button type="button" class="lp-btn-sec" id="btn-recarregar-prof">Tentar novamente</button></div>`;
          document.getElementById('btn-recarregar-prof')?.addEventListener('click', loadProfissionais);
          initIcons();
        }
      }
    };

    // --- FORMULÁRIO ---
    const resetForm = () => {
      formProf.reset();
      inputId.value = '';
      inputNacionalidade.value = 'brasileiro(a)';
      marcarCpf(false);
      if (formTitulo) formTitulo.innerHTML = `<i data-lucide="user-plus"></i>Cadastrar novo profissional`;
      initIcons();
    };

    const abrirForm = () => {
      formCard?.classList.remove('hidden');
      formCard?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      inputNome.focus();
    };

    btnNovo?.addEventListener('click', () => { resetForm(); abrirForm(); });
    btnCancel?.addEventListener('click', () => { formCard?.classList.add('hidden'); resetForm(); });

    const editarProfissional = (id: number) => {
      const p = profissionais.find(x => x.id === id);
      if (!p) return;
      inputId.value = String(p.id);
      inputNome.value = p.nome || '';
      inputRegistro.value = p.registro || '';
      inputCodigo.value = p.codigo_credenciado || '';
      inputEndereco.value = p.endereco || '';
      inputFormacao.value = p.formacao || '';
      inputNacionalidade.value = p.nacionalidade || 'brasileiro(a)';
      inputCpf.value = aplicarMascaraCPF(p.cpf || '');
      inputRg.value = p.rg || '';
      inputConselho.value = p.conselho || '';
      inputEnderecoRes.value = p.endereco_residencial || '';
      avaliarCpf();
      if (formTitulo) formTitulo.innerHTML = `<i data-lucide="edit"></i>Editar cadastro técnico`;
      initIcons();
      abrirForm();
    };

    formProf?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cpf = inputCpf.value.trim();
      const profId = inputId.value;

      if (cpf && !validarCPF(cpf)) {
        marcarCpf(true);
        inputCpf.focus();
        showToast('O CPF informado para o responsável técnico é inválido.', 'error');
        return;
      }

      const payload = {
        nome: inputNome.value.trim(),
        registro: inputRegistro.value.trim(),
        codigo_credenciado: inputCodigo.value.trim(),
        endereco: inputEndereco.value.trim(),
        formacao: inputFormacao.value.trim(),
        nacionalidade: inputNacionalidade.value.trim(),
        cpf,
        rg: inputRg.value.trim(),
        conselho: inputConselho.value.trim(),
        endereco_residencial: inputEnderecoRes.value.trim()
      };

      const btnSalvar = document.getElementById('btn-salvar-prof') as HTMLButtonElement | null;
      if (btnSalvar) btnSalvar.disabled = true;
      try {
        const res = await fetch(profId ? `${API_BASE}/profissionais/${profId}` : `${API_BASE}/profissionais`, {
          method: profId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.error || (data.detail && typeof data.detail === 'string')) {
          showToast(`Erro ao salvar profissional: ${data.error || data.detail}`, 'error');
        } else {
          showToast(data.message || 'Profissional salvo com sucesso!', 'success');
          formCard?.classList.add('hidden');
          resetForm();
          loadProfissionais();
        }
      } catch (err) {
        console.error(err);
        showToast('Erro de comunicação com a API.', 'error');
      } finally {
        if (btnSalvar) btnSalvar.disabled = false;
      }
    });

    const excluirProfissional = async (id: number) => {
      const p = profissionais.find(x => x.id === id);
      if (!p) return;
      if (!(await customConfirm(`Deseja realmente remover o cadastro do profissional ${p.nome}? Esta ação é irreversível.`))) return;
      try {
        const res = await fetch(`${API_BASE}/profissionais/${p.id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.error) {
          customAlert(`Aviso de segurança: ${data.error}`);
        } else {
          showToast('Profissional removido com sucesso!', 'success');
          loadProfissionais();
        }
      } catch (err) {
        console.error(err);
        showToast('Erro de comunicação com a API.', 'error');
      }
    };

    // --- BANCO DE PONTOS ---
    const modalBanco = document.getElementById('modal-banco-pontos');
    const fecharModalBanco = () => modalBanco?.classList.add('hidden');
    document.getElementById('btn-fechar-modal-banco')?.addEventListener('click', fecharModalBanco);
    document.getElementById('btn-fechar-modal-banco-rod')?.addEventListener('click', fecharModalBanco);
    escModalBanco = (e: KeyboardEvent) => { if (e.key === 'Escape') fecharModalBanco(); };
    document.addEventListener('keydown', escModalBanco);

    const verBancoPontos = async (id: number) => {
      const p = profissionais.find(x => x.id === id);
      if (!p) return;

      const txtNome = document.getElementById('txt-banco-prof-nome');
      if (txtNome) txtNome.innerText = p.nome;

      ['m', 'p', 'v'].forEach(t => {
        const set = (suf: string, v: string) => { const el = document.getElementById(`est-${t}-${suf}`); if (el) el.innerText = v; };
        set('total', 'Carregando...'); set('ultimo', '...'); set('proximo', '...'); set('lacunas', '...');
      });
      const tblCorpo = document.getElementById('tbl-banco-pontos-corpo');
      if (tblCorpo) tblCorpo.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-white/30 animate-pulse">Consultando base de dados...</td></tr>`;

      modalBanco?.classList.remove('hidden');
      initIcons();

      try {
        const res = await fetch(`${API_BASE}/profissionais/${id}/banco-pontos`);
        const data = await res.json();

        if (data && data.estatisticas) {
          ['M', 'P', 'V'].forEach(t => {
            const tl = t.toLowerCase();
            const est = data.estatisticas[t];
            const set = (suf: string, v: string) => { const el = document.getElementById(`est-${tl}-${suf}`); if (el) el.innerText = v; };
            const cod = data.profissional.codigo_credenciado;
            set('total', `${est.total_usados} Usados`);
            set('ultimo', est.ultimo_usado > 0 ? `${cod}-${t}-${String(est.ultimo_usado).padStart(4, '0')}` : 'Nenhum');
            set('proximo', `${cod}-${t}-${String(est.proximo_recomendado).padStart(4, '0')}`);
            set('lacunas', est.lacunas && est.lacunas.length > 0
              ? est.lacunas.map((l: number) => `${t}-${String(l).padStart(4, '0')}`).join(', ')
              : 'Nenhuma');
          });

          const tbody = document.getElementById('tbl-banco-pontos-corpo');
          if (tbody) {
            tbody.innerHTML = !data.pontos || data.pontos.length === 0
              ? `<tr><td colspan="5" class="px-4 py-8 text-center text-white/30">Nenhum ponto registrado no banco de dados para este profissional.</td></tr>`
              : renderLinhasBancoPontos(data.pontos);
          }
        }
      } catch (err) {
        console.error('Erro ao carregar banco de pontos:', err);
        showToast('Erro ao consultar banco de pontos.', 'error');
        fecharModalBanco();
      }
    };

    // --- EVENTOS DA TABELA (delegação): ações, linha inteira e teclado ---
    listContainer?.addEventListener('click', (e: MouseEvent) => {
      const alvo = e.target as HTMLElement;
      const btn = alvo.closest<HTMLElement>('.btn-action');
      if (btn) {
        const id = parseInt(btn.dataset.id || '0', 10);
        if (!id) return;
        if (btn.dataset.action === 'banco') verBancoPontos(id);
        else if (btn.dataset.action === 'editar') editarProfissional(id);
        else if (btn.dataset.action === 'excluir') excluirProfissional(id);
        return;
      }
      const linhaId = parseInt(alvo.closest<HTMLElement>('tr[data-id]')?.dataset.id || '0', 10);
      if (linhaId) editarProfissional(linhaId);
    });
    listContainer?.addEventListener('keydown', (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (e.key === 'Enter' && alvo.matches('tr[data-id]')) editarProfissional(parseInt(alvo.dataset.id || '0', 10));
    });

    // --- BUSCA: debounce, ✕ e Esc limpam, "/" foca ---
    const buscaInput = document.getElementById('busca-profissional') as HTMLInputElement | null;
    const buscaWrap = document.getElementById('busca-wrap');
    let timeout: ReturnType<typeof setTimeout>;
    buscaInput?.addEventListener('input', () => {
      buscaWrap?.classList.toggle('tem-valor', buscaInput.value.length > 0);
      clearTimeout(timeout);
      timeout = setTimeout(() => { termo = buscaInput.value; renderProfissionais(); }, 200);
    });
    const limparBusca = () => {
      if (!buscaInput) return;
      buscaInput.value = '';
      buscaWrap?.classList.remove('tem-valor');
      clearTimeout(timeout);
      termo = '';
      renderProfissionais();
    };
    document.getElementById('busca-limpar')?.addEventListener('click', () => { limparBusca(); buscaInput?.focus(); });
    buscaInput?.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') { limparBusca(); buscaInput.blur(); }
    });
    status?.addEventListener('click', (e: MouseEvent) => {
      const acao = (e.target as HTMLElement).closest<HTMLElement>('[data-estado-acao]')?.dataset.estadoAcao;
      if (acao === 'novo') btnNovo?.click();
      else if (acao === 'limpar') limparBusca();
    });
    atalhoBuscaCfg = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable)) return;
      e.preventDefault();
      buscaInput?.focus();
    };
    document.addEventListener('keydown', atalhoBuscaCfg);

    loadProfissionais();
  },
  cleanup: () => {
    if (atalhoBuscaCfg) { document.removeEventListener('keydown', atalhoBuscaCfg); atalhoBuscaCfg = null; }
    if (escModalBanco) { document.removeEventListener('keydown', escModalBanco); escModalBanco = null; }
  }
};
