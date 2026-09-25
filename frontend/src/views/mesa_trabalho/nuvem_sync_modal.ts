/**
 * nuvem_sync_modal.ts — Controlador do Modal de Sincronização e Login da Nuvem Hostinger
 */

import { initIcons, showToast } from '../../utils';

const API_BASE = '/api';

export function initNuvemSyncModal(ctx: any) {
  const modal = document.getElementById('modal-nuvem-sync') as HTMLElement;
  const btnAbrirModal = document.getElementById('btn-sincronizar-nuvem') as HTMLButtonElement;
  const btnFecharModal = document.getElementById('btn-fechar-modal-nuvem') as HTMLButtonElement;

  if (!modal || !btnAbrirModal) return;

  const badgeStatus = document.getElementById('badge-nuvem-status') as HTMLElement;
  const containerDesconectado = document.getElementById('container-nuvem-desconectado') as HTMLElement;
  const containerConectado = document.getElementById('container-nuvem-conectado') as HTMLElement;

  const formLogin = document.getElementById('form-nuvem-login') as HTMLFormElement;
  const inputEmail = document.getElementById('input-nuvem-email') as HTMLInputElement;
  const inputSenha = document.getElementById('input-nuvem-senha') as HTMLInputElement;
  const alertaErro = document.getElementById('alerta-nuvem-login-erro') as HTMLElement;
  const btnSubmeterLogin = document.getElementById('btn-submeter-nuvem-login') as HTMLButtonElement;

  const labelAvatar = document.getElementById('label-nuvem-avatar') as HTMLElement;
  const labelNome = document.getElementById('label-nuvem-nome-usuario') as HTMLElement;
  const labelEmail = document.getElementById('label-nuvem-email-usuario') as HTMLElement;
  const labelUltimaSinc = document.getElementById('label-nuvem-ultima-sinc') as HTMLElement;
  const btnLogout = document.getElementById('btn-nuvem-logout') as HTMLButtonElement;

  const btnSyncTudo = document.getElementById('btn-nuvem-sincronizar-tudo') as HTMLButtonElement;
  const btnPull = document.getElementById('btn-nuvem-pull-manual') as HTMLButtonElement;
  const btnPush = document.getElementById('btn-nuvem-push-manual') as HTMLButtonElement;

  const containerResultado = document.getElementById('container-nuvem-resultado-sync') as HTMLElement;
  const labelResultadoStatus = document.getElementById('label-nuvem-resultado-status') as HTMLElement;
  const labelResultadoHora = document.getElementById('label-nuvem-resultado-hora') as HTMLElement;
  const labelResultadoMsg = document.getElementById('label-nuvem-resultado-msg') as HTMLElement;

  const fecharModal = () => {
    modal.classList.add('hidden');
  };

  const abrirModal = async () => {
    modal.classList.remove('hidden');
    initIcons();
    await verificarStatusNuvem();
  };

  btnAbrirModal.onclick = (e) => {
    e.preventDefault();
    abrirModal();
  };

  if (btnFecharModal) {
    btnFecharModal.onclick = fecharModal;
  }

  modal.onclick = (e) => {
    if (e.target === modal) fecharModal();
  };

  /**
   * Consulta o backend para checar conexão e autenticação
   */
  const verificarStatusNuvem = async () => {
    try {
      if (badgeStatus) {
        badgeStatus.innerText = "Verificando...";
        badgeStatus.className = "text-[9px] font-mono uppercase px-2 py-0.5 rounded font-bold bg-white/5 text-white/50 border border-white/10";
      }

      const res = await fetch(`${API_BASE}/nuvem/status`);
      const data = await res.json();

      if (data.online) {
        if (badgeStatus) {
          badgeStatus.innerText = "Online";
          badgeStatus.className = "text-[9px] font-mono uppercase px-2 py-0.5 rounded font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25";
        }
      } else {
        if (badgeStatus) {
          badgeStatus.innerText = "Offline";
          badgeStatus.className = "text-[9px] font-mono uppercase px-2 py-0.5 rounded font-bold bg-red-500/10 text-red-400 border border-red-500/25";
        }
      }

      if (data.autenticado && data.user) {
        // Exibe tela conectada
        if (containerDesconectado) containerDesconectado.classList.add('hidden');
        if (containerConectado) containerConectado.classList.remove('hidden');

        const nome = data.user.name || "Operador";
        const email = data.user.email || "";
        if (labelNome) labelNome.innerText = nome;
        if (labelEmail) labelEmail.innerText = email;
        if (labelAvatar) labelAvatar.innerText = nome.charAt(0).toUpperCase();
        if (labelUltimaSinc) labelUltimaSinc.innerText = data.last_sync || "Nunca sincronizado";
      } else {
        // Exibe tela de login
        if (containerConectado) containerConectado.classList.add('hidden');
        if (containerDesconectado) containerDesconectado.classList.remove('hidden');
      }

      initIcons();
    } catch (err: any) {
      console.error("Erro ao checar status da nuvem:", err);
      if (badgeStatus) {
        badgeStatus.innerText = "Erro Local";
        badgeStatus.className = "text-[9px] font-mono uppercase px-2 py-0.5 rounded font-bold bg-red-500/10 text-red-400 border border-red-500/25";
      }
    }
  };

  /**
   * Formulário de Login
   */
  if (formLogin) {
    formLogin.onsubmit = async (e) => {
      e.preventDefault();
      if (alertaErro) alertaErro.classList.add('hidden');

      const email = inputEmail.value.trim();
      const password = inputSenha.value;

      if (!email || !password) return;

      const originalHtml = btnSubmeterLogin.innerHTML;
      btnSubmeterLogin.disabled = true;
      btnSubmeterLogin.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Conectando...</span>`;
      initIcons();

      try {
        const res = await fetch(`${API_BASE}/nuvem/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (res.ok && data.sucesso) {
          showToast("✓ Conectado à Nuvem com sucesso!", "success");
          await verificarStatusNuvem();
        } else {
          const msg = data.detail || data.mensagem || "Falha ao autenticar na nuvem.";
          if (alertaErro) {
            alertaErro.innerText = msg;
            alertaErro.classList.remove('hidden');
          }
        }
      } catch (err: any) {
        if (alertaErro) {
          alertaErro.innerText = `Erro de conexão: ${err.message}`;
          alertaErro.classList.remove('hidden');
        }
      } finally {
        btnSubmeterLogin.disabled = false;
        btnSubmeterLogin.innerHTML = originalHtml;
        initIcons();
      }
    };
  }

  /**
   * Logout
   */
  if (btnLogout) {
    btnLogout.onclick = async () => {
      if (!confirm("Deseja realmente desconectar deste computador?")) return;
      try {
        await fetch(`${API_BASE}/nuvem/logout`, { method: 'POST' });
        showToast("Sessão desconectada.", "info");
        await verificarStatusNuvem();
      } catch (err: any) {
        console.error("Erro ao efetuar logout:", err);
      }
    };
  }

  /**
   * Helper para exibir o log de resultado no modal
   */
  const exibirResultadoSync = (sucesso: boolean, titulo: string, msg: string) => {
    if (!containerResultado) return;
    containerResultado.classList.remove('hidden');
    if (labelResultadoStatus) {
      labelResultadoStatus.innerText = sucesso ? `✓ ${titulo}` : `✕ ${titulo}`;
      labelResultadoStatus.className = sucesso ? "text-mint-vibrant font-bold" : "text-red-400 font-bold";
    }
    if (labelResultadoHora) {
      labelResultadoHora.innerText = new Date().toLocaleTimeString();
    }
    if (labelResultadoMsg) {
      labelResultadoMsg.innerText = msg;
    }
  };

  /**
   * Sincronização Bidirecional (Tudo)
   */
  if (btnSyncTudo) {
    btnSyncTudo.onclick = async () => {
      const originalHtml = btnSyncTudo.innerHTML;
      btnSyncTudo.disabled = true;
      btnSyncTudo.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Sincronizando com a Nuvem...</span>`;
      initIcons();

      try {
        const res = await fetch(`${API_BASE}/nuvem/sincronizar`, { method: 'POST' });
        const data = await res.json();

        if (res.ok && data.sucesso) {
          const rec = data.pull?.total_recebidos || 0;
          const env = data.push?.total_registros || 0;
          const msg = `Download: ${rec} registros atualizados | Upload: ${env} registros enviados.`;

          showToast("✓ Sincronização concluída com sucesso!", "success");
          exibirResultadoSync(true, "Sincronização Completa", msg);
          if (labelUltimaSinc) labelUltimaSinc.innerText = data.last_sync || "Agora";

          // Atualiza dados na mesa de trabalho se houver levantamento ativo
          if (ctx.loadLevantamentoDetails) {
            await ctx.loadLevantamentoDetails();
          }
        } else {
          const errDetail = data.detail || data.mensagem || "Falha na sincronização.";
          showToast(errDetail, "error");
          exibirResultadoSync(false, "Falha na Sincronização", errDetail);
        }
      } catch (err: any) {
        showToast(err.message || "Erro de conexão com o servidor.", "error");
        exibirResultadoSync(false, "Erro de Conexão", err.message);
      } finally {
        btnSyncTudo.disabled = false;
        btnSyncTudo.innerHTML = originalHtml;
        initIcons();
      }
    };
  }

  /**
   * Baixar Manualmente (Pull)
   */
  if (btnPull) {
    btnPull.onclick = async () => {
      const originalHtml = btnPull.innerHTML;
      btnPull.disabled = true;
      btnPull.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>Baixando...</span>`;
      initIcons();

      try {
        const res = await fetch(`${API_BASE}/nuvem/pull`, { method: 'POST' });
        const data = await res.json();
        if (res.ok && data.sucesso) {
          showToast(`✓ Download concluído: ${data.total_recebidos} registros atualizados!`, "success");
          exibirResultadoSync(true, "Download Concluído", data.mensagem);
          if (ctx.loadLevantamentoDetails) await ctx.loadLevantamentoDetails();
        } else {
          showToast(data.detail || data.mensagem || "Erro ao baixar dados.", "error");
        }
      } catch (err: any) {
        showToast(err.message, "error");
      } finally {
        btnPull.disabled = false;
        btnPull.innerHTML = originalHtml;
        initIcons();
      }
    };
  }

  /**
   * Enviar Manualmente (Push)
   */
  if (btnPush) {
    btnPush.onclick = async () => {
      const originalHtml = btnPush.innerHTML;
      btnPush.disabled = true;
      btnPush.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>Enviando...</span>`;
      initIcons();

      try {
        const res = await fetch(`${API_BASE}/nuvem/push`, { method: 'POST' });
        const data = await res.json();
        if (res.ok && data.sucesso) {
          showToast(`✓ Envio concluído: ${data.total_registros} registros transmitidos!`, "success");
          exibirResultadoSync(true, "Envio Concluído", data.mensagem);
        } else {
          showToast(data.detail || data.mensagem || "Erro ao enviar dados.", "error");
        }
      } catch (err: any) {
        showToast(err.message, "error");
      } finally {
        btnPush.disabled = false;
        btnPush.innerHTML = originalHtml;
        initIcons();
      }
    };
  }
}
