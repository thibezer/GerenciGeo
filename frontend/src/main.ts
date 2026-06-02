import './style.css';
import type { RouteDef } from './types';
import { initIcons, clearTimeoutsAndIntervals } from './utils';
import { dashboardRoute } from './views/dashboard';
import { clientesRoute } from './views/clientes';
import { levantamentosRoute } from './views/levantamentos';
import { mesaTrabalhoRoute } from './views/mesa_trabalho';
import { propriedadesRoute } from './views/propriedades';
import { pppRoute } from './views/ppp';
import { hgoRoute } from './views/hgo';
import { historicoRoute } from './views/historico';
import { pendenciasRoute } from './views/pendencias';
import { pendenciasAntigaRoute } from './views/pendenciasAntiga';
import { configuracoesRoute } from './views/configuracoes';
import { fronteiraRoute } from './views/fronteira';

const routes: Record<string, RouteDef> = {
  dashboard: dashboardRoute,
  clientes: clientesRoute,
  levantamentos: levantamentosRoute,
  mesa_trabalho: mesaTrabalhoRoute,
  propriedades: propriedadesRoute,
  ppp: pppRoute,
  hgo: hgoRoute,
  historico: historicoRoute,
  pendencias: pendenciasRoute,
  pendenciasAntiga: pendenciasAntigaRoute,
  configuracoes: configuracoesRoute,
  fronteira: fronteiraRoute
};


const navigate = (route: string) => {
  const container = document.getElementById('view-container');
  const breadcrumbCurrent = document.getElementById('breadcrumb-current');
  if (!container) return;
  
  clearTimeoutsAndIntervals();
  if (breadcrumbCurrent) {
     breadcrumbCurrent.textContent = route.charAt(0).toUpperCase() + route.slice(1);
  }
  
  const currentRoute = routes[route];
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
    btnToggleSidebar.addEventListener('click', () => {
      sidebar.classList.toggle('sidebar-collapsed');
      
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
      
      // Dispara resize global para redimensionar Leaflet automaticamente
      window.dispatchEvent(new Event('resize'));
    });
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
