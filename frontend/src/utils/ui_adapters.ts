/**
 * Adapters para Web Components do UI Kit
 * Garante dimensões ampliadas e responsividade para os modais,
 * mantendo o recuo interno e a densidade nativa dos componentes.
 */

export const patchModalShadow = (modalEl: HTMLElement) => {
  const shadow = modalEl.shadowRoot;
  if (!shadow || shadow.querySelector('#patch-modal-dimensoes')) return;

  const dialog = shadow.querySelector('.ui-modal__dialog');
  const header = shadow.querySelector('.ui-modal__header');
  const titulo = shadow.querySelector('.ui-modal__titulo');
  const body = shadow.querySelector('.ui-modal__body');
  const footer = shadow.querySelector('.ui-modal__footer');

  if (dialog) dialog.setAttribute('part', 'dialog');
  if (header) header.setAttribute('part', 'header');
  if (titulo) titulo.setAttribute('part', 'titulo');
  if (body) body.setAttribute('part', 'body');
  if (footer) footer.setAttribute('part', 'footer');

  const style = document.createElement('style');
  style.id = 'patch-modal-dimensoes';
  style.textContent = `
    :host {
      --modal-pad-x: var(--ui-modal-padding-x, 22px);
    }
    .ui-modal__dialog {
      max-width: var(--ui-modal-largura, 560px) !important;
      width: var(--ui-modal-width, 92%) !important;
      box-sizing: border-box !important;
      transition: max-width 0.2s cubic-bezier(0.4, 0, 0.2, 1), width 0.2s ease !important;
    }
    :host([tamanho="extra-grande"]) .ui-modal__dialog,
    :host(.modal-amplo) .ui-modal__dialog,
    :host(#modal-detalhes-cliente) .ui-modal__dialog {
      max-width: var(--ui-modal-largura, 1080px) !important;
    }
    :host([tamanho="grande"]) .ui-modal__dialog,
    :host(.modal-cliente-amplo) .ui-modal__dialog,
    :host(#modal-cliente) .ui-modal__dialog {
      max-width: var(--ui-modal-largura, 900px) !important;
    }
    :host([tamanho="medio"]) .ui-modal__dialog {
      max-width: var(--ui-modal-largura, 680px) !important;
    }
    .ui-modal__header {
      padding-left: var(--modal-pad-x) !important;
      padding-right: var(--modal-pad-x) !important;
      padding-top: var(--ui-modal-header-py, 10px) !important;
      padding-bottom: var(--ui-modal-header-py, 10px) !important;
      min-height: var(--ui-modal-header-min-h, 36px) !important;
      box-sizing: border-box !important;
    }
    .ui-modal__body {
      padding-left: var(--modal-pad-x) !important;
      padding-right: var(--modal-pad-x) !important;
      padding-top: var(--ui-modal-body-py, 12px) !important;
      padding-bottom: var(--ui-modal-body-py, 12px) !important;
      box-sizing: border-box !important;
    }
    .ui-modal__footer {
      padding-left: var(--modal-pad-x) !important;
      padding-right: var(--modal-pad-x) !important;
      padding-top: var(--ui-modal-footer-py, 8px) !important;
      padding-bottom: var(--ui-modal-footer-py, 8px) !important;
      min-height: var(--ui-modal-footer-min-h, 42px) !important;
      box-sizing: border-box !important;
    }
  `;
  shadow.appendChild(style);
};

export const aplicarPatchesUI = () => {
  // Hook no protótipo de UIModal para suporte a larguras e densidade
  const ModalClass = customElements.get('ui-modal');
  if (ModalClass?.prototype) {
    const origConnected = ModalClass.prototype.connectedCallback;
    ModalClass.prototype.connectedCallback = function() {
      if (origConnected) origConnected.apply(this, arguments);
      patchModalShadow(this);
    };
    const origAbrir = ModalClass.prototype.abrir;
    ModalClass.prototype.abrir = function() {
      patchModalShadow(this);
      if (origAbrir) return origAbrir.apply(this, arguments);
    };
  }

  // Varre modais existentes no DOM
  const varrerModais = () => {
    document.querySelectorAll<HTMLElement>('ui-modal, ui-dialog').forEach(patchModalShadow);
  };

  varrerModais();

  // Observer para novos modais injetados via SPA
  const observer = new MutationObserver((mutations) => {
    let deveVarrer = false;
    for (const m of mutations) {
      if (m.addedNodes.length > 0) {
        deveVarrer = true;
        break;
      }
    }
    if (deveVarrer) {
      varrerModais();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
};
