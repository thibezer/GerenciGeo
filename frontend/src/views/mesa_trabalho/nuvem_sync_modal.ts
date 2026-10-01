/**
 * nuvem_sync_modal.ts — Controlador Global do Modal de Sincronização e Tempo Real (Hostinger)
 */

import { initIcons, showToast } from '../../utils';
import { realtimeSyncClient } from '../../utils/realtime_sync_client';
import type { SyncEventItem, SyncStatusPayload } from '../../utils/realtime_sync_client';


let activeCtx: any = null;
let isInitialized = false;

export function setNuvemSyncContext(ctx: any) {
  activeCtx = ctx;
}

export function initNuvemSyncModal(ctx?: any) {
  if (ctx) {
    activeCtx = ctx;
  }
  if (isInitialized) {
    return;
  }

  const modal = document.getElementById('modal-nuvem-sync') as HTMLElement;
  if (!modal) return;
  isInitialized = true;

  const btnPill = document.getElementById('btn-global-sync-pill') as HTMLButtonElement;
  const btnFecharModal = document.getElementById('btn-fechar-modal-nuvem') as HTMLButtonElement;

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
  const labelHeartbeat = document.getElementById('label-nuvem-ultimo-heartbeat') as HTMLElement;
  const btnLogout = document.getElementById('btn-nuvem-logout') as HTMLButtonElement;

  const toggleRealtime = document.getElementById('toggle-realtime-sync') as HTMLInputElement;
  const btnSyncTudo = document.getElementById('btn-nuvem-sincronizar-tudo') as HTMLButtonElement;
  const btnPull = document.getElementById('btn-nuvem-pull-manual') as HTMLButtonElement;
  const btnPush = document.getElementById('btn-nuvem-push-manual') as HTMLButtonElement;

  const feedEventos = document.getElementById('feed-nuvem-eventos') as HTMLElement;
  const labelContadorEventos = document.getElementById('label-nuvem-contador-eventos') as HTMLElement;

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
    renderizarFeedEventos();
  };

  document.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement)?.closest('#btn-sincronizar-nuvem, .btn-abrir-nuvem');
    if (target) {
      e.preventDefault();
      abrirModal();
    }
  });

  if (btnPill) {
    btnPill.onclick = (e) => {
      e.preventDefault();
      abrirModal();
    };
  }

  if (btnFecharModal) {
    btnFecharModal.onclick = fecharModal;
  }

  modal.onclick = (e) => {
    if (e.target === modal) fecharModal();
  };

  window.addEventListener('gerencigeo:abrir_modal_nuvem', () => {
    abrirModal();
  });

  /**
   * Renderiza a lista de eventos recentes de sincronização em tempo real
   */
  const renderizarFeedEventos = () => {
    if (!feedEventos) return;
    const eventos = realtimeSyncClient.getRecentEvents();

    if (labelContadorEventos) {
      labelContadorEventos.innerText = `${eventos.length} evento(s)`;
    }

    if (!eventos || eventos.length === 0) {
      feedEventos.innerHTML = `<div class="text-white/30 text-center py-2 text-[10px]">Nenhuma atividade recente registrada.</div>`;
      return;
    }

    feedEventos.innerHTML = eventos.map((evt: SyncEventItem) => {
      let iconColor = "text-mint-vibrant";
      let iconName = "activity";

      if (evt.tipo === 'push') {
        iconColor = "text-cyan-400";
        iconName = "upload-cloud";
      } else if (evt.tipo === 'pull') {
        iconColor = "text-emerald-400";
        iconName = "download-cloud";
      } else if (evt.tipo === 'warning') {
        iconColor = "text-amber-400";
        iconName = "alert-circle";
      } else if (evt.tipo === 'error') {
        iconColor = "text-red-400";
        iconName = "x-circle";
      }

      return `
        <div class="flex items-start justify-between gap-2 py-1 border-b border-white/5 last:border-0 hover:bg-white/[0.02] px-1 rounded transition-colors">
          <div class="flex items-start gap-1.5 min-w-0">
            <span class="${iconColor} shrink-0 mt-0.5"><i data-lucide="${iconName}" class="w-3 h-3"></i></span>
            <div class="min-w-0">
              <span class="text-white/90 font-medium block truncate">${evt.titulo}</span>
              ${evt.detalhe ? `<span class="text-white/40 text-[9px] block truncate">${evt.detalhe}</span>` : ''}
            </div>
          </div>
          <span class="text-white/30 text-[9px] shrink-0 font-mono">${evt.hora}</span>
        </div>
      `;
    }).join('');

    initIcons();
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

      const res = await fetch(`/nuvem/realtime/status`);
      const data: SyncStatusPayload = await res.json();

      if (data.status !== 'OFFLINE' && data.status !== 'UNAUTHENTICATED') {
        if (badgeStatus) {
          badgeStatus.innerText = "Tempo Real Ativo";
          badgeStatus.className = "text-[9px] font-mono uppercase px-2 py-0.5 rounded font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25";
        }
      } else if (data.status === 'OFFLINE') {
        if (badgeStatus) {
          badgeStatus.innerText = "Offline";
          badgeStatus.className = "text-[9px] font-mono uppercase px-2 py-0.5 rounded font-bold bg-red-500/10 text-red-400 border border-red-500/25";
        }
      } else {
        if (badgeStatus) {
          badgeStatus.innerText = "Desconectado";
          badgeStatus.className = "text-[9px] font-mono uppercase px-2 py-0.5 rounded font-bold bg-white/10 text-white/50 border border-white/15";
        }
      }

      if (data.autenticado && data.user) {
        if (containerDesconectado) containerDesconectado.classList.add('hidden');
        if (containerConectado) containerConectado.classList.remove('hidden');

        const nome = data.user.name || "Operador";
        const email = data.user.email || "";
        if (labelNome) labelNome.innerText = nome;
        if (labelEmail) labelEmail.innerText = email;
        if (labelAvatar) labelAvatar.innerText = nome.charAt(0).toUpperCase();
        if (labelUltimaSinc) labelUltimaSinc.innerText = data.last_sync || "Nunca sincronizado";
        if (labelHeartbeat) {
          labelHeartbeat.innerText = `Ativo (${data.check_interval || 8}s)`;
        }

        if (toggleRealtime) {
          toggleRealtime.checked = data.enabled;
        }
      } else {
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
   * Toggle de Sincronização em Tempo Real
   */
  if (toggleRealtime) {
    toggleRealtime.onchange = () => {
      const ativado = toggleRealtime.checked;
      realtimeSyncClient.setEnabled(ativado);
      showToast(ativado ? "✓ Sincronização em tempo real ativada!" : "Sincronização em tempo real pausada.", ativado ? "success" : "info");
      if (labelHeartbeat) {
        labelHeartbeat.innerText = ativado ? "Ativo (8s)" : "Pausado";
        labelHeartbeat.className = ativado ? "font-mono text-emerald-400 text-xs" : "font-mono text-amber-400 text-xs";
      }
    };
  }

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
        const res = await fetch(`/nuvem/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (res.ok && data.sucesso) {
          showToast("✓ Conectado à Nuvem com sucesso!", "success");
          await verificarStatusNuvem();
          renderizarFeedEventos();
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
        await fetch(`/nuvem/logout`, { method: 'POST' });
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
   * Sincronização Bidirecional (Tudo) Forçada
   */
  if (btnSyncTudo) {
    btnSyncTudo.onclick = async () => {
      const originalHtml = btnSyncTudo.innerHTML;
      btnSyncTudo.disabled = true;
      btnSyncTudo.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Sincronizando com a Nuvem...</span>`;
      initIcons();

      try {
        const res = await fetch(`/nuvem/sincronizar`, { method: 'POST' });
        const data = await res.json();

        if (res.ok && data.sucesso) {
          const rec = data.pull?.total_recebidos || 0;
          const env = data.push?.total_registros || 0;
          const msg = `Download: ${rec} registros atualizados | Upload: ${env} registros enviados.`;

          showToast("✓ Sincronização concluída com sucesso!", "success");
          exibirResultadoSync(true, "Sincronização Completa", msg);
          if (labelUltimaSinc) labelUltimaSinc.innerText = data.last_sync || "Agora";

          if (activeCtx && typeof activeCtx.loadLevantamentoDetails === 'function') {
            await activeCtx.loadLevantamentoDetails();
          }
          renderizarFeedEventos();
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
        const res = await fetch(`/nuvem/pull`, { method: 'POST' });
        const data = await res.json();
        if (res.ok && data.sucesso) {
          showToast(`✓ Download concluído: ${data.total_recebidos} registros atualizados!`, "success");
          exibirResultadoSync(true, "Download Concluído", data.mensagem);
          if (activeCtx && typeof activeCtx.loadLevantamentoDetails === 'function') {
            await activeCtx.loadLevantamentoDetails();
          }
          renderizarFeedEventos();
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
        const res = await fetch(`/nuvem/push`, { method: 'POST' });
        const data = await res.json();
        if (res.ok && data.sucesso) {
          showToast(`✓ Envio concluído: ${data.total_registros} registros transmitidos!`, "success");
          exibirResultadoSync(true, "Envio Concluído", data.mensagem);
          renderizarFeedEventos();
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

  // Escuta atualizações do WebSocket para atualizar o modal dinamicamente quando estiver aberto
  window.addEventListener('gerencigeo:sync_status', (e: any) => {
    if (!modal.classList.contains('hidden')) {
      const s = e.detail;
      if (s) {
        if (labelUltimaSinc && s.last_sync) labelUltimaSinc.innerText = s.last_sync;
        if (labelHeartbeat && s.check_interval) {
          labelHeartbeat.innerText = s.enabled ? `Ativo (${s.check_interval}s)` : 'Pausado';
        }
      }
    }
  });

  window.addEventListener('gerencigeo:sync_event', () => {
    if (!modal.classList.contains('hidden')) {
      renderizarFeedEventos();
    }
  });
}
