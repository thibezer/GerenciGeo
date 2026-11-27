import { API_BASE } from '../../config';
import { AuthService } from '../../utils/auth_service';
import { customConfirm, escapeHtml, initIcons, showToast } from '../../utils';

export interface ContaUsuario {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'moderator' | 'user' | string;
  is_blocked: number;
  created_at?: string;
  active_sessions_count?: number;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  moderator: 'Moderador',
  user: 'Usuário Padrão'
};

const ROLE_BADGE_CLASSES: Record<string, string> = {
  admin: 'bg-mint-vibrant/15 text-mint-vibrant border-mint-vibrant/30',
  moderator: 'bg-sky-500/15 text-sky-300 border-sky-400/30',
  user: 'bg-white/10 text-white/75 border-white/15'
};

const parseErroApi = async (res: Response, fallback: string): Promise<string> => {
  try {
    const data = await res.json();
    return data.detail || data.error || data.message || fallback;
  } catch {
    return `${fallback} (HTTP ${res.status})`;
  }
};

export const renderSecaoMinhaConta = (): string => {
  const user = AuthService.getUser();
  const initials = AuthService.getInitials(user?.name || 'US');
  const roleKey = (user?.role || 'user').toLowerCase();
  const roleLabel = ROLE_LABELS[roleKey] || roleKey;
  const roleClass = ROLE_BADGE_CLASSES[roleKey] || ROLE_BADGE_CLASSES.user;

  return `
    <div id="painel-minha-conta" class="hidden grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-2 flex-1 min-h-0 overflow-y-auto lg:overflow-visible">
      <div class="lp-card p-5 flex flex-col gap-4">
        <div class="lp-card-titulo !px-0 !pt-0"><i data-lucide="user-check"></i>Perfil e Sessão Atual</div>
        <div class="flex items-center gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/10">
          <div class="w-12 h-12 rounded-xl bg-mint-vibrant/15 border border-mint-vibrant/30 flex items-center justify-center text-mint-vibrant font-bold text-base shrink-0">
            ${escapeHtml(initials)}
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-bold text-white truncate">${escapeHtml(user?.name || 'Usuário')}</span>
              <span class="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${roleClass}">${escapeHtml(roleLabel)}</span>
            </div>
            <p class="text-xs text-white/55 truncate mt-0.5">${escapeHtml(user?.email || '')}</p>
          </div>
        </div>
        <div class="text-xs text-white/50 leading-relaxed space-y-2">
          <p>Sua sessão é autenticada por token individual por dispositivo. Caso suspeite de acesso indevido ou altere sua senha, recomendamos encerrar sessões antigas.</p>
          <p>Apenas usuários com perfil <strong class="text-white/80">Administrador</strong> podem aprovar novos cadastros, bloquear contas ou alterar permissões.</p>
        </div>
      </div>

      <div class="lp-card p-5 flex flex-col gap-3" style="flex:none">
        <div class="lp-card-titulo !px-0 !pt-0" style="color:var(--lp-accent)"><i data-lucide="key-round"></i>Alterar Minha Senha</div>
        <form id="form-alterar-minha-senha" class="flex flex-col gap-3">
          <label class="lp-campo"><span>Senha atual *</span>
            <input type="password" id="input-minha-senha-atual" required placeholder="••••••••" autocomplete="current-password" />
          </label>
          <label class="lp-campo"><span>Nova senha (mín. 6 caracteres) *</span>
            <input type="password" id="input-minha-senha-nova" required minlength="6" placeholder="••••••••" autocomplete="new-password" />
          </label>
          <label class="lp-campo"><span>Confirmar nova senha *</span>
            <input type="password" id="input-minha-senha-confirma" required minlength="6" placeholder="••••••••" autocomplete="new-password" />
          </label>
          <div class="flex justify-end pt-1">
            <button type="submit" id="btn-salvar-minha-senha" class="lp-btn-primario">
              <i data-lucide="shield-check" class="w-4 h-4"></i>
              Atualizar Senha
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
};

export const renderSecaoControleAcessos = (): string => `
  <div id="painel-controle-acessos" class="hidden flex flex-col gap-2 flex-1 min-h-0">
    <!-- Barra de filtros e ação -->
    <div class="lp-card p-3 flex items-center justify-between gap-2" style="flex:none;flex-direction:row;flex-wrap:nowrap;overflow-x:auto">
      <div class="flex items-center gap-2 shrink-0">
        <div class="lp-seg" id="acessos-filtro-seg" role="group" aria-label="Filtrar contas">
          <button type="button" class="lp-seg-btn is-active" data-filtro="todos">Todos <span class="lp-seg-n" id="cnt-usr-todos">0</span></button>
          <button type="button" class="lp-seg-btn" data-filtro="pendentes" data-tom="warn">Pendentes / Bloqueados <span class="lp-seg-n" id="cnt-usr-pendentes">0</span></button>
          <button type="button" class="lp-seg-btn" data-filtro="ativos">Ativos <span class="lp-seg-n" id="cnt-usr-ativos">0</span></button>
          <button type="button" class="lp-seg-btn" data-filtro="admins">Admins <span class="lp-seg-n" id="cnt-usr-admins">0</span></button>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <label class="lp-busca" style="width:clamp(170px,18vw,280px)">
          <i data-lucide="search"></i>
          <input type="text" id="busca-usuario" placeholder="Buscar por nome ou e-mail" autocomplete="off" />
        </label>
        <button type="button" id="btn-novo-usuario" class="lp-btn-primario">
          <i data-lucide="user-plus" class="w-4 h-4"></i>
          Novo Usuário
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-2 flex-1 min-h-0 overflow-y-auto lg:overflow-visible">
      <!-- Tabela de usuários -->
      <div class="lp-card lg:min-h-0" style="min-height:280px">
        <div class="lp-card-titulo"><i data-lucide="shield"></i>Contas e Permissões do Sistema</div>
        <div class="lp-wrap overflow-x-auto overflow-y-auto flex-1 min-h-0">
          <table class="lp-tabela">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Perfil</th>
                <th>Status</th>
                <th class="lp-col-num lp-oculta-sm">Sessões</th>
                <th class="lp-col-acoes" style="width:200px"><span class="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody id="usuarios-lista-container"></tbody>
          </table>
          <div id="usuarios-status" class="hidden" role="status" aria-live="polite"></div>
        </div>
        <div class="lp-rodape">
          <span id="acessos-rodape">Carregando contas...</span>
          <span class="lp-muted" style="font-size:11px">Novos cadastros entram bloqueados até aprovação</span>
        </div>
      </div>

      <!-- Formulário lateral de criação/edição -->
      <div class="flex flex-col gap-2 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
        <div class="lp-card hidden" id="card-usuario-form" style="flex:none;overflow:visible">
          <div class="lp-card-titulo" id="form-usr-titulo" style="color:var(--lp-accent)"><i data-lucide="user-plus"></i>Novo Usuário</div>
          <form id="form-usuario" class="flex flex-col gap-2.5 select-text" style="padding:12px">
            <input type="hidden" id="input-usr-id" value="" />
            <label class="lp-campo"><span>Nome completo *</span>
              <input type="text" id="input-usr-nome" required placeholder="Ex: Maria Souza" />
            </label>
            <label class="lp-campo"><span>E-mail *</span>
              <input type="email" id="input-usr-email" required placeholder="maria@empresa.com.br" />
            </label>
            <label class="lp-campo" id="wrap-usr-senha"><span>Senha inicial (mín. 6 caracteres) *</span>
              <input type="password" id="input-usr-senha" minlength="6" placeholder="••••••••" />
            </label>
            <div class="grid grid-cols-2 gap-2">
              <label class="lp-campo"><span>Perfil de acesso *</span>
                <select id="input-usr-role">
                  <option value="user">Usuário Padrão</option>
                  <option value="moderator">Moderador</option>
                  <option value="admin">Administrador</option>
                </select>
              </label>
              <label class="lp-campo"><span>Status *</span>
                <select id="input-usr-blocked">
                  <option value="0">Ativo (Liberado)</option>
                  <option value="1">Bloqueado / Pendente</option>
                </select>
              </label>
            </div>
            <div class="flex justify-end gap-2 pt-2 border-t border-white/5">
              <button type="button" id="btn-cancelar-usr" class="lp-btn-sec">Cancelar</button>
              <button type="submit" id="btn-salvar-usr" class="lp-btn-primario">
                <i data-lucide="save" class="w-4 h-4"></i>Salvar Conta
              </button>
            </div>
          </form>
        </div>

        <details class="lp-aviso" open>
          <summary style="color:var(--lp-text-2)"><i data-lucide="shield-alert" class="w-4 h-4" style="color:var(--lp-accent)"></i>Política de Segurança</summary>
          <div class="lp-aviso-corpo lp-sub" style="font-size:12px;line-height:1.55;max-height:none">
            <p><strong>Aprovação obrigatória:</strong> Todo novo cadastro feito na tela de login entra com status <em>Bloqueado / Pendente</em> e perfil <em>Usuário Padrão</em>.</p>
            <p class="mt-2"><strong>Revogação imediata:</strong> Ao bloquear uma conta ou redefinir sua senha, todas as sessões ativas daquele usuário são encerradas automaticamente.</p>
          </div>
        </details>
      </div>
    </div>

    <!-- Modal de redefinição de senha pelo admin -->
    <div id="modal-reset-senha" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
      <div class="glass-card w-full max-w-md overflow-hidden flex flex-col">
        <div class="p-5 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
          <h3 class="text-sm font-bold flex items-center gap-2 text-white">
            <i data-lucide="key-round" class="w-4 h-4 text-mint-vibrant"></i>
            Redefinir Senha: <span id="txt-reset-usr-nome" class="text-mint-vibrant">-</span>
          </h3>
          <button type="button" id="btn-fechar-reset-senha" class="text-white/40 hover:text-white"><i data-lucide="x" class="w-4 h-4"></i></button>
        </div>
        <form id="form-reset-senha" class="p-5 flex flex-col gap-3">
          <input type="hidden" id="input-reset-usr-id" value="" />
          <label class="lp-campo"><span>Nova senha (mín. 6 caracteres) *</span>
            <input type="password" id="input-reset-nova-senha" required minlength="6" placeholder="••••••••" />
          </label>
          <label class="lp-campo"><span>Confirmar nova senha *</span>
            <input type="password" id="input-reset-confirma-senha" required minlength="6" placeholder="••••••••" />
          </label>
          <p class="text-[11px] text-white/45">Ao confirmar, todas as sessões ativas deste usuário serão desconectadas.</p>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" id="btn-cancelar-reset-senha" class="lp-btn-sec">Cancelar</button>
            <button type="submit" id="btn-confirmar-reset-senha" class="lp-btn-primario">Salvar Nova Senha</button>
          </div>
        </form>
      </div>
    </div>
  </div>
`;

export const initControleAcessos = (): void => {
  const currentUser = AuthService.getUser();

  // 1. Formulário "Alterar Minha Senha" (todos os usuários)
  const formMinhaSenha = document.getElementById('form-alterar-minha-senha') as HTMLFormElement | null;
  formMinhaSenha?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const curEl = document.getElementById('input-minha-senha-atual') as HTMLInputElement;
    const newEl = document.getElementById('input-minha-senha-nova') as HTMLInputElement;
    const confEl = document.getElementById('input-minha-senha-confirma') as HTMLInputElement;
    const btn = document.getElementById('btn-salvar-minha-senha') as HTMLButtonElement | null;

    if (newEl.value.length < 6) {
      showToast('A nova senha deve conter no mínimo 6 caracteres.', 'error');
      return;
    }
    if (newEl.value !== confEl.value) {
      showToast('A confirmação da nova senha não confere.', 'error');
      return;
    }

    if (btn) btn.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: curEl.value, new_password: newEl.value })
      });
      if (!res.ok) {
        showToast(await parseErroApi(res, 'Erro ao alterar senha.'), 'error');
        return;
      }
      const data = await res.json();
      showToast(data.message || 'Senha alterada com sucesso!', 'success');
      formMinhaSenha.reset();
    } catch {
      showToast('Erro de comunicação com o servidor.', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // 2. Painel Administrativo (somente admin)
  if (!AuthService.isAdmin()) return;

  let usuarios: ContaUsuario[] = [];
  let filtroAtual: 'todos' | 'pendentes' | 'ativos' | 'admins' = 'todos';
  let termoBusca = '';

  const tbody = document.getElementById('usuarios-lista-container');
  const statusEl = document.getElementById('usuarios-status');
  const formCard = document.getElementById('card-usuario-form');
  const formUsr = document.getElementById('form-usuario') as HTMLFormElement | null;
  const formTitulo = document.getElementById('form-usr-titulo');
  const inputId = document.getElementById('input-usr-id') as HTMLInputElement;
  const inputNome = document.getElementById('input-usr-nome') as HTMLInputElement;
  const inputEmail = document.getElementById('input-usr-email') as HTMLInputElement;
  const inputSenha = document.getElementById('input-usr-senha') as HTMLInputElement;
  const wrapSenha = document.getElementById('wrap-usr-senha');
  const inputRole = document.getElementById('input-usr-role') as HTMLSelectElement;
  const inputBlocked = document.getElementById('input-usr-blocked') as HTMLSelectElement;

  const modalReset = document.getElementById('modal-reset-senha');
  const formReset = document.getElementById('form-reset-senha') as HTMLFormElement | null;
  const inputResetId = document.getElementById('input-reset-usr-id') as HTMLInputElement;
  const txtResetNome = document.getElementById('txt-reset-usr-nome');

  const atualizarContadores = () => {
    const pendentes = usuarios.filter(u => Number(u.is_blocked) === 1).length;
    const ativos = usuarios.filter(u => Number(u.is_blocked) === 0).length;
    const admins = usuarios.filter(u => (u.role || '').toLowerCase() === 'admin').length;

    const set = (id: string, val: number) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(val);
    };
    set('cnt-usr-todos', usuarios.length);
    set('cnt-usr-pendentes', pendentes);
    set('cnt-usr-ativos', ativos);
    set('cnt-usr-admins', admins);

    const badgeTab = document.getElementById('badge-acessos-pendentes');
    if (badgeTab) {
      if (pendentes > 0) {
        badgeTab.textContent = String(pendentes);
        badgeTab.classList.remove('hidden');
      } else {
        badgeTab.classList.add('hidden');
      }
    }
  };

  const renderUsuarios = () => {
    if (!tbody) return;
    atualizarContadores();

    const q = termoBusca.trim().toLowerCase();
    const visiveis = usuarios.filter(u => {
      if (filtroAtual === 'pendentes' && Number(u.is_blocked) !== 1) return false;
      if (filtroAtual === 'ativos' && Number(u.is_blocked) !== 0) return false;
      if (filtroAtual === 'admins' && (u.role || '').toLowerCase() !== 'admin') return false;
      if (q && !u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
      return true;
    });

    const rodape = document.getElementById('acessos-rodape');
    if (rodape) rodape.textContent = `Mostrando ${visiveis.length} de ${usuarios.length} conta(s)`;

    if (visiveis.length === 0) {
      tbody.innerHTML = '';
      if (statusEl) {
        statusEl.classList.remove('hidden');
        statusEl.innerHTML = `<div class="lp-estado"><div class="lp-estado-ico"><i data-lucide="users"></i></div><div class="lp-estado-titulo">Nenhuma conta encontrada</div><div class="lp-estado-txt">Ajuste os filtros ou crie um novo usuário.</div></div>`;
      }
      initIcons();
      return;
    }

    statusEl?.classList.add('hidden');
    tbody.innerHTML = visiveis.map(u => {
      const isSelf = currentUser && Number(currentUser.id) === Number(u.id);
      const blocked = Number(u.is_blocked) === 1;
      const roleKey = (u.role || 'user').toLowerCase();
      const roleLabel = ROLE_LABELS[roleKey] || roleKey;
      const roleClass = ROLE_BADGE_CLASSES[roleKey] || ROLE_BADGE_CLASSES.user;
      const statusBadge = blocked
        ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-400/30"><i data-lucide="lock" class="w-3 h-3"></i>Bloqueado</span>`
        : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-400/30"><i data-lucide="check-circle-2" class="w-3 h-3"></i>Ativo</span>`;

      return `
        <tr data-usr-id="${u.id}">
          <td>
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-bold text-mint-vibrant shrink-0">
                ${escapeHtml(AuthService.getInitials(u.name))}
              </div>
              <div class="min-w-0">
                <div class="font-semibold text-white/90 truncate flex items-center gap-1.5">
                  <span>${escapeHtml(u.name)}</span>
                  ${isSelf ? '<span class="text-[9px] px-1.5 py-0.2 rounded bg-mint-vibrant/15 text-mint-vibrant font-bold">Você</span>' : ''}
                </div>
                <div class="text-[11px] text-white/45 truncate">${escapeHtml(u.email)}</div>
              </div>
            </div>
          </td>
          <td><span class="text-[10px] font-semibold px-2 py-0.5 rounded-full border ${roleClass}">${escapeHtml(roleLabel)}</span></td>
          <td>${statusBadge}</td>
          <td class="lp-col-num lp-oculta-sm lp-mono text-xs text-white/70">${u.active_sessions_count ?? 0}</td>
          <td class="lp-col-acoes">
            <div class="flex items-center justify-end gap-1">
              ${!isSelf ? (blocked
                ? `<button type="button" class="btn-usr-action px-2 py-1 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition" data-action="aprovar" data-id="${u.id}" title="Aprovar e liberar acesso">Aprovar</button>`
                : `<button type="button" class="btn-usr-action p-1.5 rounded text-white/50 hover:text-amber-300 hover:bg-amber-500/10 transition" data-action="bloquear" data-id="${u.id}" title="Bloquear acesso"><i data-lucide="ban" class="w-3.5 h-3.5"></i></button>`) : ''}
              <button type="button" class="btn-usr-action p-1.5 rounded text-white/50 hover:text-white hover:bg-white/10 transition" data-action="editar" data-id="${u.id}" title="Editar usuário"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
              <button type="button" class="btn-usr-action p-1.5 rounded text-white/50 hover:text-sky-300 hover:bg-sky-500/10 transition" data-action="senha" data-id="${u.id}" title="Redefinir senha"><i data-lucide="key-round" class="w-3.5 h-3.5"></i></button>
              ${(u.active_sessions_count ?? 0) > 0 ? `<button type="button" class="btn-usr-action p-1.5 rounded text-white/50 hover:text-amber-300 hover:bg-amber-500/10 transition" data-action="revogar" data-id="${u.id}" title="Encerrar sessões ativas"><i data-lucide="log-out" class="w-3.5 h-3.5"></i></button>` : ''}
              ${!isSelf ? `<button type="button" class="btn-usr-action p-1.5 rounded text-white/50 hover:text-red-400 hover:bg-red-500/10 transition" data-action="excluir" data-id="${u.id}" title="Excluir conta"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
    initIcons();
  };

  const loadUsuarios = async () => {
    if (tbody) tbody.innerHTML = Array.from({ length: 3 }, () => '<tr><td colspan="5" class="!p-0"><div class="lp-skel"></div></td></tr>').join('');
    try {
      const res = await fetch(`${API_BASE}/auth/users`);
      if (res.status === 401) throw Object.assign(new Error('Sessão expirada. Entre novamente para ver as contas.'), { sessaoExpirada: true });
      if (!res.ok) throw new Error(await parseErroApi(res, 'Falha ao carregar contas.'));
      const data = await res.json();
      usuarios = Array.isArray(data.users) ? data.users : [];
      renderUsuarios();
    } catch (err: any) {
      if (tbody) tbody.innerHTML = '';
      if (statusEl) {
        statusEl.classList.remove('hidden');
        statusEl.innerHTML = `<div class="lp-estado"><div class="lp-estado-ico"><i data-lucide="alert-triangle"></i></div><div class="lp-estado-titulo">${escapeHtml(err?.message || 'Erro ao carregar usuários')}</div>${err?.sessaoExpirada
          ? '<button type="button" class="lp-btn-primario" id="btn-recarregar-usr">Entrar novamente</button>'
          : '<button type="button" class="lp-btn-sec" id="btn-recarregar-usr">Tentar novamente</button>'}</div>`;
        document.getElementById('btn-recarregar-usr')?.addEventListener('click', () => {
          if (err?.sessaoExpirada) void AuthService.logout();
          else void loadUsuarios();
        });
        initIcons();
      }
    }
  };

  const resetFormUsr = () => {
    formUsr?.reset();
    inputId.value = '';
    inputRole.value = 'user';
    inputBlocked.value = '0';
    wrapSenha?.classList.remove('hidden');
    inputSenha.required = true;
    if (formTitulo) formTitulo.innerHTML = `<i data-lucide="user-plus"></i>Novo Usuário`;
    initIcons();
  };

  document.getElementById('btn-novo-usuario')?.addEventListener('click', () => {
    resetFormUsr();
    formCard?.classList.remove('hidden');
    inputNome.focus();
  });

  document.getElementById('btn-cancelar-usr')?.addEventListener('click', () => {
    formCard?.classList.add('hidden');
    resetFormUsr();
  });

  formUsr?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const uid = inputId.value;
    const isEdit = Boolean(uid);
    const btn = document.getElementById('btn-salvar-usr') as HTMLButtonElement | null;
    if (btn) btn.disabled = true;

    try {
      const payload: Record<string, any> = {
        name: inputNome.value.trim(),
        email: inputEmail.value.trim().toLowerCase(),
        role: inputRole.value,
        is_blocked: Number(inputBlocked.value)
      };
      if (!isEdit) payload.password = inputSenha.value;

      const res = await fetch(isEdit ? `${API_BASE}/auth/users/${uid}` : `${API_BASE}/auth/users`, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        showToast(await parseErroApi(res, 'Erro ao salvar usuário.'), 'error');
        return;
      }
      const data = await res.json();
      showToast(data.message || 'Usuário salvo com sucesso!', 'success');
      formCard?.classList.add('hidden');
      resetFormUsr();
      loadUsuarios();
    } catch {
      showToast('Erro de comunicação com o servidor.', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // Ações da tabela
  tbody?.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('.btn-usr-action');
    if (!btn) return;
    const id = parseInt(btn.dataset.id || '0', 10);
    const action = btn.dataset.action;
    const u = usuarios.find(x => x.id === id);
    if (!u || !action) return;

    if (action === 'editar') {
      inputId.value = String(u.id);
      inputNome.value = u.name;
      inputEmail.value = u.email;
      inputRole.value = u.role || 'user';
      inputBlocked.value = String(u.is_blocked ? 1 : 0);
      wrapSenha?.classList.add('hidden');
      inputSenha.required = false;
      if (formTitulo) formTitulo.innerHTML = `<i data-lucide="edit"></i>Editar Usuário`;
      formCard?.classList.remove('hidden');
      initIcons();
      return;
    }

    if (action === 'aprovar' || action === 'bloquear') {
      const novoStatus = action === 'bloquear' ? 1 : 0;
      if (novoStatus === 1 && !(await customConfirm(`Deseja bloquear o acesso de ${u.name}? Todas as sessões ativas serão encerradas.`))) return;
      const res = await fetch(`${API_BASE}/auth/users/${u.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_blocked: novoStatus })
      });
      if (!res.ok) {
        showToast(await parseErroApi(res, 'Erro ao atualizar status.'), 'error');
        return;
      }
      showToast(novoStatus === 0 ? `Acesso de ${u.name} liberado!` : `Acesso de ${u.name} bloqueado.`, 'success');
      loadUsuarios();
      return;
    }

    if (action === 'senha') {
      inputResetId.value = String(u.id);
      if (txtResetNome) txtResetNome.textContent = u.name;
      formReset?.reset();
      inputResetId.value = String(u.id);
      modalReset?.classList.remove('hidden');
      initIcons();
      return;
    }

    if (action === 'revogar') {
      if (!(await customConfirm(`Encerrar todas as sessões ativas de ${u.name}?`))) return;
      const res = await fetch(`${API_BASE}/auth/users/${u.id}/revoke-sessions`, { method: 'POST' });
      if (!res.ok) {
        showToast(await parseErroApi(res, 'Erro ao encerrar sessões.'), 'error');
        return;
      }
      showToast('Sessões encerradas com sucesso.', 'success');
      loadUsuarios();
      return;
    }

    if (action === 'excluir') {
      if (!(await customConfirm(`Deseja excluir permanentemente a conta de ${u.name}? Esta ação não pode ser desfeita.`))) return;
      const res = await fetch(`${API_BASE}/auth/users/${u.id}`, { method: 'DELETE' });
      if (!res.ok) {
        showToast(await parseErroApi(res, 'Erro ao excluir usuário.'), 'error');
        return;
      }
      showToast('Usuário excluído com sucesso.', 'success');
      loadUsuarios();
    }
  });

  // Modal de redefinição de senha
  const fecharModalReset = () => modalReset?.classList.add('hidden');
  document.getElementById('btn-fechar-reset-senha')?.addEventListener('click', fecharModalReset);
  document.getElementById('btn-cancelar-reset-senha')?.addEventListener('click', fecharModalReset);
  formReset?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const uid = inputResetId.value;
    const nova = (document.getElementById('input-reset-nova-senha') as HTMLInputElement).value;
    const conf = (document.getElementById('input-reset-confirma-senha') as HTMLInputElement).value;
    if (nova.length < 6) {
      showToast('A senha deve conter no mínimo 6 caracteres.', 'error');
      return;
    }
    if (nova !== conf) {
      showToast('As senhas não conferem.', 'error');
      return;
    }
    const res = await fetch(`${API_BASE}/auth/users/${uid}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_password: nova })
    });
    if (!res.ok) {
      showToast(await parseErroApi(res, 'Erro ao redefinir senha.'), 'error');
      return;
    }
    showToast('Senha redefinida e sessões anteriores encerradas.', 'success');
    fecharModalReset();
    loadUsuarios();
  });

  // Filtros e busca
  document.getElementById('acessos-filtro-seg')?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-filtro]');
    if (!btn) return;
    filtroAtual = (btn.dataset.filtro as any) || 'todos';
    document.querySelectorAll('#acessos-filtro-seg button').forEach(b => b.classList.toggle('is-active', b === btn));
    renderUsuarios();
  });

  document.getElementById('busca-usuario')?.addEventListener('input', (e) => {
    termoBusca = (e.target as HTMLInputElement).value;
    renderUsuarios();
  });

  loadUsuarios();
};
