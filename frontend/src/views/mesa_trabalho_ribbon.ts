import { FluentRibbonManager as RibbonManager } from '../ui/fluent_ribbon_manager';
import type { MesaTrabalhoContext } from './mesa_trabalho/mesa_trabalho_context';
import { API_BASE } from '../config';
import { showToast } from '../utils';
import { registerFluentComponents } from '../ui/fluent_setup';
import { activeRibbonManagers, setActiveRibbonManager, resetActiveRibbonManagers } from './mesa_trabalho';

export function setupRibbonInteractions(ctx: any): void {
  registerFluentComponents();
  const tabButtons = document.querySelectorAll('.rl3-tab');
  const panelRows = document.querySelectorAll('.rl3-panel');

  // Inicializa o Gerenciador de Responsividade do Ribbon para todos os painéis de abas
  const ribbonPanelIds = ['panel-geoprocessamento', 'panel-perimetro', 'panel-cartorio', 'panel-auditoria'];

  // Limpa instâncias anteriores caso já existam
  Object.values(activeRibbonManagers).forEach(rm => rm.destroy());
  resetActiveRibbonManagers();

  ribbonPanelIds.forEach(panelId => {
    try {
      const rm = new RibbonManager(panelId);
      rm.init().catch(console.error);
      activeRibbonManagers[panelId] = rm;
    } catch (err) {
      console.warn(`[RibbonManager] Painel ${panelId} não inicializado:`, err);
    }
  });

  // Suporte a navegabilidade nativa por teclado no <fluent-tablist> (Setas Esquerda/Direita)
  const tablist = document.querySelector('fluent-tablist');
  if (tablist) {
    tablist.addEventListener('change', (e: Event) => {
      const target = e.target as any;
      const activeTab = target?.activeTab || target;
      const tabTarget = activeTab?.getAttribute('data-tab');
      if (tabTarget) {
        tabButtons.forEach(btn => {
          btn.classList.toggle('active', btn.getAttribute('data-tab') === tabTarget);
        });
        panelRows.forEach(row => row.classList.add('hidden'));

        let panelId = 'panel-geoprocessamento';
        if (tabTarget === 'cartorio') panelId = 'panel-perimetro';
        else if (tabTarget === 'documentos') panelId = 'panel-cartorio';
        else if (tabTarget === 'auditoria') panelId = 'panel-auditoria';

        const targetPanel = document.getElementById(panelId);
        if (targetPanel) {
          targetPanel.classList.remove('hidden');
          const rm = activeRibbonManagers[panelId];
          if (rm) requestAnimationFrame(() => rm.adjustLayout());
        }

        if (ctx && typeof ctx.alternarEtapa === 'function' && ctx.etapaAtiva !== tabTarget) {
          ctx.alternarEtapa(tabTarget);
        }
      }
    });
  }

  tabButtons.forEach(button => {
    button.addEventListener('click', (e: Event) => {
      const targetBtn = e.currentTarget as HTMLButtonElement;
      const tabTarget = targetBtn.getAttribute('data-tab');

      if (!tabTarget) return;

      tabButtons.forEach(btn => {
        btn.classList.remove('active');
      });
      targetBtn.classList.add('active');

      panelRows.forEach(row => row.classList.add('hidden'));

      let panelId = 'panel-geoprocessamento';
      if (tabTarget === 'cartorio') panelId = 'panel-perimetro';
      else if (tabTarget === 'documentos') panelId = 'panel-cartorio';
      else if (tabTarget === 'auditoria') panelId = 'panel-auditoria';

      const targetPanel = document.getElementById(panelId);
      if (targetPanel) {
        targetPanel.classList.remove('hidden');
        const rm = activeRibbonManagers[panelId];
        if (rm) {
          requestAnimationFrame(() => rm.adjustLayout());
        }
      }

      if (ctx && typeof ctx.alternarEtapa === 'function' && ctx.etapaAtiva !== tabTarget) {
        ctx.alternarEtapa(tabTarget);
      }
    });
  });

  const btnVoltar = document.getElementById('btn-voltar-lista');
  if (btnVoltar) {
    btnVoltar.addEventListener('click', () => {
      window.location.hash = '#levantamentos';
    });
  }

  // Recarrega os marcadores e a geometria ao mudar as opções visuais
  const bcConfig = new BroadcastChannel('gerencigeo_map_config');
  bcConfig.onmessage = (event) => {
    if (event.data === 'RELOAD_REQUIRED' && typeof ctx.renderMatriculaDados === 'function') {
      setTimeout(() => {
        ctx.renderMatriculaDados();
      }, 50);
    }
  };


  // Listeners para os botões de navegação global transferidos da barra lateral
  const navButtons = [
    { id: 'nav-btn-dashboard', hash: '#dashboard' },
    { id: 'nav-btn-clientes', hash: '#clientes' },
    { id: 'nav-btn-levantamentos', hash: '#levantamentos' },
    { id: 'nav-btn-propriedades', hash: '#propriedades' },
    { id: 'nav-btn-hgo', hash: '#hgo' },
    { id: 'nav-btn-fronteira', hash: '#fronteira' },
    { id: 'nav-btn-ccir', hash: '#ccir' },
    { id: 'nav-btn-configuracoes', hash: '#configuracoes' }
  ];

  navButtons.forEach(btnInfo => {
    const btn = document.getElementById(btnInfo.id);
    if (btn) {
      btn.addEventListener('click', () => {
        window.location.hash = btnInfo.hash;
      });
    }
  });

  const btnSalvar = document.getElementById('btn-salvar-rascunho');
  if (btnSalvar) {
    btnSalvar.addEventListener('click', () => {
      if (ctx && typeof ctx.salvarRascunhoLocal === 'function') {
        ctx.salvarRascunhoLocal();
      } else {
        showToast("Rascunho salvo com sucesso localmente!", "success");
      }
    });
  }

  const selectUtm = document.getElementById('select-fuso-ribbon') as any;
  if (selectUtm) {
    selectUtm.itens = [
      { id: '21', label: '21S' },
      { id: '22', label: '22S' },
      { id: '23', label: '23S' }
    ];
    const savedZone = localStorage.getItem(`utm_zone_${ctx.currentLevId}`) || '22';
    selectUtm.value = savedZone;

    if (!selectUtm._hasChangeListener) {
      selectUtm._hasChangeListener = true;
      selectUtm.addEventListener('gg-selecionar', (e: CustomEvent) => {
        const novaZona = e.detail?.id || selectUtm.value;
        if (novaZona) {
          localStorage.setItem(`utm_zone_${ctx.currentLevId}`, novaZona);
          showToast(`Zona UTM alterada para ${novaZona}. Recalculando coordenadas...`, "info");
          ctx.loadLevantamentoDetails();
        }
      });
    }
  }

  // AutoCAD Titlebar Window Actions via pywebview js_api
  const winBtnMin = document.getElementById('win-btn-minimize');
  if (winBtnMin) {
    winBtnMin.addEventListener('click', () => {
      (window as any).pywebview?.api?.minimize();
    });
  }

  const winBtnMax = document.getElementById('win-btn-maximize');
  if (winBtnMax) {
    winBtnMax.addEventListener('click', () => {
      (window as any).pywebview?.api?.toggle_maximize();
    });
  }

  const winBtnClose = document.getElementById('win-btn-close');
  if (winBtnClose) {
    winBtnClose.addEventListener('click', () => {
      (window as any).pywebview?.api?.close();
    });
  }

  // AutoCAD Properties Panel Toggle Action
  const panel = document.getElementById('painel-propriedades');
  const btnToggleProps = document.getElementById('btn-toggle-props');
  const workspaceBody = document.querySelector('.workspace-body') as HTMLElement;
  if (panel && btnToggleProps && workspaceBody) {
    btnToggleProps.addEventListener('click', () => {
      panel.classList.add('transition-width');
      const isCollapsed = panel.classList.toggle('collapsed');

      if (isCollapsed) {
        workspaceBody.style.setProperty('--props-panel-w', '36px');
      } else {
        const larguraSalva = localStorage.getItem('gerencigeo_props_panel_width') || '280px';
        workspaceBody.style.setProperty('--props-panel-w', larguraSalva);
      }

      const icon = btnToggleProps.querySelector('i, svg');
      if (icon) {
        if (isCollapsed) {
          icon.innerHTML = `<path d="m9 18 6-6-6-6"/>`; // chevron-right
          btnToggleProps.setAttribute('title', 'Expandir painel');
        } else {
          icon.innerHTML = `<path d="m15 18-6-6 6-6"/>`; // chevron-left
          btnToggleProps.setAttribute('title', 'Recolher painel');
        }
      }

      // Remove a transição e invalida mapa para o redimensionamento fluir
      setTimeout(() => {
        panel.classList.remove('transition-width');
        if (ctx.triagemMap) ctx.triagemMap.invalidateSize?.();
      }, 190);
    });
  }
}
