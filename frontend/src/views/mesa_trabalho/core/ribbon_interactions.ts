import '@thibezer/ui-components-kit/tools';
import type { UIRibbon, RibbonAba } from '@thibezer/ui-components-kit/tools';
import { registerFluentComponents } from '../../../ui/fluent_setup';
import { showToast } from '../../../utils';
import type { MesaTrabalhoContext } from '../mesa_trabalho_context';

const SVGS = {
  uploadCloud: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  archive: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`,
  layers: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
  upload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  mapPin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
  fileSpreadsheet: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h8"/><path d="M8 17h8"/><path d="M10 9h.01"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  clipboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>`,
  arrowUpDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/></svg>`,
  shieldAlert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>`,
  cloudLightning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973"/><path d="m13 12-3 5h4l-3 5"/></svg>`,
  archiveX: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="m9.5 12 5 5"/><path d="m14.5 12-5 5"/></svg>`,
  cpu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>`,
  fileText: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>`,
  fileCheck: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="m9 15 2 2 4-4"/></svg>`,
  shieldCheck: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>`
};

export function obterAbasMesaRibbon(ctx: MesaTrabalhoContext): RibbonAba[] {
  const modoUtm = ctx.modoCoordenadas !== 'geodesico';
  const txtFonte = ctx.bancoPontosExibido
    ? `Planilha SIGEF (${ctx.bancoPontosList?.length || 0} pts)`
    : 'Fonte: Campo';

  return [
    {
      id: 'geoprocessamento',
      rotulo: 'Mesa Geodésica',
      grupos: [
        {
          id: 'grp-ingestao',
          rotulo: 'Ingestão',
          prioridade: 6,
          itens: [
            {
              id: 'btn-drop-arquivos',
              rotulo: 'Ingestão',
              tamanho: 'grande',
              tipo: 'botao',
              icone: SVGS.uploadCloud
            },
            {
              id: 'btn-processar-lote',
              rotulo: 'Processar Lote',
              tamanho: 'grande',
              tipo: 'botao',
              atalho: 'F5',
              icone: SVGS.play
            }
          ]
        },
        {
          id: 'grp-vizinhos',
          rotulo: 'Vizinhos (SIGEF)',
          prioridade: 1,
          itens: [
            {
              id: 'btn-importar-csv-vizinho',
              rotulo: 'Importar Vizinhos',
              tamanho: 'grande',
              tipo: 'botao',
              icone: SVGS.download
            },
            {
              id: 'btn-limpar-vizinhos',
              rotulo: 'Limpar Camada',
              tamanho: 'grande',
              tipo: 'botao',
              icone: SVGS.trash
            }
          ]
        },
        {
          id: 'grp-coordenadas',
          rotulo: 'Coordenadas',
          prioridade: 3,
          itens: [
            {
              id: 'btn-modo-utm',
              rotulo: 'UTM',
              tamanho: 'pequeno',
              tipo: 'ferramenta',
              ativo: modoUtm
            },
            {
              id: 'btn-modo-geo',
              rotulo: 'Geo',
              tamanho: 'pequeno',
              tipo: 'ferramenta',
              ativo: !modoUtm
            },
            {
              id: 'btn-download-rinex-zip',
              rotulo: 'RINEX .ZIP',
              tamanho: 'grande',
              tipo: 'botao',
              icone: SVGS.archive
            },
            {
              id: 'btn-toggle-fonte-pontos',
              rotulo: txtFonte,
              tamanho: 'grande',
              tipo: 'botao',
              icone: SVGS.layers
            }
          ]
        },
        {
          id: 'grp-exportar',
          rotulo: 'Exportar',
          prioridade: 4,
          itens: [
            {
              id: 'btn-consolidar-pontos-utm',
              rotulo: 'Exportar Dados',
              tamanho: 'grande',
              tipo: 'botao',
              icone: SVGS.upload
            },
            {
              id: 'btn-exportar-kml',
              rotulo: 'KML',
              tamanho: 'pequeno',
              tipo: 'botao',
              icone: SVGS.mapPin
            },
            {
              id: 'btn-unificar-sigef',
              rotulo: 'Unificar SIGEF',
              tamanho: 'pequeno',
              tipo: 'botao',
              icone: SVGS.fileSpreadsheet
            },
            {
              id: 'btn-exportar-tabela-csv',
              rotulo: 'Exportar CSV',
              tamanho: 'pequeno',
              tipo: 'botao',
              icone: SVGS.download
            },
            {
              id: 'btn-exportar-cad',
              rotulo: 'Copiar CAD',
              tamanho: 'pequeno',
              tipo: 'botao',
              icone: SVGS.copy
            },
            {
              id: 'btn-importar-cad',
              rotulo: 'Importar CAD',
              tamanho: 'pequeno',
              tipo: 'botao',
              icone: SVGS.clipboard
            }
          ]
        },
        {
          id: 'grp-edicao',
          rotulo: 'Edição',
          prioridade: 5,
          itens: [
            {
              id: 'btn-reordenar-caminhamento',
              rotulo: 'Reordenar',
              tamanho: 'grande',
              tipo: 'botao',
              icone: SVGS.arrowUpDown
            },
            {
              id: 'btn-override-base-manual',
              rotulo: 'Base Manual',
              tamanho: 'grande',
              tipo: 'botao',
              icone: SVGS.shieldAlert
            }
          ]
        },
        {
          id: 'grp-projeto',
          rotulo: 'Projeto',
          prioridade: 2,
          itens: [
            {
              id: 'btn-sincronizar-nuvem',
              rotulo: 'Nuvem',
              tamanho: 'grande',
              tipo: 'botao',
              icone: SVGS.cloudLightning
            },
            {
              id: 'btn-arquivar-projeto-seguro',
              rotulo: 'Arquivar',
              tamanho: 'grande',
              tipo: 'botao',
              icone: SVGS.archiveX
            }
          ]
        }
      ]
    },
    {
      id: 'cartorio',
      rotulo: 'Org. de Perímetro',
      grupos: [
        {
          id: 'grp-topografia',
          rotulo: 'Topografia',
          prioridade: 7,
          itens: [
            {
              id: 'btn-calcular-confrontantes',
              rotulo: 'Calcular Lados',
              tamanho: 'grande',
              tipo: 'botao',
              icone: SVGS.cpu
            },
            {
              id: 'btn-ativar-reordenacao',
              rotulo: 'Reordenar Manual',
              tamanho: 'grande',
              tipo: 'botao',
              icone: SVGS.arrowUpDown
            }
          ]
        }
      ]
    },
    {
      id: 'documentos',
      rotulo: 'Peças de Cartório',
      grupos: [
        {
          id: 'grp-documentos',
          rotulo: 'Peças de Cartório',
          prioridade: 8,
          itens: [
            {
              id: 'btn-ir-memorial',
              rotulo: 'Memorial Descritivo',
              tamanho: 'grande',
              tipo: 'botao',
              icone: SVGS.fileText
            },
            {
              id: 'btn-ir-requerimento',
              rotulo: 'Requerimento',
              tamanho: 'grande',
              tipo: 'botao',
              icone: SVGS.fileCheck
            }
          ]
        }
      ]
    },
    {
      id: 'auditoria',
      rotulo: 'Histórico de Auditoria',
      grupos: [
        {
          id: 'grp-auditoria',
          rotulo: 'Auditoria',
          prioridade: 9,
          itens: [
            {
              id: 'btn-verificar-sigmas',
              rotulo: 'Validar INCRA',
              tamanho: 'grande',
              tipo: 'botao',
              icone: SVGS.shieldCheck
            }
          ]
        }
      ]
    }
  ];
}

export function setupRibbonInteractions(ctx: MesaTrabalhoContext): () => void {
  registerFluentComponents();
  const cleanups: Array<() => void> = [];

  // 1. Configura e inicializa o componente <ui-ribbon> oficial
  const mesaRibbon = document.getElementById('mesa-ribbon') as (HTMLElement & UIRibbon) | null;
  if (mesaRibbon) {
    mesaRibbon.abas = obterAbasMesaRibbon(ctx);
    if (ctx.etapaAtiva) {
      mesaRibbon.abaAtiva = ctx.etapaAtiva;
    }

    // Ouvinte para troca de abas via clique no <ui-ribbon>
    const onAbaChange = (e: any) => {
      const tabTarget = e.detail?.id;
      if (tabTarget && ctx && typeof ctx.alternarEtapa === 'function' && ctx.etapaAtiva !== tabTarget) {
        ctx.alternarEtapa(tabTarget);
      }
    };
    mesaRibbon.addEventListener('ui-aba-change', onAbaChange);
    cleanups.push(() => mesaRibbon.removeEventListener('ui-aba-change', onAbaChange));

    // Ouvinte para cliques em ferramentas do <ui-ribbon>
    const onFerramenta = (e: any) => {
      const toolId = e.detail?.id;
      if (!toolId) return;

      // Sincroniza visual dos botões UTM / Geo
      if (toolId === 'btn-modo-utm') {
        if (ctx.modoCoordenadas !== 'utm') {
          ctx.modoCoordenadas = 'utm';
          mesaRibbon.atualizarItem?.('btn-modo-utm', { ativo: true });
          mesaRibbon.atualizarItem?.('btn-modo-geo', { ativo: false });
          ctx.renderMatriculaDados?.();
          ctx.atualizarPainelPropriedades?.();
        }
        return;
      }
      if (toolId === 'btn-modo-geo') {
        if (ctx.modoCoordenadas !== 'geodesico') {
          ctx.modoCoordenadas = 'geodesico';
          mesaRibbon.atualizarItem?.('btn-modo-utm', { ativo: false });
          mesaRibbon.atualizarItem?.('btn-modo-geo', { ativo: true });
          ctx.renderMatriculaDados?.();
          ctx.atualizarPainelPropriedades?.();
        }
        return;
      }

      // Atalhos diretos de etapas e peças
      if (toolId === 'btn-ir-memorial') {
        showToast('Acesse as etapas de Peças de Cartório na view principal.', 'info');
        return;
      }
      if (toolId === 'btn-ir-requerimento') {
        showToast('Acesse o requerimento de ratificação no painel de cartório.', 'info');
        return;
      }

      // Dispara o clique no botão bridge ou elemento correspondente no DOM
      const targetEl = document.getElementById(toolId);
      if (targetEl) {
        targetEl.click();
      }
    };
    mesaRibbon.addEventListener('ui-ferramenta', onFerramenta);
    cleanups.push(() => mesaRibbon.removeEventListener('ui-ferramenta', onFerramenta));

    // Ouvinte para redimensionamento do viewport do mapa quando o Ribbon for recolhido ou expandido
    const onRecolhidoChange = () => {
      requestAnimationFrame(() => {
        try {
          if (ctx.triagemMap) ctx.triagemMap.invalidateSize?.();
        } catch (e) {}
      });
      setTimeout(() => {
        try {
          if (ctx.triagemMap) ctx.triagemMap.invalidateSize?.();
        } catch (e) {}
      }, 150);
    };
    mesaRibbon.addEventListener('ui-recolhido-change', onRecolhidoChange);
    cleanups.push(() => mesaRibbon.removeEventListener('ui-recolhido-change', onRecolhidoChange));
  }

  // 2. Botão Voltar para Levantamentos
  const btnVoltar = document.getElementById('btn-voltar-lista');
  if (btnVoltar) {
    const onVoltarClick = () => { window.location.hash = '#levantamentos'; };
    btnVoltar.addEventListener('click', onVoltarClick);
    cleanups.push(() => btnVoltar.removeEventListener('click', onVoltarClick));
  }

  // 3. BroadcastChannel para sincronização visual de mapa
  const bcConfig = new BroadcastChannel('gerencigeo_map_config');
  bcConfig.onmessage = (event) => {
    if (event.data === 'RELOAD_REQUIRED' && typeof ctx.renderMatriculaDados === 'function') {
      setTimeout(() => {
        ctx.renderMatriculaDados();
      }, 50);
    }
  };
  cleanups.push(() => bcConfig.close());

  // 4. Listeners para os botões de navegação global
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

  // 5. Botão Salvar Rascunho
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

  // 6. Janela AutoCAD Titlebar via pywebview js_api
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

  // 7. AutoCAD Properties Panel Toggle Action
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
    cleanups.forEach(c => c());
  };
}
