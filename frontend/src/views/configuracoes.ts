import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { initIcons } from '../utils';

export const configuracoesRoute: RouteDef = {
  render: () => `
    <div class="space-y-6 animate-in fade-in duration-300 select-text">
      <div class="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h2 class="text-3xl font-bold">Configurações do Sistema</h2>
          <p class="text-white/40 mt-1">Gerencie os parâmetros globais e o cadastro de Responsáveis Técnicos do GerenciGeo.</p>
        </div>
        <button id="btn-novo-profissional" class="btn-primary text-xs flex items-center gap-1.5 cursor-pointer max-w-[200px]">
          <i data-lucide="user-plus" class="w-4 h-4"></i>
          Adicionar Profissional
        </button>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Esquerda/Centro: Lista de Profissionais Cadastrados -->
        <div class="lg:col-span-2 space-y-6">
          <div class="glass-card p-6 flex flex-col h-full min-h-[400px]">
            <h3 class="text-sm font-bold uppercase tracking-widest text-white/40 border-b border-white/5 pb-3 flex items-center gap-2">
              <i data-lucide="users" class="w-4 h-4 text-mint-vibrant"></i>
              Responsáveis Técnicos Cadastrados
            </h3>
            
            <div id="profissionais-lista-container" class="space-y-4 flex-grow overflow-y-auto mt-4">
              <!-- Injetado via JS -->
              <p class="text-xs text-white/30 italic py-4 text-center animate-pulse">Carregando profissionais...</p>
            </div>
          </div>
        </div>

        <!-- Direita: Formulário de Cadastro / Edição Lateral -->
        <div class="space-y-6">
          <div class="glass-card p-6 flex flex-col hidden" id="card-profissional-form">
            <h3 class="text-sm font-bold uppercase tracking-widest text-mint-vibrant border-b border-mint-vibrant/20 pb-3 flex items-center gap-2" id="form-prof-titulo">
              <i data-lucide="user-plus" class="w-4 h-4 animate-pulse"></i>
              Cadastrar Novo Profissional
            </h3>
            
            <form id="form-profissional" class="space-y-4 mt-4 text-xs select-text">
              <input type="hidden" id="input-prof-id" value="" />
              
              <div>
                <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Nome Completo *</label>
                <input type="text" id="input-prof-nome" required class="glass-input w-full text-xs font-bold" placeholder="Ex: Eng. João da Silva" />
              </div>

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Formação Técnica *</label>
                  <input type="text" id="input-prof-formacao" required class="glass-input w-full text-xs" placeholder="Ex: Engenheiro Agrônomo" />
                </div>
                <div>
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Nacionalidade</label>
                  <input type="text" id="input-prof-nacionalidade" class="glass-input w-full text-xs" placeholder="Ex: brasileiro(a)" value="brasileiro(a)" />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">CPF *</label>
                  <input type="text" id="input-prof-cpf" required class="glass-input w-full text-xs font-mono" placeholder="000.000.000-00" />
                  <span id="cpf-validation-msg" class="text-[9px] text-red-400 mt-1 hidden font-bold uppercase tracking-widest block animate-pulse">CPF Inválido</span>
                </div>
                <div>
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">RG *</label>
                  <input type="text" id="input-prof-rg" required class="glass-input w-full text-xs font-mono" placeholder="Ex: 12.345.678-9" />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Conselho *</label>
                  <input type="text" id="input-prof-conselho" required class="glass-input w-full text-xs uppercase" placeholder="Ex: CFTA ou CREA" />
                </div>
                <div>
                  <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Nº no Conselho (Registro) *</label>
                  <input type="text" id="input-prof-registro" required class="glass-input w-full text-xs font-mono uppercase" placeholder="Ex: CFTA-PR-12345" />
                </div>
              </div>
              
              <div>
                <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Código Credenciado INCRA *</label>
                <input type="text" id="input-prof-codigo" required class="glass-input w-full text-xs font-mono uppercase" placeholder="Ex: ABCD" />
              </div>
              
              <div>
                <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Endereço Residencial</label>
                <input type="text" id="input-prof-endereco-res" class="glass-input w-full text-xs" placeholder="Rua, número, bairro, cidade - UF" />
              </div>

              <div>
                <label class="block text-[10px] text-white/40 uppercase font-bold mb-1">Endereço Comercial (Profissional)</label>
                <input type="text" id="input-prof-endereco" class="glass-input w-full text-xs" placeholder="Av. Brasil, 1500, Paranavaí - PR" />
              </div>
              
              <div class="pt-4 border-t border-white/5 flex justify-end gap-2">
                <button type="button" id="btn-cancelar-prof" class="btn-secondary text-xs cursor-pointer">
                  Cancelar
                </button>
                <button type="submit" id="btn-salvar-prof" class="btn-primary text-xs flex items-center gap-1 cursor-pointer">
                  <i data-lucide="save" class="w-3.5 h-3.5"></i>
                  Salvar
                </button>
              </div>
            </form>
          </div>

          <!-- Card de Ajuda Técnico -->
          <div class="glass-card p-6 space-y-4">
            <h4 class="text-xs font-bold uppercase tracking-widest text-white/40 flex items-center gap-1.5">
              <i data-lucide="info" class="w-4 h-4 text-mint-vibrant"></i>
              Instruções Técnicas
            </h4>
            <p class="text-xs text-white/60 leading-relaxed">
              O Responsável Técnico é o profissional que assinará os laudos de faixa de fronteira, cartas de anuência de confrontação e requerimentos imobiliários do sistema GerenciGeo.
            </p>
            <p class="text-xs text-white/60 leading-relaxed mt-2">
              Certifique-se de preencher o <strong>Registro CREA/CFTA</strong> e o <strong>Código Credenciado INCRA</strong> corretamente para evitar erros de consistência nos templates HTML oficiais das matrículas.
            </p>
          </div>
        </div>
      </div>
    </div>
  `,
  setup: () => {
    const listContainer = document.getElementById('profissionais-lista-container');
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
    
    // Novos inputs
    const inputFormacao = document.getElementById('input-prof-formacao') as HTMLInputElement;
    const inputNacionalidade = document.getElementById('input-prof-nacionalidade') as HTMLInputElement;
    const inputCpf = document.getElementById('input-prof-cpf') as HTMLInputElement;
    const inputRg = document.getElementById('input-prof-rg') as HTMLInputElement;
    const inputConselho = document.getElementById('input-prof-conselho') as HTMLInputElement;
    const inputEnderecoRes = document.getElementById('input-prof-endereco-res') as HTMLInputElement;

    let profissionais: any[] = [];

    // Funções utilitárias de validação e máscara de CPF
    const aplicarMascaraCPF = (value: string) => {
      let v = value.replace(/\D/g, ''); // Remove tudo o que não é dígito
      if (v.length > 11) v = v.substring(0, 11);
      
      if (v.length <= 3) {
        return v;
      }
      if (v.length <= 6) {
        return `${v.substring(0, 3)}.${v.substring(3)}`;
      }
      if (v.length <= 9) {
        return `${v.substring(0, 3)}.${v.substring(3, 6)}.${v.substring(6)}`;
      }
      return `${v.substring(0, 3)}.${v.substring(3, 6)}.${v.substring(6, 9)}-${v.substring(9)}`;
    };

    const validarCPF = (cpf: string) => {
      const cleanCpf = cpf.replace(/\D/g, '');
      if (cleanCpf.length !== 11) return false;
      if (/^(\d)\1{10}$/.test(cleanCpf)) return false;
      
      let add = 0;
      for (let i = 0; i < 9; i++) {
        add += parseInt(cleanCpf.charAt(i)) * (10 - i);
      }
      let rev = 11 - (add % 11);
      if (rev === 10 || rev === 11) rev = 0;
      if (rev !== parseInt(cleanCpf.charAt(9))) return false;
      
      add = 0;
      for (let i = 0; i < 10; i++) {
        add += parseInt(cleanCpf.charAt(i)) * (11 - i);
      }
      rev = 11 - (add % 11);
      if (rev === 10 || rev === 11) rev = 0;
      if (rev !== parseInt(cleanCpf.charAt(10))) return false;
      
      return true;
    };

    const msgCpf = document.getElementById('cpf-validation-msg');

    // Aplica a máscara em tempo real
    inputCpf?.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      target.value = aplicarMascaraCPF(target.value);
      
      const cleanVal = target.value.replace(/\D/g, '');
      if (cleanVal.length === 11) {
        if (!validarCPF(target.value)) {
          target.classList.add('border-red-500/50', 'bg-red-500/5', 'text-red-200');
          msgCpf?.classList.remove('hidden');
        } else {
          target.classList.remove('border-red-500/50', 'bg-red-500/5', 'text-red-200');
          msgCpf?.classList.add('hidden');
        }
      } else {
        target.classList.remove('border-red-500/50', 'bg-red-500/5', 'text-red-200');
        msgCpf?.classList.add('hidden');
      }
    });

    const loadProfissionais = async () => {
      if (listContainer) {
        listContainer.innerHTML = '<p class="text-xs text-white/30 italic py-4 text-center animate-pulse">Carregando lista...</p>';
      }
      try {
        const res = await fetch(`${API_BASE}/profissionais`);
        profissionais = await res.json();
        renderProfissionais();
      } catch (err) {
        console.error(err);
        if (listContainer) {
          listContainer.innerHTML = '<p class="text-xs text-red-400 py-4 text-center">Falha ao carregar profissionais.</p>';
        }
      }
    };

    const renderProfissionais = () => {
      if (!listContainer) return;

      if (profissionais.length === 0) {
        listContainer.innerHTML = `
          <div class="text-center py-12 text-white/20 border border-dashed border-white/5 rounded-xl flex flex-col items-center justify-center">
             <i data-lucide="users" class="w-8 h-8 text-white/20 mb-2"></i>
             <p class="text-xs">Nenhum profissional técnico cadastrado no sistema.</p>
          </div>
        `;
        initIcons();
        return;
      }

      listContainer.innerHTML = profissionais.map((p: any) => `
        <div class="p-4 bg-white/[0.01] border border-white/5 hover:border-mint-vibrant/20 rounded-xl space-y-3 transition-all select-none flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div class="space-y-1 flex-1">
            <h4 class="text-xs font-bold text-white flex items-center gap-2">
              ${p.nome}
              ${p.contador_m + p.contador_p + p.contador_v > 0 
                ? `<span class="text-[9px] bg-mint-vibrant/10 text-mint-vibrant px-1.5 py-0.5 rounded font-mono font-bold">${p.contador_m + p.contador_p + p.contador_v} Vértices</span>`
                : ''}
            </h4>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-white/40 font-mono">
              <p><strong>Formação:</strong> ${p.formacao || 'Não Informada'}</p>
              <p><strong>Nacionalidade:</strong> ${p.nacionalidade || 'brasileiro(a)'}</p>
              <p><strong>CPF:</strong> ${p.cpf || 'Não Informado'}</p>
              <p><strong>RG:</strong> ${p.rg || 'Não Informado'}</p>
              <p><strong>Conselho:</strong> ${p.conselho || 'Não Informado'} (Reg: ${p.registro})</p>
              <p><strong>Incra:</strong> ${p.codigo_credenciado || 'N/A'}</p>
              <p class="sm:col-span-2 truncate max-w-[320px]"><strong>End. Comercial:</strong> ${p.endereco || 'Não Informado'}</p>
              <p class="sm:col-span-2 truncate max-w-[320px]"><strong>End. Residencial:</strong> ${p.endereco_residencial || 'Não Informado'}</p>
            </div>
          </div>
          
          <div class="flex items-center gap-2 shrink-0">
            <button 
              onclick="window.editarProfissional(${p.id})"
              class="btn-secondary text-[10px] px-2 py-1 flex items-center gap-1 bg-white/5 hover:bg-white/10 text-white/70 cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              Editar
            </button>
            <button 
              onclick="window.excluirProfissional(${p.id})"
              class="btn-secondary text-[10px] px-2 py-1 flex items-center gap-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border-red-500/10 cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              Excluir
            </button>
          </div>
        </div>
      `).join('');
      initIcons();
    };

    const resetForm = () => {
      formProf.reset();
      inputId.value = '';
      inputNacionalidade.value = 'brasileiro(a)';
      inputCpf.classList.remove('border-red-500/50', 'bg-red-500/5', 'text-red-200');
      msgCpf?.classList.add('hidden');
      if (formTitulo) {
        formTitulo.innerHTML = `<i data-lucide="user-plus" class="w-4 h-4 animate-pulse"></i> Cadastrar Novo Profissional`;
      }
      initIcons();
    };

    btnNovo?.addEventListener('click', () => {
      resetForm();
      formCard?.classList.remove('hidden');
    });

    btnCancel?.addEventListener('click', () => {
      formCard?.classList.add('hidden');
      resetForm();
    });

    formProf?.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const nome = inputNome.value.trim();
      const registro = inputRegistro.value.trim();
      const codigo_credenciado = inputCodigo.value.trim();
      const endereco = inputEndereco.value.trim();
      
      const formacao = inputFormacao.value.trim();
      const nacionalidade = inputNacionalidade.value.trim();
      const cpf = inputCpf.value.trim();
      const rg = inputRg.value.trim();
      const conselho = inputConselho.value.trim();
      const endereco_residencial = inputEnderecoRes.value.trim();
      const profId = inputId.value;

      // Validação robusta de CPF na submissão
      if (cpf && !validarCPF(cpf)) {
        alert("Atenção: O CPF informado para o Responsável Técnico é inválido. Por favor, digite um CPF válido.");
        inputCpf.classList.add('border-red-500/50', 'bg-red-500/5', 'text-red-200');
        inputCpf.focus();
        return;
      }

      const payload = { 
        nome, registro, codigo_credenciado, endereco, 
        formacao, nacionalidade, cpf, rg, conselho, endereco_residencial 
      };

      try {
        let res;
        if (profId) {
          res = await fetch(`${API_BASE}/profissionais/${profId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        } else {
          res = await fetch(`${API_BASE}/profissionais`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        }

        const data = await res.json();
        if (data.error || (data.detail && typeof data.detail === 'string')) {
          alert(`Erro ao salvar profissional: ${data.error || data.detail}`);
        } else {
          alert(data.message || "Profissional salvo com sucesso!");
          formCard?.classList.add('hidden');
          resetForm();
          loadProfissionais();
        }
      } catch (err) {
        console.error(err);
        alert("Erro de comunicação com a API.");
      }
    });

    (window as any).editarProfissional = (id: number) => {
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
      
      // Valida imediatamente ao carregar
      const cleanVal = inputCpf.value.replace(/\D/g, '');
      if (cleanVal.length === 11) {
        if (!validarCPF(inputCpf.value)) {
          inputCpf.classList.add('border-red-500/50', 'bg-red-500/5', 'text-red-200');
          msgCpf?.classList.remove('hidden');
        } else {
          inputCpf.classList.remove('border-red-500/50', 'bg-red-500/5', 'text-red-200');
          msgCpf?.classList.add('hidden');
        }
      } else {
        inputCpf.classList.remove('border-red-500/50', 'bg-red-500/5', 'text-red-200');
        msgCpf?.classList.add('hidden');
      }

      if (formTitulo) {
        formTitulo.innerHTML = `<i data-lucide="edit" class="w-4 h-4 animate-pulse"></i> Editar Cadastro Técnico`;
      }
      initIcons();
      formCard?.classList.remove('hidden');
    };

    (window as any).excluirProfissional = async (id: number) => {
      const p = profissionais.find(x => x.id === id);
      if (!p) return;

      if (!confirm(`Deseja realmente remover o cadastro do profissional ${p.nome}? Esta ação é irreversível.`)) return;

      try {
        const res = await fetch(`${API_BASE}/profissionais/${p.id}`, {
          method: 'DELETE'
        });
        const data = await res.json();
        
        if (data.error) {
          alert(`Aviso de Segurança: ${data.error}`);
        } else {
          alert("Profissional removido com sucesso!");
          loadProfissionais();
        }
      } catch (err) {
        console.error(err);
        alert("Erro de comunicação com a API.");
      }
    };

    loadProfissionais();
  }
};
