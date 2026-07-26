import { createIcons, ChevronDown } from 'lucide';
import { registerFluentComponents } from './fluent_setup';

export type RibbonState = 'expanded' | 'compact' | 'collapsed';

export interface GroupCache {
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

export class FluentRibbonManager {
  private panel: HTMLElement;
  private groups: GroupCache[] = [];
  private readonly HYSTERESIS = 25; // pixels

  private static readonly PANEL_PADDING_X = 16;
  private static readonly DIVIDER_WIDTH_WITH_MARGINS = 13;

  private resizeObserver: ResizeObserver | null = null;
  
  private boundOutsideClick = this.handleOutsideClick.bind(this);
  private boundKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.closeAllPopovers();
  };
  private boundTriggerAdjust = () => {
    if (!this.ticking) {
      requestAnimationFrame(() => {
        this.adjustLayout();
        this.ticking = false;
      });
      this.ticking = true;
    }
  };
  private ticking = false;

  // Menor número = colapsa PRIMEIRO.
  private readonly PRIORITIES: Record<string, number> = {
    'grp-vizinhos': 1,
    'grp-projeto': 2,
    'grp-coordenadas': 3,
    'grp-exportar': 4,
    'grp-edicao': 5,
    'grp-ingestao': 6,
    'grp-topografia': 7,
    'grp-documentos': 8,
    'grp-auditoria': 9,
  };

  constructor(panelId: string) {
    registerFluentComponents();
    const el = document.getElementById(panelId);
    if (!el) throw new Error(`Painel ${panelId} não encontrado`);
    this.panel = el;
  }

  public async init() {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    await new Promise(r => setTimeout(r, 100));

    this.destroy();
    this.buildCache();
    this.setupResizeObserver();
    
    document.addEventListener('mousedown', this.boundOutsideClick);
    document.addEventListener('keydown', this.boundKeydown);
  }

  public destroy() {
    document.removeEventListener('mousedown', this.boundOutsideClick);
    document.removeEventListener('keydown', this.boundKeydown);
    window.removeEventListener('resize', this.boundTriggerAdjust);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    for (const g of this.groups) {
      if (g.state === 'collapsed' && g.toolsContainer && g.el) {
        g.el.insertBefore(g.toolsContainer, g.el.firstChild);
      }
      if (g.popover && g.popover.parentNode) {
        g.popover.parentNode.removeChild(g.popover);
      }
      if (g.collapsedBtn && g.collapsedBtn.parentNode) {
        g.collapsedBtn.parentNode.removeChild(g.collapsedBtn);
      }
    }
    this.groups = [];
  }

  private buildCache() {
    const groupEls = Array.from(this.panel.querySelectorAll('.rl3-group')) as HTMLElement[];
    
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

      const cols = group.querySelectorAll('.rl3-tool-col');
      cols.forEach(col => {
        if (col.children.length > 3) {
          console.warn(`[FluentRibbonManager] Grupo "${id}" possui ${col.children.length} botões em uma única coluna — limite máximo recomendado é 3.`);
        }
      });

      const colBtn = document.createElement('fluent-button');
      colBtn.className = 'rl3-collapsed-btn fluent-ribbon-btn';
      colBtn.setAttribute('appearance', 'transparent');
      colBtn.style.display = 'none';
      colBtn.innerHTML = `<i data-lucide="chevron-down"></i><span>${label}</span>`;
      group.appendChild(colBtn);

      const popover = document.createElement('div');
      popover.className = 'rl3-group-popover fluent-popover';
      popover.setAttribute('data-popover-for', id);
      document.body.appendChild(popover);

      const clone = group.cloneNode(true) as HTMLElement;
      offscreen.appendChild(clone);

      const expandedWidth = clone.offsetWidth;

      clone.classList.add('ribbon-state-compact');
      const compactWidth = clone.offsetWidth;

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
      
      colBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePopover(id);
      });
    }

    document.body.removeChild(offscreen);
    
    createIcons({
      icons: { ChevronDown },
      nameAttr: 'data-lucide',
      root: this.panel
    });

    this.adjustLayout();
  }

  private setupResizeObserver() {
    this.resizeObserver = new ResizeObserver(this.boundTriggerAdjust);
    this.resizeObserver.observe(this.panel);
    window.addEventListener('resize', this.boundTriggerAdjust);
  }

  private calculateRequiredWidth(): number {
    let total = 0;
    const dividers = this.panel.querySelectorAll('.rl3-divider').length;
    total += FluentRibbonManager.PANEL_PADDING_X + (dividers * FluentRibbonManager.DIVIDER_WIDTH_WITH_MARGINS);
    
    for (const g of this.groups) {
      total += g.widths[g.state];
    }
    return total;
  }

  private calculateWidthWithState(groupId: string, proposedState: RibbonState): number {
    let total = FluentRibbonManager.PANEL_PADDING_X + (this.panel.querySelectorAll('.rl3-divider').length * FluentRibbonManager.DIVIDER_WIDTH_WITH_MARGINS);
    for (const g of this.groups) {
      if (g.id === groupId) {
        total += g.widths[proposedState];
      } else {
        total += g.widths[g.state];
      }
    }
    return total;
  }

  public adjustLayout() {
    if (this.groups.length === 0) return;
    const availableWidth = this.panel.clientWidth;
    
    if (availableWidth <= 0) return;
    
    let changed = false;
    let safeLoop = 0;
    
    do {
      changed = false;
      safeLoop++;
      if (safeLoop > 50) break;
      
      const reqWidth = this.calculateRequiredWidth();
      
      if (availableWidth < reqWidth) {
        const candidates = this.groups.filter(g => g.state !== 'collapsed').sort((a, b) => a.priority - b.priority);
        if (candidates.length > 0) {
          const c = candidates[0];
          this.setState(c, c.state === 'expanded' ? 'compact' : 'collapsed');
          changed = true;
        }
      } else if (availableWidth > reqWidth + this.HYSTERESIS) {
        const candidates = this.groups.filter(g => g.state !== 'expanded').sort((a, b) => b.priority - a.priority);
        for (const c of candidates) {
          const nextState = c.state === 'collapsed' ? 'compact' : 'expanded';
          if (this.calculateWidthWithState(c.id, nextState) <= availableWidth) {
            this.setState(c, nextState);
            changed = true;
            break;
          }
        }
      }
    } while (changed);
  }

  private setState(group: GroupCache, newState: RibbonState) {
    if (group.state === newState) return;
    
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
      if (group.popover && group.toolsContainer) {
        group.popover.appendChild(group.toolsContainer);
      }
    }
    
    group.state = newState;
  }

  private togglePopover(groupId: string) {
    this.closeAllPopovers(groupId);
    
    const group = this.groups.find(g => g.id === groupId);
    if (!group || !group.popover || !group.collapsedBtn) return;
    
    const isOpen = group.popover.classList.contains('is-open');
    if (isOpen) {
      group.popover.classList.remove('is-open');
    } else {
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
