import estilos from './gg-lista-flutuante.css?inline';

export interface ItemLista {
  id: string;
  label: string;
}

export class GGListaFlutuante extends HTMLElement {
  static get observedAttributes() {
    return ['aberta', 'texto-padrao', 'value', 'disabled'];
  }

  private button: HTMLButtonElement;
  private content: HTMLUListElement;
  private textoElement: HTMLSpanElement;
  private _itens: ItemLista[] = [];
  private _value: string = '';

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${estilos}</style>
      <button class="gg-lista-flutuante__gatilho" aria-haspopup="listbox" aria-expanded="false" type="button">
        <span class="gg-lista-flutuante__texto"></span>
        <span class="gg-lista-flutuante__seta">▼</span>
      </button>
      <ul class="gg-lista-flutuante__conteudo" role="listbox" popover="manual"></ul>
    `;
    this.button = shadow.querySelector('.gg-lista-flutuante__gatilho')!;
    this.content = shadow.querySelector('.gg-lista-flutuante__conteudo')!;
    this.textoElement = shadow.querySelector('.gg-lista-flutuante__texto')!;
  }

  connectedCallback() {
    this.button.addEventListener('click', this.toggleLista);
    document.addEventListener('click', this.handleClickFora);
    this.syncState();
  }

  disconnectedCallback() {
    this.button.removeEventListener('click', this.toggleLista);
    document.removeEventListener('click', this.handleClickFora);
    this.fechar();
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null) {
    if (name === 'aberta') {
      this.button.setAttribute('aria-expanded', String(value !== null));
    }
    if (name === 'texto-padrao') {
      this.syncLabel();
    }
    if (name === 'value' && value !== this._value) {
      this.value = value || '';
    }
    if (name === 'disabled') {
      this.button.disabled = value !== null;
    }
  }

  get value(): string {
    return this._value;
  }

  set value(val: string) {
    this._value = val;
    this.setAttribute('value', val);
    this.syncLabel();
    this.updateSelectedState();
  }

  get itens(): ItemLista[] {
    return this._itens;
  }

  set itens(value: ItemLista[]) {
    this._itens = value || [];
    this.renderItens();
    this.syncLabel();
  }

  private toggleLista = (e: MouseEvent) => {
    e.stopPropagation();
    if (this.hasAttribute('disabled')) return;
    if (this.hasAttribute('aberta')) {
      this.fechar();
    } else {
      this.abrir();
    }
  };

  private abrir() {
    this.setAttribute('aberta', '');
    this.posicionarConteudo();
    window.addEventListener('scroll', this.fechar, { capture: true, passive: true });
    window.addEventListener('resize', this.posicionarConteudo, { passive: true });
    if (typeof (this.content as any).showPopover === 'function') {
      try {
        (this.content as any).showPopover();
      } catch (_e) {
        // Fallback para navegadores sem suporte
      }
    }
  }

  private fechar = () => {
    this.removeAttribute('aberta');
    window.removeEventListener('scroll', this.fechar, { capture: true });
    window.removeEventListener('resize', this.posicionarConteudo);
    if (typeof (this.content as any).hidePopover === 'function') {
      try {
        (this.content as any).hidePopover();
      } catch (_e) {
        // Fallback
      }
    }
  };

  private posicionarConteudo = () => {
    const rect = this.button.getBoundingClientRect();
    this.content.style.top = `${rect.bottom + 2}px`;
    this.content.style.left = `${rect.left}px`;
    this.content.style.minWidth = `${Math.max(rect.width, 110)}px`;
  };

  private handleClickFora = (event: MouseEvent) => {
    const composedPath = event.composedPath();
    if (!composedPath.includes(this) && !composedPath.includes(this.content)) {
      this.fechar();
    }
  };

  private syncLabel() {
    const itemEncontrado = this._itens.find(i => String(i.id) === String(this._value));
    if (itemEncontrado) {
      this.textoElement.textContent = itemEncontrado.label;
    } else {
      const textoPadrao = this.getAttribute('texto-padrao') || 'Opções';
      this.textoElement.textContent = textoPadrao;
    }
  }

  private updateSelectedState() {
    const liElements = this.content.querySelectorAll('.gg-lista-flutuante__item');
    liElements.forEach(li => {
      const itemId = li.getAttribute('data-id');
      if (itemId === String(this._value)) {
        li.classList.add('gg-lista-flutuante__item--selecionado');
        li.setAttribute('aria-selected', 'true');
      } else {
        li.classList.remove('gg-lista-flutuante__item--selecionado');
        li.removeAttribute('aria-selected');
      }
    });
  }

  private renderItens() {
    this.content.innerHTML = '';
    this._itens.forEach(item => {
      const li = document.createElement('li');
      const isSelected = String(item.id) === String(this._value);
      li.className = `gg-lista-flutuante__item ${isSelected ? 'gg-lista-flutuante__item--selecionado' : ''}`;
      li.setAttribute('data-id', item.id);
      li.textContent = item.label;
      li.role = 'option';
      if (isSelected) li.setAttribute('aria-selected', 'true');
      li.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        this.selecionarItem(item);
      });
      this.content.appendChild(li);
    });
  }

  private syncState() {
    if (this.hasAttribute('value')) {
      this._value = this.getAttribute('value') || '';
    }
    this.syncLabel();
  }

  private selecionarItem(item: ItemLista) {
    this._value = item.id;
    this.setAttribute('value', item.id);
    this.textoElement.textContent = item.label;
    this.fechar();
    this.updateSelectedState();

    this.dispatchEvent(
      new CustomEvent('gg-selecionar', {
        detail: item,
        bubbles: true,
        composed: true,
      })
    );

    this.dispatchEvent(
      new Event('change', {
        bubbles: true,
        composed: true,
      })
    );
  }
}

if (!customElements.get('gg-lista-flutuante')) {
  customElements.define('gg-lista-flutuante', GGListaFlutuante);
}
