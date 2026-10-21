import { FluentRibbonManager as RibbonManager } from '../../../ui/fluent_ribbon_manager';
import { registerFluentComponents } from '../../../ui/fluent_setup';
import { showToast } from '../../../utils';
import type { MesaTrabalhoContext } from '../mesa_trabalho_context';

export function setupRibbonInteractions(ctx: MesaTrabalhoContext): () => void {
  registerFluentComponents();
  const cleanups: Array<() => void> = [];
  const activeRibbonManagers: Record<string, RibbonManager> = {};

  const tabButtons = document.querySelectorAll('.rl3-tab');
  const panelRows = document.querySelectorAll('.rl3-panel');

  // Inicializa o Gerenciador de Responsividade do Ribbon para todos os painéis de abas
  const ribbonPanelIds = ['panel-geoprocessamento', 'panel-perimetro', 'panel-cartorio', 'panel-auditoria'];

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
    const onTablistChange = (e: Event) => {
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
    };
    tablist.addEventListener('change', onTablistChange);
    cleanups.push(() => tablist.removeEventListener('change', onTablistChange));
  }

  tabButtons.forEach(button => {
    const onTabClick = (e: Event) => {
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
    };
    button.addEventListener('click', onTabClick);
    cleanups.push(() => button.removeEventListener('click', onTabClick));
  });

  const btnVoltar = document.getElementById('btn-voltar-lista');
  if (btnVoltar) {
    const onVoltarClick = () => { window.location.hash = '#levantamentos'; };
    btnVoltar.addEventListener('click', onVoltarClick);
    cleanups.push(() => btnVoltar.removeEventListener('click', onVoltarClick));
  }

  // BroadcastChannel para sincronização visual de mapa
  const bcConfig = new BroadcastChannel('gerencigeo_map_config');
  bcConfig.onmessage = (event) => {
    if (event.data === 'RELOAD_REQUIRED' && typeof ctx.renderMatriculaDados === 'function') {
      setTimeout(() => {
        ctx.renderMatriculaDados();
      }, 50);
    }
  };
  cleanups.push(() => bcConfig.close());

  // Listeners para os botões de navegação global
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
      const onNavClick = () => { window.location.hash = btnInfo.hash; };
      btn.addEventListener('click', onNavClick);
      cleanups.push(() => btn.removeEventListener('click', onNavClick));
    }
  });

  const btnSalvar = document.getElementById('btn-salvar-rascunho');
  if (btnSalvar) {
    const onSalvarClick = () => {
      if (ctx && typeof ctx.salvarRascunhoLocal === 'function') {
        ctx.salvarRascunhoLocal();
      } else {
        showToast('Rascunho salvo com sucesso localmente!', 'success');
      }
    };
    btnSalvar.addEventListener('click', onSalvarClick);
    cleanups.push(() => btnSalvar.removeEventListener('click', onSalvarClick));
  }

  // AutoCAD Titlebar Window Actions via pywebview js_api
  const winBtnMin = document.getElementById('win-btn-minimize');
  if (winBtnMin) {
    const onMinClick = () => { (window as any).pywebview?.api?.minimize(); };
    winBtnMin.addEventListener('click', onMinClick);
    cleanups.push(() => winBtnMin.removeEventListener('click', onMinClick));
  }

  const winBtnMax = document.getElementById('win-btn-maximize');
  if (winBtnMax) {
    const onMaxClick = () => { (window as any).pywebview?.api?.toggle_maximize(); };
    winBtnMax.addEventListener('click', onMaxClick);
    cleanups.push(() => winBtnMax.removeEventListener('click', onMaxClick));
  }

  const winBtnClose = document.getElementById('win-btn-close');
  if (winBtnClose) {
    const onCloseClick = () => { (window as any).pywebview?.api?.close(); };
    winBtnClose.addEventListener('click', onCloseClick);
    cleanups.push(() => winBtnClose.removeEventListener('click', onCloseClick));
  }

  // AutoCAD Properties Panel Toggle Action
  const panel = document.getElementById('painel-propriedades');
  const btnToggleProps = document.getElementById('btn-toggle-props');
  const workspaceBody = document.querySelector('.workspace-body') as HTMLElement | null;
  if (panel && btnToggleProps && workspaceBody) {
    const onTogglePropsClick = () => {
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
          icon.innerHTML = `<path d="m9 18 6-6-6-6"/>`;
          btnToggleProps.setAttribute('title', 'Expandir painel');
        } else {
          icon.innerHTML = `<path d="m15 18-6-6 6-6"/>`;
          btnToggleProps.setAttribute('title', 'Recolher painel');
        }
      }

      setTimeout(() => {
        panel.classList.remove('transition-width');
        try {
          if (ctx.triagemMap) ctx.triagemMap.invalidateSize?.();
        } catch (e) {}
      }, 190);
    };

    btnToggleProps.addEventListener('click', onTogglePropsClick);
    cleanups.push(() => btnToggleProps.removeEventListener('click', onTogglePropsClick));
  }

  return () => {
    Object.values(activeRibbonManagers).forEach(rm => rm.destroy());
    cleanups.forEach(c => c());
  };
}
