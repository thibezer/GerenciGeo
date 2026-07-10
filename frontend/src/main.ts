import './style.css';
import './design-engine.css';

import type { RouteDef } from './types';
import { initIcons, clearTimeoutsAndIntervals, showToast } from './utils';
import { dashboardRoute } from './views/dashboard';
import { clientesRoute } from './views/clientes';
import { levantamentosRoute } from './views/levantamentos';
import { mesaTrabalhoRoute } from './views/mesa_trabalho';
import { propriedadesRoute } from './views/propriedades';
import { hgoRoute } from './views/hgo';
import { pendenciasRoute } from './views/pendencias';
import { configuracoesRoute } from './views/configuracoes';
import { fronteiraRoute } from './views/fronteira';
import { ccirRoute } from './views/ccir';

// Detecção se o app está executando no desktop local ou na nuvem Hostinger
const isLocal = window.location.origin.includes('localhost') || 
                window.location.origin.includes('127.0.0.1') || 
                window.location.origin.includes('[::1]');

const localOnlyRoutes = ['levantamentos', 'hgo', 'fronteira', 'ccir', 'mesa_trabalho'];

const routes: Record<string, RouteDef> = {
  dashboard: dashboardRoute,
  clientes: clientesRoute,
  levantamentos: levantamentosRoute,
  mesa_trabalho: mesaTrabalhoRoute,
  propriedades: propriedadesRoute,
  hgo: hgoRoute,
  pendencias: pendenciasRoute,
  configuracoes: configuracoesRoute,
  fronteira: fronteiraRoute,
  ccir: ccirRoute
};


let activeRoute: RouteDef | null = null;

const navigate = (route: string) => {
  // Se for ambiente Web (nuvem) e for uma rota local-only, bloqueia o acesso
  if (!isLocal && localOnlyRoutes.includes(route)) {
    showToast("Operação restrita ao Software Desktop Local.", "error");
    window.location.hash = '#dashboard';
    return;
  }

  // Exibição condicional da barra lateral (Sidebar)
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    if (route === 'mesa_trabalho') {
      sidebar.classList.add('hidden');
    } else {
      sidebar.classList.remove('hidden');
    }
  }

  const container = document.getElementById('view-container');
  const breadcrumbCurrent = document.getElementById('breadcrumb-current');
  if (!container) return;

  // Ajusta padding e overflow do view-container quando entra na mesa_trabalho para evitar scroll na Ribbon
  if (route === 'mesa_trabalho') {
    container.className = 'flex-1 overflow-hidden p-0 min-w-0';
  } else {
    container.className = 'flex-1 overflow-y-auto p-6 min-w-0';
  }
  
  if (activeRoute && activeRoute.cleanup) {
    try {
      activeRoute.cleanup();
    } catch (e) {
      console.warn("Erro ao executar cleanup da rota anterior:", e);
    }
  }
  
  clearTimeoutsAndIntervals();
  if (breadcrumbCurrent) {
     breadcrumbCurrent.textContent = route.charAt(0).toUpperCase() + route.slice(1);
  }
  
  const currentRoute = routes[route];
  activeRoute = currentRoute || null;
  if (currentRoute) {
    container.innerHTML = currentRoute.render();
    initIcons();
    if (currentRoute.setup) currentRoute.setup();
  } else {
    container.innerHTML = `<div class="p-12 text-center text-white/20">Módulo em desenvolvimento...</div>`;
  }
  
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === `#${route}`) {
      link.classList.add('active');
    }
  });
};

window.addEventListener('hashchange', () => {
  const route = window.location.hash.replace('#', '') || 'dashboard';
  navigate(route);
});

const initApp = () => {
  // Se for ambiente Web (Hostinger), oculta itens locais da sidebar e adiciona indicador
  if (!isLocal) {
    document.querySelectorAll('.local-only-route').forEach(el => {
      el.classList.add('hidden');
    });

    const headerTitle = document.getElementById('sidebar-header');
    if (headerTitle) {
      const modeIndicator = document.createElement('div');
      modeIndicator.className = 'text-[9px] text-mint-vibrant/60 font-bold uppercase tracking-wider px-2 mt-1 sidebar-text';
      modeIndicator.id = 'web-cloud-indicator';
      modeIndicator.innerText = 'Hub Web Cloud';
      headerTitle.parentNode?.insertBefore(modeIndicator, headerTitle.nextSibling);
    }
  }

  const initialRoute = window.location.hash.replace('#', '') || 'dashboard';
  navigate(initialRoute);
  initIcons();

  // Redirecionamento do botão de Configurações do menu lateral
  const btnSettings = document.getElementById('btn-sidebar-settings');
  if (btnSettings) {
    btnSettings.addEventListener('click', () => {
      window.location.hash = '#configuracoes';
    });
  }

  // Configuração do botão de recolhimento da barra lateral
  const sidebar = document.getElementById('sidebar');
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
  if (sidebar && btnToggleSidebar) {
    // Restaura preferência salva no localStorage
    const isCollapsedSaved = localStorage.getItem('gerencigeo_sidebar_collapsed') === 'true';
    if (isCollapsedSaved) {
      sidebar.classList.add('sidebar-collapsed');
    } else {
      sidebar.classList.remove('sidebar-collapsed');
    }

    const icon = btnToggleSidebar.querySelector('i');
    if (icon) {
      if (sidebar.classList.contains('sidebar-collapsed')) {
        icon.setAttribute('data-lucide', 'chevron-right');
        btnToggleSidebar.setAttribute('title', 'Expandir menu');
      } else {
        icon.setAttribute('data-lucide', 'chevron-left');
        btnToggleSidebar.setAttribute('title', 'Recolher menu');
      }
      initIcons();
    }

    btnToggleSidebar.addEventListener('click', () => {
      sidebar.classList.toggle('sidebar-collapsed');
      const isCollapsed = sidebar.classList.contains('sidebar-collapsed');
      localStorage.setItem('gerencigeo_sidebar_collapsed', isCollapsed ? 'true' : 'false');
      
      const icon = btnToggleSidebar.querySelector('i');
      if (icon) {
        if (isCollapsed) {
          icon.setAttribute('data-lucide', 'chevron-right');
          btnToggleSidebar.setAttribute('title', 'Expandir menu');
        } else {
          icon.setAttribute('data-lucide', 'chevron-left');
          btnToggleSidebar.setAttribute('title', 'Recolher menu');
        }
        initIcons();
      }
      
      // Dispara resize global para redimensionar Leaflet automaticamente
      window.dispatchEvent(new Event('resize'));
    });
  }

  // Controle da sidebar mobile (hamburger e overlay)
  const btnHamburger = document.getElementById('btn-hamburger-mobile');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  
  if (btnHamburger && sidebar && sidebarOverlay) {
    const toggleMobileSidebar = (open: boolean) => {
      if (open) {
        sidebar.classList.add('sidebar-mobile-active');
        sidebarOverlay.classList.add('active');
      } else {
        sidebar.classList.remove('sidebar-mobile-active');
        sidebarOverlay.classList.add('opacity-0');
        setTimeout(() => {
          sidebarOverlay.classList.remove('active', 'opacity-0');
        }, 300);
      }
    };

    btnHamburger.addEventListener('click', () => toggleMobileSidebar(true));
    sidebarOverlay.addEventListener('click', () => toggleMobileSidebar(false));

    // Fechar ao navegar por qualquer link da sidebar
    document.querySelectorAll('#sidebar nav a').forEach(link => {
      link.addEventListener('click', () => toggleMobileSidebar(false));
    });
    
    // Fechar ao clicar no botão Configurações da sidebar
    document.getElementById('btn-sidebar-settings')?.addEventListener('click', () => toggleMobileSidebar(false));
  }
  
  // Se for ambiente Web (Hostinger), mostra o badge também no header mobile
  if (!isLocal) {
    const badgeMobile = document.getElementById('web-cloud-indicator-mobile');
    if (badgeMobile) {
      badgeMobile.classList.remove('hidden');
    }
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
