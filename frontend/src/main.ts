import './style.css';
import './design-engine.css';
import './lista-padrao.css';
import * as uiKit from 'ui-components-kit';
import { aplicarPatchesUI } from './utils/ui_adapters';
import { instalarFetchAutenticado } from './utils/fetch_autenticado';

// Garante o padrão dos componentes e da aplicação em modo noturno (dark mode) na web
if (typeof document !== 'undefined') {
  document.documentElement.classList.add('dark');
  document.documentElement.setAttribute('data-tema', 'escuro');
  document.documentElement.setAttribute('data-theme', 'dark');
  document.documentElement.style.colorScheme = 'dark';
}
try {
  const uiBus = (uiKit as any).UIBus;
  if (uiBus && typeof uiBus.definirTema === 'function') {
    uiBus.definirTema('escuro');
  }
} catch (e) {
  console.warn('[GerenciGeo] Não foi possível definir tema noturno no UIBus:', e);
}

// A API exige o token de sessão nos cadastros: anexa o Authorization às chamadas da API
instalarFetchAutenticado();

// Aplica patches nos Web Components para dimensões de modais e respiro interno dos campos
aplicarPatchesUI();

// Adapters de compatibilidade para métodos legados chamados pelas views da Mesa de Trabalho
export const aplicarAdaptersCAD = (cadProto: any) => {
  if (!cadProto) return;
  if (!cadProto.plotPontos) {
    cadProto.plotPontos = function(pontos: any[]) {
      this.pontos = pontos;
    };
  }
  if (!cadProto.plotSegmentos) {
    cadProto.plotSegmentos = function(segmentos: any[], pontos?: any[]) {
      if (pontos) this.pontos = pontos;
      this.segmentos = segmentos;
    };
  }
  if (!cadProto.plotPolilinhaTemporaria) {
    cadProto.plotPolilinhaTemporaria = function(pontos: any[]) {
      if (!this.segmentos || this.segmentos.length === 0) {
        this.pontos = pontos;
      }
    };
  }
  if (!cadProto.plotPoligonalHomologada) {
    cadProto.plotPoligonalHomologada = function(bancoPontos: any[]) {
      this.bancoPontos = bancoPontos;
    };
  }
  if (!cadProto.plotPontosVizinhos) {
    cadProto.plotPontosVizinhos = function(pontosVizinhos: any[]) {
      const ctrl = typeof this.getController === 'function' ? this.getController() : this.controller;
      if (ctrl?.layerManager) {
        ctrl.layerManager.updateContext({ pontosVizinhos });
      }
    };
  }
  if (!cadProto.plotPoligonosVizinhos) {
    cadProto.plotPoligonosVizinhos = function(confrontantes: any[]) {
      this.confrontantes = confrontantes;
    };
  }
  if (!cadProto.clearOverlays) {
    cadProto.clearOverlays = function(_bpAtivo?: boolean) {
      // Camadas no ui-canvas-cad são reativas
    };
  }
  if (!cadProto.destacarElemento) {
    cadProto.destacarElemento = function(id: any, opts?: any) {
      this.selectPonto(id, opts?.zoom);
    };
  }
};

// Registra e ativa o módulo de Canvas CAD no CustomElementRegistry
// O kit só carrega o módulo do canvas sozinho se <ui-canvas-cad> já estiver no DOM durante o import; como a view
// da mesa é renderizada depois (SPA), o carregamento precisa ser disparado aqui, senão o mapa fica preto.
const carregarCanvasKit = (uiKit as any).carregarModuloCanvas;
if (typeof carregarCanvasKit === 'function') {
  carregarCanvasKit().catch((err: any) => {
    console.error('[GerenciGeo] Erro ao carregar módulo CAD do UI Kit:', err);
  });
}

if (typeof customElements !== 'undefined') {
  customElements.whenDefined('ui-canvas-cad').then((CadClass: any) => {
    if (CadClass?.prototype) {
      aplicarAdaptersCAD(CadClass.prototype);
    }
  });
}


import type { RouteDef } from './types';
import { initIcons, clearTimeoutsAndIntervals, showToast } from './utils';
import { AuthService } from './utils/auth_service';
import { realtimeSyncClient } from './utils/realtime_sync_client';
import { initNuvemSyncModal } from './views/mesa_trabalho/nuvem_sync_modal';

// Detecção se o app está executando no desktop local ou na nuvem Hostinger
const isLocal = window.location.origin.includes('localhost') || 
                window.location.origin.includes('127.0.0.1') || 
                window.location.origin.includes('[::1]');

const localOnlyRoutes = ['levantamentos', 'hgo', 'fronteira', 'ccir', 'mesa_trabalho'];

// Code-splitting: rotas carregadas sob demanda via Dynamic Import
const routeLoaders: Record<string, () => Promise<RouteDef>> = {
  login: () => import('./views/login').then(m => m.loginRoute),
  dashboard: () => import('./views/dashboard').then(m => m.dashboardRoute),
  clientes: () => import('./views/clientes').then(m => m.clientesRoute),
  levantamentos: () => import('./views/levantamentos').then(m => m.levantamentosRoute),
  mesa_trabalho: () => import('./views/mesa_trabalho').then(m => m.mesaTrabalhoRoute),
  propriedades: () => import('./views/propriedades').then(m => m.propriedadesRoute),
  hgo: () => import('./views/hgo').then(m => m.hgoRoute),
  pendencias: () => import('./views/pendencias').then(m => m.pendenciasRoute),
  contagem_pontos: () => import('./views/contagem_pontos').then(m => m.contagemPontosRoute),
  configuracoes: () => import('./views/configuracoes').then(m => m.configuracoesRoute),
  fronteira: () => import('./views/fronteira').then(m => m.fronteiraRoute),
  ccir: () => import('./views/ccir').then(m => m.ccirRoute),
  compartilhado: () => import('./views/compartilhado').then(m => m.compartilhadoRoute)
};

const routeCache: Record<string, RouteDef> = {};

// Nome amigável de cada tela para o cabeçalho e o título da aba (mesmos rótulos do menu lateral)
const routeLabels: Record<string, string> = {
  login: 'Login',
  dashboard: 'Dashboard',
  clientes: 'Clientes',
  levantamentos: 'Levantamentos',
  mesa_trabalho: 'Mesa de Trabalho',
  propriedades: 'Propriedades',
  hgo: 'Organizador HGO',
  pendencias: 'Pendências',
  contagem_pontos: 'Contagem de Pontos',
  configuracoes: 'Configurações',
  fronteira: 'Área de Fronteira',
  ccir: 'Banco CCIR',
  compartilhado: 'Levantamento Compartilhado'
};

const renderEstadoTela = (icone: string, titulo: string, detalhe: string, comBotaoRecarregar: boolean) => `
  <div class="flex flex-col items-center justify-center text-center gap-3 p-12 h-full min-h-[50vh]">
    <i data-lucide="${icone}" class="w-10 h-10 text-white/25"></i>
    <h3 class="text-sm font-semibold text-white/80">${titulo}</h3>
    <p class="text-xs text-white/40 max-w-md leading-relaxed">${detalhe}</p>
    <div class="flex gap-2 mt-2">
      ${comBotaoRecarregar ? `<button type="button" data-acao-tela="recarregar" class="px-3 py-1.5 text-xs font-semibold rounded-technical bg-mint-vibrant/15 text-mint-vibrant hover:bg-mint-vibrant/25 transition-colors">Recarregar</button>` : ''}
      <a href="#dashboard" class="px-3 py-1.5 text-xs font-semibold rounded-technical bg-white/5 text-white/70 hover:bg-white/10 transition-colors">Ir para o Dashboard</a>
    </div>
  </div>`;

let activeRoute: RouteDef | null = null;
// Cada navegação recebe um número; se outra começar enquanto o módulo carrega, a mais antiga desiste de desenhar
let navegacaoAtual = 0;

const navigate = async (route: string, param: string | null = null) => {
  const minhaNavegacao = ++navegacaoAtual;
  // Autenticação: se deslogado e tentando acessar rota interna, redireciona para login
  if (!AuthService.isAuthenticated() && route !== 'login') {
    window.location.hash = '#login';
    return;
  }

  // Se já logado e tentar abrir tela de login, redireciona para dashboard
  if (AuthService.isAuthenticated() && route === 'login') {
    window.location.hash = '#dashboard';
    return;
  }

  // Se for ambiente Web (nuvem) e for uma rota local-only, bloqueia o acesso
  if (!isLocal && localOnlyRoutes.includes(route)) {
    showToast("Operação restrita ao Software Desktop Local.", "error");
    window.location.hash = '#dashboard';
    return;
  }

  // Exibição condicional da barra lateral (Sidebar)
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    if (route === 'mesa_trabalho' || route === 'compartilhado' || route === 'login') {
      sidebar.classList.add('hidden');
    } else {
      sidebar.classList.remove('hidden');
    }
  }

  const container = document.getElementById('view-container');
  const breadcrumbCurrent = document.getElementById('breadcrumb-current');
  if (!container) return;

  // Ajusta padding e overflow do view-container quando entra na mesa_trabalho ou login
  if (route === 'mesa_trabalho' || route === 'compartilhado' || route === 'login') {
    container.className = 'flex-1 overflow-hidden p-0 min-w-0';
  } else if (route === 'dashboard' || route === 'clientes' || route === 'propriedades' || route === 'levantamentos' || route === 'contagem_pontos' || route === 'hgo' || route === 'fronteira' || route === 'ccir' || route === 'pendencias' || route === 'configuracoes') {
    container.className = 'flex-1 overflow-y-auto p-2.5 sm:p-3.5 min-w-0 flex flex-col h-full';
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
  
  activeRoute = null;
  clearTimeoutsAndIntervals();
  const rotulo = routeLabels[route] || 'Página não encontrada';
  if (breadcrumbCurrent) {
     breadcrumbCurrent.textContent = rotulo;
  }
  document.title = `${rotulo} | GerenciGeo`;

  let currentRoute = routeCache[route];
  let falhaCarregamento = false;
  if (!currentRoute && routeLoaders[route]) {
    // Indicador discreto enquanto o módulo da tela é baixado (primeiro acesso ou conexão lenta na nuvem)
    container.innerHTML = `
      <div class="flex items-center justify-center gap-2 p-12 h-full min-h-[50vh] text-xs text-white/40">
        <i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Carregando ${rotulo}...
      </div>`;
    initIcons();
    try {
      currentRoute = await routeLoaders[route]();
      routeCache[route] = currentRoute;
    } catch (e) {
      falhaCarregamento = true;
      console.error(`Erro ao carregar módulo da rota '${route}':`, e);
    }
  }

  // O usuário já pediu outra tela enquanto esta carregava
  if (minhaNavegacao !== navegacaoAtual) return;

  activeRoute = currentRoute || null;
  if (currentRoute) {
    container.innerHTML = currentRoute.render();
    initIcons();
    if (currentRoute.setup) {
      // Uma falha no setup não pode deixar a tela "morta" sem nenhum aviso ao operador
      const avisarFalhaSetup = (e: unknown) => {
        console.error(`Erro ao inicializar a tela '${route}':`, e);
        showToast(`Não foi possível carregar completamente a tela ${rotulo}. Tente recarregar.`, 'error', 5000);
      };
      try {
        const retorno = currentRoute.setup(param);
        if (retorno instanceof Promise) retorno.catch(avisarFalhaSetup);
      } catch (e) {
        avisarFalhaSetup(e);
      }
    }
  } else if (falhaCarregamento) {
    // Normalmente acontece na nuvem logo após uma atualização (arquivos antigos em cache) ou sem conexão
    container.innerHTML = renderEstadoTela('alert-triangle', `Não foi possível abrir ${rotulo}`,
      'Verifique a conexão. Se o sistema acabou de ser atualizado, recarregue a página para baixar a versão nova.', true);
    initIcons();
  } else {
    container.innerHTML = renderEstadoTela('compass', 'Página não encontrada',
      'O endereço acessado não corresponde a nenhuma tela do GerenciGeo.', false);
    initIcons();
  }
  
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === `#${route}`) {
      link.classList.add('active');
    }
  });
};

window.addEventListener('hashchange', () => {
  const hashPath = window.location.hash.replace('#', '') || 'dashboard';
  const parts = hashPath.split('/');
  const baseRoute = parts[0];
  const param = parts.length > 1 ? parts[1] : null;
  navigate(baseRoute, param);
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

  const hashPath = window.location.hash.replace('#', '') || 'dashboard';
  const parts = hashPath.split('/');
  const baseRoute = parts[0];
  const param = parts.length > 1 ? parts[1] : null;
  navigate(baseRoute, param);
  initIcons();

  // Botão "Recarregar" das telas de erro de carregamento
  document.getElementById('view-container')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-acao-tela="recarregar"]')) window.location.reload();
  });

  // Inicializa o motor de sincronização em tempo real e o modal global da nuvem
  realtimeSyncClient.init();
  initNuvemSyncModal();

  // Escuta dados recebidos da Nuvem em tempo real para recarregar a visualização ativa suavemente
  // Telas de listagem que são redesenhadas sozinhas quando chegam dados novos da nuvem.
  // Mesa de trabalho/compartilhado/configurações ficam de fora para não atrapalhar edição em andamento.
  const telasAutoAtualizaveis = ['dashboard', 'clientes', 'propriedades', 'levantamentos', 'pendencias', 'ccir', 'hgo'];
  let atualizacaoPendente = false;

  const usuarioOcupado = (): boolean => {
    const ativo = document.activeElement as HTMLElement | null;
    const digitando = !!ativo && (ativo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(ativo.tagName));
    const modalAberto = !!document.querySelector('.fixed.inset-0:not(.hidden)');
    return digitando || modalAberto;
  };

  const atualizarTelaAtiva = () => {
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    const [base, param] = hash.split('/');
    const current = routeCache[base];
    const container = document.getElementById('view-container');
    if (!telasAutoAtualizaveis.includes(base) || !current || !container) {
      atualizacaoPendente = false;
      return;
    }
    if (usuarioOcupado()) {
      atualizacaoPendente = true; // tenta de novo quando o operador terminar o que está fazendo
      return;
    }
    atualizacaoPendente = false;
    const scroll = container.scrollTop;
    if (current.cleanup) {
      try { current.cleanup(); } catch (e) { console.warn('Erro no cleanup ao atualizar tela:', e); }
    }
    container.innerHTML = current.render();
    initIcons();
    if (current.setup) current.setup(param || null);
    container.scrollTop = scroll;
  };

  window.addEventListener('gerencigeo:data_updated', (e: any) => {
    // Só redesenha quando algo realmente chegou de outro computador
    if ((e?.detail?.total_recebidos ?? 0) > 0) atualizarTelaAtiva();
  });
  window.addEventListener('focusout', () => {
    if (atualizacaoPendente) setTimeout(atualizarTelaAtiva, 400);
  });
  window.addEventListener('hashchange', () => { atualizacaoPendente = false; });

  // Ao voltar para a janela, confere a nuvem na hora em vez de esperar o próximo batimento
  const conferirNuvem = () => { if (document.visibilityState === 'visible') realtimeSyncClient.verificarAgora(); };
  document.addEventListener('visibilitychange', conferirNuvem);
  window.addEventListener('focus', conferirNuvem);

  // Atualiza informações do usuário na barra lateral caso autenticado
  const currentUser = AuthService.getUser();
  if (currentUser) {
    const userNameEl = document.querySelector('#sidebar-footer .text-sm.font-semibold');
    const userAvatarEl = document.querySelector('#sidebar-footer .w-8.h-8');
    if (userNameEl) userNameEl.textContent = currentUser.name;
    if (userAvatarEl) userAvatarEl.textContent = AuthService.getInitials(currentUser.name);
  }

  // Configuração do botão de logout da barra lateral
  const btnLogout = document.getElementById('btn-sidebar-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      AuthService.logout();
    });
  }

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
        sidebarOverlay.classList.remove('active');
        // Aguarda a transição CSS (opacity 0.3s) antes de remover pointer-events
        setTimeout(() => {
          // Garante que não haja estado intermediário residual
          sidebarOverlay.classList.remove('active');
        }, 300);
      }
    };

    btnHamburger.addEventListener('click', () => toggleMobileSidebar(true));
    sidebarOverlay.addEventListener('click', () => toggleMobileSidebar(false));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && sidebar.classList.contains('sidebar-mobile-active')) toggleMobileSidebar(false);
    });

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
