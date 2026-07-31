import estilos from './gg-botao-primario.css?inline';

export class GGBotaoPrimario extends HTMLElement {
  static get observedAttributes() {
    return ['disabled', 'variante'];
  }

  private button: HTMLButtonElement;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${estilos}</style>
      <button class="gg-botao-primario">
        <slot></slot>
      </button>
    `;
    this.button = shadow.querySelector('button')!;
  }

  connectedCallback() {
    this.button.addEventListener('click', this.handleClick);
    this.syncVariante();
  }

  disconnectedCallback() {
    this.button.removeEventListener('click', this.handleClick);
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null) {
    if (name === 'disabled') {
      this.button.disabled = value !== null;
    }
    if (name === 'variante') {
      this.syncVariante();
    }
  }

  private syncVariante() {
    const variante = this.getAttribute('variante');
    this.button.className = variante
      ? `gg-botao-primario gg-botao-primario--${variante}`
      : 'gg-botao-primario';
  }

  private handleClick = (e: MouseEvent) => {
    if (this.hasAttribute('disabled')) return;
    this.dispatchEvent(new CustomEvent('gg-click', { detail: { originalEvent: e }, bubbles: true, composed: true }));
  };
}

customElements.define('gg-botao-primario', GGBotaoPrimario);
