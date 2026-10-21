export interface BannerCanetaCallbacks {
  onConcluir: () => void;
  onDesfazer: () => void;
  onFechar: () => void;
}

export class BannerCanetaManager {
  private bannerFlutuante: HTMLElement | null = null;
  private callbacks: BannerCanetaCallbacks;

  constructor(callbacks: BannerCanetaCallbacks) {
    this.callbacks = callbacks;
  }

  public exibir(qtdVertices: number): void {
    const parent = document.getElementById('container-mapa-leaflet-parent');
    if (!parent) return;

    if (!this.bannerFlutuante) {
      this.bannerFlutuante = document.createElement('div');
      this.bannerFlutuante.id = 'banner-caneta-selecao';
      this.bannerFlutuante.className = 'absolute top-3 left-1/2 -translate-x-1/2 bg-[#0c1510]/90 backdrop-blur-md border border-mint-vibrant/40 shadow-2xl rounded-full px-4 py-1.5 z-[1000] flex items-center gap-3 text-xs text-white/90 select-none animate-in fade-in slide-in-from-top-2 duration-200';
      this.bannerFlutuante.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-mint-vibrant animate-ping"></span>
          <span class="font-bold text-mint-vibrant flex items-center gap-1">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m12 19 7-7 3 3-7 7-3-3z"/><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="m2 2 7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>
            Caneta de Seleção
          </span>
          <span class="text-white/40">|</span>
          <span id="txt-caneta-pontos-qtd" class="text-white/80 font-mono">0 vértices</span>
        </div>
        <span class="text-[10px] text-white/50 hidden sm:inline">Clique para adicionar · Duplo clique ou início para fechar</span>
        <div class="flex items-center gap-1.5 ml-1">
          <button id="btn-concluir-caneta" class="px-2.5 py-0.5 bg-mint-vibrant/20 hover:bg-mint-vibrant text-mint-vibrant hover:text-slate-950 font-bold rounded-full text-[10px] transition-all border border-mint-vibrant/30" type="button">
            Concluir
          </button>
          <button id="btn-desfazer-caneta" class="px-2 py-0.5 bg-white/5 hover:bg-white/10 text-white/70 font-semibold rounded-full text-[10px] transition-all border border-white/10" type="button" title="Desfazer último vértice (Ctrl+Z)">
            Desfazer
          </button>
          <button id="btn-fechar-caneta" class="p-1 hover:bg-white/10 text-white/60 hover:text-white rounded-full transition-all" type="button" title="Cancelar (ESC)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      `;

      parent.appendChild(this.bannerFlutuante);

      this.bannerFlutuante.querySelector('#btn-concluir-caneta')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.callbacks.onConcluir();
      });
      this.bannerFlutuante.querySelector('#btn-desfazer-caneta')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.callbacks.onDesfazer();
      });
      this.bannerFlutuante.querySelector('#btn-fechar-caneta')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.callbacks.onFechar();
      });
    }

    this.bannerFlutuante.style.display = 'flex';
    this.atualizarContador(qtdVertices);
  }

  public ocultar(): void {
    if (this.bannerFlutuante) {
      this.bannerFlutuante.style.display = 'none';
    }
  }

  public atualizarContador(qtd: number): void {
    if (!this.bannerFlutuante) return;
    const txt = this.bannerFlutuante.querySelector('#txt-caneta-pontos-qtd');
    if (txt) {
      txt.textContent = `${qtd} ${qtd === 1 ? 'vértice' : 'vértices'}`;
    }
    const btnConcluir = this.bannerFlutuante.querySelector('#btn-concluir-caneta') as HTMLButtonElement;
    if (btnConcluir) {
      btnConcluir.disabled = qtd < 3;
      btnConcluir.style.opacity = qtd < 3 ? '0.4' : '1';
    }
  }
}

/**
 * Atualiza classes visuais dos botões de acionamento da Caneta
 */
export function sincronizarBotoesCanetaUI(ativo: boolean): void {
  const classesAtivo = ['bg-mint-vibrant', 'text-slate-950', 'border-mint-vibrant', 'shadow-[0_0_12px_rgba(0,245,160,0.4)]'];
  const btn = document.getElementById('btn-ferramenta-caneta');
  if (btn) {
    btn.setAttribute('aria-pressed', String(ativo));
    btn.classList.toggle('ativo', ativo);
    if (ativo) {
      btn.classList.add(...classesAtivo);
      btn.classList.remove('bg-white/5', 'text-mint-vibrant');
    } else {
      btn.classList.remove(...classesAtivo);
      btn.classList.add('bg-white/5', 'text-mint-vibrant');
    }
  }

  const btnFlutuante = document.getElementById('btn-mapa-caneta-flutuante');
  if (btnFlutuante) {
    btnFlutuante.setAttribute('aria-pressed', String(ativo));
    btnFlutuante.classList.toggle('ativo', ativo);
    if (ativo) {
      btnFlutuante.classList.add(...classesAtivo);
      btnFlutuante.classList.remove('text-white/70');
    } else {
      btnFlutuante.classList.remove(...classesAtivo);
      btnFlutuante.classList.add('text-white/70');
    }
  }

  const canvasEl = document.getElementById('mapa-triagem') as any;
  if (canvasEl && canvasEl.shadowRoot) {
    const btnShadow = canvasEl.shadowRoot.getElementById('btn-tool-pen');
    if (btnShadow) {
      if (ativo) {
        btnShadow.classList.add('active');
      } else {
        btnShadow.classList.remove('active');
      }
    }
  }
}
