import { createIcons } from 'lucide';

type RibbonState = 'expanded' | 'compact' | 'collapsed';

interface GroupCache {
  id: string;
  el: HTMLElement;
  label: string;
  priority: number;
  state: RibbonState;
  widths: {
    expanded: number;
    compact: number;
    collapsed: number;
  };
  toolsContainer: HTMLElement | null;
  collapsedBtn: HTMLElement | null;
  popover: HTMLElement | null;
}

export class RibbonManager {
  private panel: HTMLElement;
  private groups: GroupCache[] = [];
  private readonly HYSTERESIS = 25; // pixels
  private resizeObserver: ResizeObserver | null = null;
  
  // Menor número = colapsa PRIMEIRO.
  private readonly PRIORITIES: Record<string, number> = {
    'grp-vizinhos': 1,
    'grp-projeto': 2,
    'grp-coordenadas': 3,
    'grp-exportar': 4,
    'grp-edicao': 5,
    'grp-ingestao': 6,
  };

  constructor(panelId: string) {
    const el = document.getElementById(panelId);
    if (!el) throw new Error(`Painel ${panelId} não encontrado`);
    this.panel = el;
  }

  public async init() {
    // Aguarda as fontes carregarem para evitar cálculos incorretos de layout
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    // Aguarda um pequeno ciclo para garantir que o DOM e ícones iniciais renderizaram
    await new Promise(r => setTimeout(r, 100));

    this.buildCache();
    this.setupResizeObserver();
    
    // Configura fechamento de popovers ao clicar fora ou apertar ESC
    document.addEventListener('mousedown', this.handleOutsideClick.bind(this));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeAllPopovers();
    });
  }

  private buildCache() {
    const groupEls = Array.from(this.panel.querySelectorAll('.rl3-group')) as HTMLElement[];
    
    // Contêiner off-screen para medição segura sem layout thrashing
    const offscreen = document.createElement('div');
    offscreen.className = 'rl3-panel';
    offscreen.style.position = 'absolute';
    offscreen.style.visibility = 'hidden';
    offscreen.style.top = '-9999px';
    document.body.appendChild(offscreen);

    for (const group of groupEls) {
      const id = group.getAttribute('data-group-id') || 'unknown';
      const tools = group.querySelector('.rl3-group-tools') as HTMLElement;
      const labelEl = group.querySelector('.rl3-group-label') as HTMLElement;
      const label = labelEl ? labelEl.textContent || '' : id;

      // Cria botão colapsado
      const colBtn = document.createElement('div');
      colBtn.className = 'rl3-collapsed-btn';
      colBtn.style.display = 'none';
      colBtn.innerHTML = `<i data-lucide="chevron-down"></i><span>${label}</span>`;
      group.appendChild(colBtn);

      // Popover global
      const popover = document.createElement('div');
      popover.className = 'rl3-group-popover';
      document.body.appendChild(popover);

      // Clone para medição
      const clone = group.cloneNode(true) as HTMLElement;
      offscreen.appendChild(clone);

      // Mede Expanded
      const expandedWidth = clone.offsetWidth;

      // Mede Compact
      clone.classList.add('ribbon-state-compact');
      const compactWidth = clone.offsetWidth;

      // Mede Collapsed
      clone.classList.remove('ribbon-state-compact');
      clone.classList.add('ribbon-state-collapsed');
      const colBtnClone = clone.querySelector('.rl3-collapsed-btn') as HTMLElement;
      if (colBtnClone) colBtnClone.style.display = 'flex';
      const collapsedWidth = clone.offsetWidth;

      offscreen.removeChild(clone);

      this.groups.push({
        id,
        el: group,
        label,
        priority: this.PRIORITIES[id] || 99,
        state: 'expanded',
        widths: {
          expanded: expandedWidth,
          compact: compactWidth,
          collapsed: collapsedWidth
        },
        toolsContainer: tools,
        collapsedBtn: colBtn,
        popover: popover
      });
      
      // Evento para abrir o popover
      colBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePopover(id);
      });
    }

    document.body.removeChild(offscreen);
    createIcons(); // Recria ícones para os botões colapsados recém-criados
    this.adjustLayout();
  }

  private setupResizeObserver() {
    let ticking = false;
    this.resizeObserver = new ResizeObserver(() => {
      if (!ticking) {
        requestAnimationFrame(() => {
          this.adjustLayout();
          ticking = false;
        });
        ticking = true;
      }
    });
    this.resizeObserver.observe(this.panel);
  }

  private calculateRequiredWidth(): number {
    let total = 0;
    const dividers = this.panel.querySelectorAll('.rl3-divider').length;
    // Pega o padding do painel (geralmente 8px de cada lado = 16) + gap dos dividers (13px cada)
    total += 16 + (dividers * 13);
    
    for (const g of this.groups) {
      total += g.widths[g.state];
    }
    return total;
  }

  private calculateWidthWithState(groupId: string, proposedState: RibbonState): number {
    let total = 16 + (this.panel.querySelectorAll('.rl3-divider').length * 13);
    for (const g of this.groups) {
      if (g.id === groupId) {
        total += g.widths[proposedState];
      } else {
        total += g.widths[g.state];
      }
    }
    return total;
  }

  private adjustLayout() {
    if (this.groups.length === 0) return;
    const availableWidth = this.panel.clientWidth;
    
    let changed = false;
    let safeLoop = 0;
    
    do {
      changed = false;
      safeLoop++;
      if (safeLoop > 50) break; // Evita loop infinito sob circunstâncias imprevistas
      
      const reqWidth = this.calculateRequiredWidth();
      
      if (availableWidth < reqWidth) {
        // Precisa encolher: busca candidato com MENOR prioridade
        const candidates = this.groups.filter(g => g.state !== 'collapsed').sort((a, b) => a.priority - b.priority);
        if (candidates.length > 0) {
          const c = candidates[0];
          this.setState(c, c.state === 'expanded' ? 'compact' : 'collapsed');
          changed = true;
        }
      } else if (availableWidth > reqWidth + this.HYSTERESIS) {
        // Sobra espaço: busca candidato para expandir com MAIOR prioridade
        const candidates = this.groups.filter(g => g.state !== 'expanded').sort((a, b) => b.priority - a.priority);
        for (const c of candidates) {
          const nextState = c.state === 'collapsed' ? 'compact' : 'expanded';
          if (this.calculateWidthWithState(c.id, nextState) <= availableWidth) {
            this.setState(c, nextState);
            changed = true;
            break; // Apenas um de cada vez
          }
        }
      }
    } while (changed);
  }

  private setState(group: GroupCache, newState: RibbonState) {
    if (group.state === newState) return;
    
    // Se estava colapsado e vai expandir, volta as tools pro DOM original
    if (group.state === 'collapsed') {
      if (group.collapsedBtn) group.collapsedBtn.style.display = 'none';
      if (group.popover && group.toolsContainer) {
        group.popover.classList.remove('is-open');
        group.el.insertBefore(group.toolsContainer, group.el.firstChild);
      }
    }

    group.el.classList.remove('ribbon-state-compact', 'ribbon-state-collapsed');
    
    if (newState === 'compact') {
      group.el.classList.add('ribbon-state-compact');
    } else if (newState === 'collapsed') {
      group.el.classList.add('ribbon-state-collapsed');
      if (group.collapsedBtn) group.collapsedBtn.style.display = 'flex';
      // Move ferramentas pro popover global pra evitar problemas de Z-Index/Overflow
      if (group.popover && group.toolsContainer) {
        group.popover.appendChild(group.toolsContainer);
      }
    }
    
    group.state = newState;
  }

  private togglePopover(groupId: string) {
    this.closeAllPopovers(groupId); // Fecha outros
    
    const group = this.groups.find(g => g.id === groupId);
    if (!group || !group.popover || !group.collapsedBtn) return;
    
    const isOpen = group.popover.classList.contains('is-open');
    if (isOpen) {
      group.popover.classList.remove('is-open');
    } else {
      // Posiciona abaixo do botão dinamicamente
      const rect = group.collapsedBtn.getBoundingClientRect();
      group.popover.style.top = `${rect.bottom + 4}px`;
      group.popover.style.left = `${rect.left}px`;
      group.popover.classList.add('is-open');
    }
  }

  private closeAllPopovers(exceptId?: string) {
    for (const g of this.groups) {
      if (g.id !== exceptId && g.popover) {
        g.popover.classList.remove('is-open');
      }
    }
  }

  private handleOutsideClick(e: MouseEvent) {
    let clickedInside = false;
    for (const g of this.groups) {
      if (g.popover?.contains(e.target as Node) || g.collapsedBtn?.contains(e.target as Node)) {
        clickedInside = true;
        break;
      }
    }
    if (!clickedInside) {
      this.closeAllPopovers();
    }
  }
}
