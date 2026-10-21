import type { RouteDef } from '../types';
import { API_BASE } from '../config';
import { registerInterval, showToast, initIcons } from '../utils';
import {
  classificarLog,
  extrairProgresso,
  percentual,
  estadoHgo,
  ROTULO_ESTADO,
  type EstadoHgo
} from './hgo/hgo_helpers';

const CLASSE_ESTADO: Record<EstadoHgo, string> = {
  'sem-pasta': 'lp-tag-mute',
  pronto: 'lp-tag-info',
  processando: 'lp-tag-warn',
  concluido: 'lp-tag-pf',
  erro: 'lp-tag-danger'
};

export const hgoRoute: RouteDef = {
  render: () => `
    <div class="gap-2 animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col h-full min-h-0 flex-1">
      <!-- Barra superior (padrão de listagem): título + contexto + ações -->
      <div class="lp-bar">
        <div class="lp-bar-left">
          <h2 class="lp-titulo">Organizador HGO</h2>
          <span class="lp-sub lp-oculta-sm" style="font-size:12.5px">Organização inteligente de arquivos brutos por base e rover</span>
        </div>
        <div class="lp-bar-right">
          <button type="button" class="lp-btn-sec" id="btn-pick-folder">
            <i data-lucide="folder-tree" class="w-3.5 h-3.5"></i>
            Procurar pasta
          </button>
          <button type="button" class="lp-btn-primario" id="btn-start-hgo">
            <i data-lucide="play" class="w-4 h-4"></i>
            Converter e organizar
          </button>
        </div>
      </div>

      <!-- Faixa da pasta de trabalho + estado -->
      <div class="lp-faixa">
        <span class="lp-faixa-rotulo">Pasta de trabalho</span>
        <span class="lp-faixa-valor" id="lbl-folder-path" title="Nenhuma pasta selecionada"><bdi>Nenhuma pasta selecionada...</bdi></span>
        <span class="lp-tag lp-tag-mute" id="hgo-estado" role="status" aria-live="polite">${ROTULO_ESTADO['sem-pasta']}</span>
      </div>

      <!-- Progresso (aparece quando o log informa [n/m]) -->
      <div class="lp-faixa hidden" id="hgo-progress-panel">
        <span class="lp-faixa-rotulo">Progresso</span>
        <div class="lp-progresso" role="progressbar" aria-valuemin="0" aria-valuemax="100" id="hgo-progress-track"><div id="hgo-progress-bar"></div></div>
        <span class="lp-mono" style="font-size:12.5px;font-weight:700;color:var(--lp-accent)" id="hgo-progress-percent">0/0 (0%)</span>
      </div>

      <!-- Terminal de logs: ocupa o resto da altura e rola por dentro -->
      <div class="lp-card" style="background:#050a08">
        <div class="lp-card-titulo">
          <i data-lucide="terminal"></i>
          Terminal de logs HGO
          <span class="lp-sub" style="margin-left:auto;font-size:11px;text-transform:none;letter-spacing:0" id="hgo-log-count">0 linhas</span>
        </div>
        <div class="lp-terminal" id="terminal-output-hgo" role="log" aria-live="off">
          <div class="lp-log is-ocioso">[IDLE] Aguardando seleção de pasta.</div>
        </div>
      </div>
    </div>
  `,
  setup: () => {
    initIcons();
    let currentFolder = "";
    let ultimosLogs: string[] = [];
    const lblPath = document.getElementById('lbl-folder-path');
    const term = document.getElementById('terminal-output-hgo');
    let lastLogCount = 0;

    const atualizarEstado = () => {
      const chip = document.getElementById('hgo-estado');
      if (!chip) return;
      const estado = estadoHgo(!!currentFolder, extrairProgresso(ultimosLogs), ultimosLogs[ultimosLogs.length - 1]);
      chip.className = `lp-tag ${CLASSE_ESTADO[estado]}`;
      chip.innerText = ROTULO_ESTADO[estado];
    };

    const pollLogs = () => {
      fetch(`${API_BASE}/logs`)
        .then(res => {
          if (!res.ok) throw new Error('Erro na requisição');
          return res.json();
        })
        .then(data => {
          const logs: string[] = data.logs || [];
          if (logs.length > lastLogCount && term) {
            term.innerHTML = '';
            logs.forEach(log => {
              const div = document.createElement('div');
              const nivel = classificarLog(log);
              div.className = nivel === 'info' ? 'lp-log' : `lp-log is-${nivel}`;
              div.innerText = `> ${log}`;
              term.appendChild(div);
            });
            term.scrollTop = term.scrollHeight;
            lastLogCount = logs.length;
            ultimosLogs = logs;

            const contador = document.getElementById('hgo-log-count');
            if (contador) contador.innerText = `${logs.length} linha(s)`;

            const progresso = extrairProgresso(logs);
            if (progresso) {
              const pct = percentual(progresso);
              document.getElementById('hgo-progress-panel')?.classList.remove('hidden');
              const progressPercent = document.getElementById('hgo-progress-percent');
              const progressBar = document.getElementById('hgo-progress-bar');
              if (progressPercent) progressPercent.innerText = `${progresso.processados}/${progresso.total} (${pct}%)`;
              if (progressBar) progressBar.style.width = `${pct}%`;
              document.getElementById('hgo-progress-track')?.setAttribute('aria-valuenow', String(pct));
            }
            atualizarEstado();
          }
        })
        .catch(err => console.warn('Erro ao buscar logs HGO:', err));
    };
    const intervalId = window.setInterval(pollLogs, 1000);
    registerInterval(intervalId);

    document.getElementById('btn-pick-folder')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      btn.disabled = true;
      try {
        const res = await fetch(`${API_BASE}/pick-folder`);
        if (!res.ok) throw new Error('Erro ao abrir pasta');
        const data = await res.json();
        if (data.path) {
          currentFolder = data.path;
          if (lblPath) {
            // <bdi> + direction:rtl no CSS mostram o FIM do caminho (a pasta que importa) quando ele é longo
            lblPath.innerHTML = '';
            const texto = document.createElement('bdi');
            texto.innerText = currentFolder;
            lblPath.appendChild(texto);
            lblPath.title = currentFolder;
            lblPath.classList.add('tem-valor');
          }
          atualizarEstado();
          showToast("Pasta de trabalho selecionada com sucesso!", "success");
        }
      } catch (e) {
        console.error(e);
        showToast("Erro ao abrir janela de diretório.", "error");
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('btn-start-hgo')?.addEventListener('click', async (e) => {
      if (!currentFolder) {
        showToast("Selecione uma pasta de arquivos brutos primeiro!", "error");
        return;
      }
      const btn = e.currentTarget as HTMLButtonElement;
      btn.disabled = true;
      try {
        showToast("Iniciando esteira de processamento GNSS...", "info");
        const res = await fetch(`${API_BASE}/process/hgo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pasta: currentFolder })
        });
        if (!res.ok) throw new Error('Erro no processo');
      } catch (e) {
        console.error(e);
        showToast("Erro ao disparar processo HGO.", "error");
      } finally {
        btn.disabled = false;
      }
    });
  }
};
