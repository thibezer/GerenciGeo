/**
 * realtime_sync_client.ts — Cliente WebSocket para sincronização contínua em tempo real
 * Mantém conexão ativa com o backend local do GerenciGeo e reflete o estado na interface.
 */

import { showToast } from '../utils';

export interface SyncStatusPayload {
  status: 'SYNCED' | 'SYNCING' | 'PENDING_PUSH' | 'OFFLINE' | 'UNAUTHENTICATED' | 'PAUSED';
  enabled: boolean;
  running: boolean;
  autenticado: boolean;
  user?: { name: string; email: string; role?: string } | null;
  last_sync?: string | null;
  last_check?: string | null;
  pending_push: boolean;
  pending_tables: string[];
  check_interval: number;
  last_error?: string | null;
  server_time?: string;
}

export interface SyncEventItem {
  id: string;
  tipo: 'info' | 'success' | 'warning' | 'error' | 'push' | 'pull';
  titulo: string;
  detalhe?: string;
  hora: string;
  timestamp: number;
}

class RealtimeSyncClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: any = null;
  private currentStatus: SyncStatusPayload | null = null;
  private recentEvents: SyncEventItem[] = [];
  private isConnecting: boolean = false;

  constructor() {
    // Singleton
  }

  public init() {
    this.conectar();
    this.vincularPillHeader();
  }

  private obterWsUrl(): string {
    const isHttps = window.location.protocol === 'https:';
    const protocol = isHttps ? 'wss:' : 'ws:';
    const host = window.location.host;

    // Se estiver rodando no Vite Dev Server (porta 5173/3000), direciona para porta 8000
    if (host.includes(':5173') || host.includes(':3000')) {
      return `${protocol}//127.0.0.1:8000/ws/realtime-sync`;
    }
    return `${protocol}//${host}/ws/realtime-sync`;
  }

  private conectar() {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;
    const wsUrl = this.obterWsUrl();

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnecting = false;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.processarMensagem(msg);
        } catch (e) {
          console.warn("[RealtimeSync] Mensagem inválida recebida:", event.data);
        }
      };

      this.ws.onclose = () => {
        this.isConnecting = false;
        this.ws = null;
        this.atualizarStatusPillFallbackOffline();
        this.agendarReconexao();
      };

      this.ws.onerror = () => {
        this.isConnecting = false;
      };
    } catch (err) {
      this.isConnecting = false;
      this.agendarReconexao();
    }
  }

  private agendarReconexao() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.conectar();
    }, 5000);
  }

  private processarMensagem(msg: any) {
    switch (msg.type) {
      case 'INITIAL_STATE':
        this.currentStatus = msg.data;
        if (Array.isArray(msg.recent_events)) {
          this.recentEvents = msg.recent_events;
        }
        this.atualizarUI();
        this.dispararEventoCustomizado('gerencigeo:sync_status', this.currentStatus);
        break;

      case 'STATUS_CHANGE':
        this.currentStatus = msg.data;
        this.atualizarUI();
        this.dispararEventoCustomizado('gerencigeo:sync_status', this.currentStatus);
        break;

      case 'DATA_UPDATED':
        // Notifica as views ativas que dados foram recebidos da Nuvem em tempo real
        this.adicionarEventoRecente({
          id: `evt_${Date.now()}`,
          tipo: 'pull',
          titulo: 'Download em Tempo Real',
          detalhe: `${msg.total_recebidos || 0} registros recebidos`,
          hora: new Date().toLocaleTimeString(),
          timestamp: Date.now() / 1000
        });

        if (msg.total_recebidos && msg.total_recebidos > 0) {
          showToast(`⚡ ${msg.total_recebidos} registro(s) sincronizado(s) em tempo real da nuvem!`, 'info');
        }

        this.dispararEventoCustomizado('gerencigeo:data_updated', msg);
        break;

      case 'SYNC_COMPLETED':
        this.adicionarEventoRecente({
          id: `evt_${Date.now()}`,
          tipo: 'push',
          titulo: 'Upload em Tempo Real',
          detalhe: `${msg.total_enviados || 0} registros enviados à Nuvem`,
          hora: new Date().toLocaleTimeString(),
          timestamp: Date.now() / 1000
        });
        break;
    }
  }

  private adicionarEventoRecente(evt: SyncEventItem) {
    this.recentEvents.unshift(evt);
    if (this.recentEvents.length > 40) {
      this.recentEvents.pop();
    }
    this.dispararEventoCustomizado('gerencigeo:sync_event', evt);
  }

  private dispararEventoCustomizado(nome: string, detalhe: any) {
    window.dispatchEvent(new CustomEvent(nome, { detail: detalhe }));
  }

  public getStatus(): SyncStatusPayload | null {
    return this.currentStatus;
  }

  public getRecentEvents(): SyncEventItem[] {
    return this.recentEvents;
  }

  public sincronizarAgora(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'sync_now' }));
    } else {
      fetch('/nuvem/sincronizar', { method: 'POST' }).catch(console.error);
    }
  }

  public setEnabled(enabled: boolean): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'toggle_enabled', enabled }));
    } else {
      fetch('/nuvem/realtime/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      }).catch(console.error);
    }
  }

  /**
   * Vincula o clique do pill do topo da tela para abrir o modal de sincronização
   */
  private vincularPillHeader() {
    const btnPill = document.getElementById('btn-global-sync-pill');
    if (btnPill) {
      btnPill.onclick = (e) => {
        e.preventDefault();
        const modal = document.getElementById('modal-nuvem-sync');
        if (modal) {
          modal.classList.remove('hidden');
          window.dispatchEvent(new CustomEvent('gerencigeo:abrir_modal_nuvem'));
        }
      };
    }
  }

  /**
   * Atualiza as cores e o texto do Pill de sincronização no topo global
   */
  private atualizarUI() {
    const dot = document.getElementById('sync-pill-dot');
    const text = document.getElementById('sync-pill-text');
    const badge = document.getElementById('sync-pill-badge');
    const btnPill = document.getElementById('btn-global-sync-pill');

    if (!dot || !text || !badge || !btnPill) return;

    const s = this.currentStatus?.status;
    const isAutenticado = this.currentStatus?.autenticado;

    if (!isAutenticado || s === 'UNAUTHENTICATED') {
      dot.className = "w-2 h-2 rounded-full bg-slate-400";
      text.innerText = "Nuvem";
      badge.className = "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-white/10 text-white/50";
      badge.innerText = "Desconectado";
      btnPill.setAttribute('title', 'Clique para entrar na Nuvem e sincronizar em tempo real');
      return;
    }

    switch (s) {
      case 'SYNCED':
        dot.className = "w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse";
        text.innerText = "Tempo Real";
        badge.className = "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
        badge.innerText = "Sincronizado";
        btnPill.setAttribute('title', `Conectado em tempo real com a Nuvem. Última verificação: ${this.currentStatus?.last_check || 'agora'}`);
        break;

      case 'SYNCING':
        dot.className = "w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] animate-ping";
        text.innerText = "Sincronizando...";
        badge.className = "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/30";
        badge.innerText = "Transmitindo";
        btnPill.setAttribute('title', 'Transmitindo dados em segundo plano...');
        break;

      case 'PENDING_PUSH':
        dot.className = "w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)] animate-pulse";
        text.innerText = "Salvando...";
        badge.className = "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30";
        badge.innerText = "Pendente";
        btnPill.setAttribute('title', 'Alterações locais sendo empacotadas para envio');
        break;

      case 'OFFLINE':
        dot.className = "w-2 h-2 rounded-full bg-rose-500";
        text.innerText = "Modo Local";
        badge.className = "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30";
        badge.innerText = "Offline";
        btnPill.setAttribute('title', 'Sem conexão com a Nuvem. O sistema continua operando 100% no banco local.');
        break;

      case 'PAUSED':
        dot.className = "w-2 h-2 rounded-full bg-amber-500/60";
        text.innerText = "Pausado";
        badge.className = "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-amber-500/10 text-amber-400/80";
        badge.innerText = "Manual";
        btnPill.setAttribute('title', 'Sincronização em tempo real pausada pelo usuário.');
        break;

      default:
        dot.className = "w-2 h-2 rounded-full bg-emerald-400 animate-pulse";
        text.innerText = "Tempo Real";
        badge.className = "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-emerald-500/20 text-emerald-400";
        badge.innerText = "Ativo";
    }
  }

  private atualizarStatusPillFallbackOffline() {
    const dot = document.getElementById('sync-pill-dot');
    const text = document.getElementById('sync-pill-text');
    const badge = document.getElementById('sync-pill-badge');
    if (!dot || !text || !badge) return;

    dot.className = "w-2 h-2 rounded-full bg-rose-500/60";
    text.innerText = "Reconectando";
    badge.className = "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-rose-500/10 text-rose-400/70";
    badge.innerText = "Tentando...";
  }
}

export const realtimeSyncClient = new RealtimeSyncClient();
