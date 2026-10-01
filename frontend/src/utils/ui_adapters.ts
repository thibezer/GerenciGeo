/**
 * Adapters e Patches Dinâmicos para Web Components do UI Kit
 * Garante dimensões ampliadas, responsividade, parts para estilização
 * e respiro adequado das margens laterais e internas dos campos.
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
      --modal-pad-x: var(--ui-modal-padding-x, 28px);
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
      padding-top: var(--ui-modal-header-py, 16px) !important;
      padding-bottom: var(--ui-modal-header-py, 16px) !important;
      box-sizing: border-box !important;
    }
    .ui-modal__body {
      padding-left: var(--modal-pad-x) !important;
      padding-right: var(--modal-pad-x) !important;
      padding-top: var(--ui-modal-body-py, 18px) !important;
      padding-bottom: var(--ui-modal-body-py, 18px) !important;
      box-sizing: border-box !important;
    }
    .ui-modal__footer {
      padding-left: var(--modal-pad-x) !important;
      padding-right: var(--modal-pad-x) !important;
      padding-top: var(--ui-modal-footer-py, 14px) !important;
      padding-bottom: var(--ui-modal-footer-py, 14px) !important;
      box-sizing: border-box !important;
    }
  `;
  shadow.appendChild(style);
};

export const patchCampoTextoShadow = (campoEl: HTMLElement) => {
  const shadow = campoEl.shadowRoot;
  if (!shadow || shadow.querySelector('#patch-campo-texto-estilo')) return;

  const container = shadow.querySelector('.ui-campo-texto__container');
  const wrapper = shadow.querySelector('.ui-campo-texto__wrapper');
  const input = shadow.querySelector('.ui-campo-texto__input');

  if (container) container.setAttribute('part', 'container');
  if (wrapper) wrapper.setAttribute('part', 'wrapper');
  if (input) input.setAttribute('part', 'input');

  const style = document.createElement('style');
  style.id = 'patch-campo-texto-estilo';
  style.textContent = `
    .ui-campo-texto__wrapper {
      padding-left: var(--ui-campo-padding-x, 12px) !important;
      padding-right: var(--ui-campo-padding-x, 12px) !important;
      box-sizing: border-box !important;
    }
    .ui-campo-texto__input {
      font-size: var(--ui-campo-fonte-tamanho, inherit) !important;
      box-sizing: border-box !important;
    }
  `;
  shadow.appendChild(style);
};

export const patchSelectShadow = (selectEl: HTMLElement) => {
  const shadow = selectEl.shadowRoot;
  if (!shadow || shadow.querySelector('#patch-select-estilo')) return;

  const gatilho = shadow.querySelector('.ui-lista-flutuante__gatilho');
  const texto = shadow.querySelector('.ui-lista-flutuante__texto');

  if (gatilho) {
    gatilho.setAttribute('part', 'trigger');
    gatilho.setAttribute('part', 'select');
  }
  if (texto) texto.setAttribute('part', 'texto');

  const style = document.createElement('style');
  style.id = 'patch-select-estilo';
  style.textContent = `
    .ui-lista-flutuante__gatilho {
      padding-left: var(--ui-campo-padding-x, 12px) !important;
      padding-right: var(--ui-campo-padding-x, 12px) !important;
      box-sizing: border-box !important;
    }
  `;
  shadow.appendChild(style);
};

export const aplicarPatchesUI = () => {
  // 1. Hook no protótipo de UIModal
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

  // 2. Hook no protótipo de UICampoTexto
  const CampoClass = customElements.get('ui-campo-texto');
  if (CampoClass?.prototype) {
    const origConnected = CampoClass.prototype.connectedCallback;
    CampoClass.prototype.connectedCallback = function() {
      if (origConnected) origConnected.apply(this, arguments);
      patchCampoTextoShadow(this);
    };
  }

  // 3. Hook no protótipo de UISelect / UIListaFlutuante
  const SelectClass = customElements.get('ui-select') || customElements.get('ui-lista-flutuante');
  if (SelectClass?.prototype) {
    const origConnected = SelectClass.prototype.connectedCallback;
    SelectClass.prototype.connectedCallback = function() {
      if (origConnected) origConnected.apply(this, arguments);
      patchSelectShadow(this);
    };
  }

  // 4. Varre elementos já presentes no DOM
  const varrerElementosExistentes = () => {
    document.querySelectorAll<HTMLElement>('ui-modal, ui-dialog').forEach(patchModalShadow);
    document.querySelectorAll<HTMLElement>('ui-campo-texto').forEach(patchCampoTextoShadow);
    document.querySelectorAll<HTMLElement>('ui-select, ui-lista-flutuante').forEach(patchSelectShadow);
  };

  varrerElementosExistentes();

  // 5. Observer para novos elementos injetados via SPA
  const observer = new MutationObserver((mutations) => {
    let deveVarrer = false;
    for (const m of mutations) {
      if (m.addedNodes.length > 0) {
        deveVarrer = true;
        break;
      }
    }
    if (deveVarrer) {
      varrerElementosExistentes();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
};
