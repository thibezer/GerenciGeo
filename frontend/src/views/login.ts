import type { RouteDef } from '../types';
import { AuthService } from '../utils/auth_service';
import { showToast, initIcons } from '../utils';

export const loginRoute: RouteDef = {
  render: () => `
    <div class="min-h-[85vh] flex items-center justify-center p-4 relative select-none">
      <!-- Glows de ambientação geodésica -->
      <div class="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-mint-vibrant/10 blur-[100px] rounded-full pointer-events-none"></div>
      <div class="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-80 h-80 bg-mint-vibrant/5 blur-[120px] rounded-full pointer-events-none"></div>

      <div class="glass-card w-full max-w-md p-8 sm:p-10 rounded-2xl border border-white/10 shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-300">
        
        <!-- Cabeçalho / Marca -->
        <div class="text-center mb-8">
          <div class="inline-flex items-center justify-center w-14 h-14 bg-mint-vibrant/10 border border-mint-vibrant/30 rounded-2xl shadow-[0_0_20px_rgba(0,245,160,0.2)] mb-4">
            <i data-lucide="crosshair" class="text-mint-vibrant w-8 h-8"></i>
          </div>
          <h1 class="text-2xl font-bold tracking-tight text-white">
            Gerenci<span class="text-mint-vibrant">Geo</span>
          </h1>
          <p class="text-xs text-white/50 uppercase tracking-widest mt-1">Controle de Acesso & Autenticação</p>
        </div>

        <div class="mb-6 text-center">
          <h2 class="text-lg font-bold text-white">Bem-vindo de volta</h2>
          <p class="text-xs text-white/40 mt-0.5">Faça login para gerenciar seus levantamentos e acervos</p>
        </div>

        <!-- Formulário de Login -->
        <form id="form-login" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-white/70 uppercase tracking-wider mb-1.5">E-mail Profissional</label>
            <ui-campo-texto 
              id="login-email"
              name="email" 
              type="email" 
              obrigatorio 
              placeholder="seu.email@empresa.com"
              class="w-full">
            </ui-campo-texto>
          </div>

          <div class="relative">
            <div class="flex justify-between items-center mb-1.5">
              <label class="block text-xs font-semibold text-white/70 uppercase tracking-wider">Senha de Acesso</label>
            </div>
            <div class="relative flex items-center">
              <ui-campo-texto 
                id="login-password"
                name="password" 
                type="password" 
                obrigatorio 
                placeholder="••••••••••••"
                class="w-full">
              </ui-campo-texto>
              <button 
                type="button" 
                id="btn-toggle-login-pwd" 
                class="absolute right-3 text-white/40 hover:text-mint-vibrant transition p-1 focus:outline-none cursor-pointer z-10" 
                title="Mostrar/Ocultar Senha">
                <i data-lucide="eye" id="icon-eye-login" class="w-4 h-4"></i>
              </button>
            </div>
          </div>

          <div class="flex items-center justify-between pt-1">
            <label class="inline-flex items-center gap-2 text-xs text-white/60 hover:text-white cursor-pointer select-none">
              <input type="checkbox" id="login-remember" name="rememberMe" class="rounded border-white/20 bg-white/5 text-mint-vibrant focus:ring-mint-vibrant focus:ring-offset-0">
              Permanecer conectado (30 dias)
            </label>
            <a href="javascript:void(0)" id="link-forgot-pwd" class="text-xs font-semibold text-mint-vibrant hover:underline">
              Esqueceu a senha?
            </a>
          </div>

          <div class="pt-3">
            <ui-botao-primario 
              id="btn-submit-login" 
              type="submit" 
              variante="primary" 
              class="w-full justify-center text-sm font-bold tracking-wide py-3 shadow-[0_0_15px_rgba(0,245,160,0.3)]">
              Entrar no Sistema
            </ui-botao-primario>
          </div>
        </form>

        <!-- Informações de Segurança e Rodapé -->
        <div class="mt-8 pt-6 border-t border-white/5 text-center">
          <p class="text-[11px] text-white/30 flex items-center justify-center gap-1.5">
            <i data-lucide="shield-check" class="w-3.5 h-3.5 text-mint-vibrant/60"></i>
            Ambiente com Criptografia de Alta Precisão Geodésica
          </p>
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
    const iconEye = document.getElementById('icon-eye-login');
    const btnSubmit = document.getElementById('btn-submit-login') as any;
    const linkForgot = document.getElementById('link-forgot-pwd');

    // Alternar visibilidade da senha
    if (btnTogglePwd && inputPwd && iconEye) {
      btnTogglePwd.addEventListener('click', (e) => {
        e.preventDefault();
        const currentType = inputPwd.getAttribute('type') || inputPwd.type;
        const newType = currentType === 'password' ? 'text' : 'password';
        inputPwd.setAttribute('type', newType);
        if (inputPwd.type !== undefined) inputPwd.type = newType;
        
        if (newType === 'text') {
          iconEye.setAttribute('data-lucide', 'eye-off');
        } else {
          iconEye.setAttribute('data-lucide', 'eye');
        }
        initIcons();
      });
    }

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

        const inputEmail = document.getElementById('login-email') as any;
        const chkRemember = document.getElementById('login-remember') as HTMLInputElement | null;

        const email = (inputEmail?.value || inputEmail?.getAttribute('value') || '').trim();
        const password = (inputPwd?.value || inputPwd?.getAttribute('value') || '');
        const rememberMe = chkRemember ? chkRemember.checked : false;

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
