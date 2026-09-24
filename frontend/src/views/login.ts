import type { RouteDef } from '../types';
import { AuthService } from '../utils/auth_service';
import { showToast, initIcons } from '../utils';

export const loginRoute: RouteDef = {
  render: () => `
    <div class="min-h-full min-h-[90vh] flex items-center justify-center p-4 sm:p-6 relative select-none">
      <!-- Glows e ambientação geodésica moderna -->
      <div class="absolute top-1/4 left-1/3 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-mint-vibrant/10 blur-[130px] rounded-full pointer-events-none"></div>
      <div class="absolute bottom-1/4 right-1/3 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-mint-vibrant/5 blur-[140px] rounded-full pointer-events-none"></div>

      <!-- Card Central de Login -->
      <div class="glass-card w-full max-w-[430px] p-8 sm:p-10 rounded-2xl border border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.6)] backdrop-blur-2xl bg-[#0f1412]/90 relative z-10 transition-all">
        
        <!-- Cabeçalho / Marca -->
        <div class="text-center mb-8">
          <div class="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-mint-vibrant/20 to-mint-vibrant/5 border border-mint-vibrant/30 rounded-2xl shadow-[0_0_25px_rgba(0,245,160,0.25)] mb-4">
            <i data-lucide="crosshair" class="text-mint-vibrant w-8 h-8"></i>
          </div>
          <h1 class="text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-1">
            Gerenci<span class="text-mint-vibrant">Geo</span>
          </h1>
          <p class="text-[11px] font-semibold text-white/50 uppercase tracking-widest mt-1">Controle de Acesso & Autenticação</p>
        </div>

        <div class="mb-6 text-center">
          <h2 class="text-lg font-bold text-white tracking-tight">Bem-vindo de volta</h2>
          <p class="text-xs text-white/45 mt-0.5">Faça login para gerenciar seus levantamentos e acervos</p>
        </div>

        <!-- Formulário de Login -->
        <form id="form-login" class="space-y-4.5">
          <div>
            <label class="block text-xs font-semibold text-white/70 uppercase tracking-wider mb-1.5">E-mail Profissional</label>
            <ui-campo-texto 
              id="login-email"
              name="email" 
              tipo="email"
              type="email" 
              altura="44"
              obrigatorio 
              placeholder="seu.email@empresa.com"
              class="w-full">
              <span slot="icone-esquerda" class="text-white/40 flex items-center justify-center pl-1">
                <i data-lucide="mail" class="w-4 h-4"></i>
              </span>
            </ui-campo-texto>
          </div>

          <div>
            <div class="flex justify-between items-center mb-1.5">
              <label class="block text-xs font-semibold text-white/70 uppercase tracking-wider">Senha de Acesso</label>
            </div>
            <ui-campo-texto 
              id="login-password"
              name="password" 
              tipo="password"
              type="password" 
              altura="44"
              obrigatorio 
              placeholder="••••••••••••"
              class="w-full">
              <span slot="icone-esquerda" class="text-white/40 flex items-center justify-center pl-1">
                <i data-lucide="lock" class="w-4 h-4"></i>
              </span>
              <span slot="icone-direita" id="btn-toggle-login-pwd" class="text-white/40 hover:text-mint-vibrant transition p-1 flex items-center justify-center cursor-pointer" title="Mostrar/Ocultar Senha">
                <i data-lucide="eye" id="icon-eye-login" class="w-4 h-4"></i>
              </span>
            </ui-campo-texto>
          </div>

          <div class="flex items-center justify-between pt-1">
            <ui-checkbox 
              id="login-remember" 
              name="rememberMe" 
              label="Permanecer conectado"
              class="text-xs text-white/70 hover:text-white cursor-pointer select-none">
            </ui-checkbox>
            <a href="javascript:void(0)" id="link-forgot-pwd" class="text-xs font-semibold text-mint-vibrant hover:underline transition-colors shrink-0 ml-2">
              Esqueceu a senha?
            </a>
          </div>

          <div class="pt-3">
            <ui-botao 
              id="btn-submit-login" 
              tipo-submit 
              variante="primario" 
              altura="46"
              class="w-full">
              <i data-lucide="log-in" class="w-4 h-4"></i>
              <span>Entrar no Sistema</span>
            </ui-botao>
          </div>
        </form>

        <!-- Informações de Segurança e Rodapé -->
        <div class="mt-8 pt-5 border-t border-white/5 flex flex-col items-center gap-1.5 text-center">
          <p class="text-xs text-white/60 flex items-center justify-center gap-2">
            <i data-lucide="shield-check" class="w-4 h-4 text-mint-vibrant shrink-0"></i>
            Ambiente com Criptografia de Alta Precisão Geodésica
          </p>
          <span class="text-[10px] text-white/30 tracking-widest uppercase font-mono">
            SIRGAS 2000 • TLS 1.3 • Acesso Auditado
          </span>
        </div>
      </div>
    </div>
  `,
  setup: () => {
    initIcons();

    // Se já estiver logado, redireciona de imediato para o dashboard
    if (AuthService.isAuthenticated()) {
      window.location.hash = '#dashboard';
      return;
    }

    const form = document.getElementById('form-login') as HTMLFormElement | null;
    const btnTogglePwd = document.getElementById('btn-toggle-login-pwd');
    const inputPwd = document.getElementById('login-password') as any;
    const inputEmail = document.getElementById('login-email') as any;
    const iconEye = document.getElementById('icon-eye-login');
    const btnSubmit = document.getElementById('btn-submit-login') as any;
    const linkForgot = document.getElementById('link-forgot-pwd');

    // Alternar visibilidade da senha via slot ou evento do Web Component
    if (inputPwd) {
      inputPwd.addEventListener('ui-toggle-senha', (e: any) => {
        const isVisible = e.detail?.visivel;
        if (iconEye) {
          iconEye.setAttribute('data-lucide', isVisible ? 'eye-off' : 'eye');
          initIcons();
        }
      });

      if (btnTogglePwd) {
        btnTogglePwd.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (typeof inputPwd.alternarVisibilidadeSenha === 'function') {
            inputPwd.alternarVisibilidadeSenha();
          } else {
            const currentType = inputPwd.getAttribute('type') || inputPwd.type;
            const newType = currentType === 'password' ? 'text' : 'password';
            inputPwd.setAttribute('type', newType);
            inputPwd.setAttribute('tipo', newType);
            if (iconEye) {
              iconEye.setAttribute('data-lucide', newType === 'text' ? 'eye-off' : 'eye');
              initIcons();
            }
          }
        });
      }
    }

    // Suporte para submissão com tecla Enter nos campos de texto
    const handleEnterKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (form) form.requestSubmit();
      }
    };
    if (inputEmail) inputEmail.addEventListener('keydown', handleEnterKey);
    if (inputPwd) inputPwd.addEventListener('keydown', handleEnterKey);

    // Modal de Esqueci Minha Senha
    if (linkForgot) {
      linkForgot.addEventListener('click', () => {
        showToast("Para redefinição de acesso em ambiente local/desktop, consulte o administrador ou use as credenciais padrão.", "info");
      });
    }

    // Submissão do Formulário de Login
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const chkRemember = document.getElementById('login-remember') as any;

        const email = (inputEmail?.value || inputEmail?.getAttribute('value') || '').trim();
        const password = (inputPwd?.value || inputPwd?.getAttribute('value') || '');
        const rememberMe = chkRemember ? (chkRemember.checked || chkRemember.hasAttribute('marcado') || false) : false;

        if (!email || !password) {
          showToast('Preencha seu e-mail e senha de acesso.', 'info');
          return;
        }

        try {
          if (btnSubmit) {
            btnSubmit.setAttribute('carregando', 'true');
            btnSubmit.disabled = true;
          }

          const user = await AuthService.login(email, password, rememberMe);
          showToast(`Bem-vindo, ${user.name}!`, 'success');

          // Atualiza as informações do usuário no rodapé da Sidebar
          const userNameEl = document.querySelector('#sidebar-footer .text-sm.font-semibold');
          const userAvatarEl = document.querySelector('#sidebar-footer .w-8.h-8');
          if (userNameEl) userNameEl.textContent = user.name;
          if (userAvatarEl) userAvatarEl.textContent = AuthService.getInitials(user.name);

          // Redireciona para o dashboard
          window.location.hash = '#dashboard';
        } catch (err: any) {
          showToast(err.message || 'Erro ao realizar login.', 'error');
        } finally {
          if (btnSubmit) {
            btnSubmit.removeAttribute('carregando');
            btnSubmit.disabled = false;
          }
        }
      });
    }
  }
};
