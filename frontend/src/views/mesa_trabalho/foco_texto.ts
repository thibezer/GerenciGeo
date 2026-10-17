/**
 * O foco está num campo de texto? Mesma lógica do `focoEmCampoDeTexto` do kit (core/alvo-digitavel), replicada
 * aqui porque o kit não a exporta pelo entry point público (e ele não pode ser editado por este app).
 *
 * `document.activeElement` não serve: dentro de um shadow root ele devolve o elemento hospedeiro, não o
 * <input>. O alvo real do evento atravessa o shadow pelo `composedPath()`; sem evento, desce pelos
 * `shadowRoot.activeElement`. Só campos que aceitam digitação contam: o <ui-canvas-cad>, botões, checkboxes e
 * demais componentes `ui-*`/`fluent-*` em si NÃO bloqueiam atalhos.
 */

const TIPOS_SEM_TEXTO = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image']);

function ehCampoDeTexto(el: Element | null | undefined): boolean {
  if (!el) return false;
  const h = el as HTMLElement;
  if (h.tagName === 'INPUT') return !TIPOS_SEM_TEXTO.has(((h as HTMLInputElement).type || 'text').toLowerCase());
  return h.tagName === 'TEXTAREA' || h.tagName === 'SELECT' || h.isContentEditable === true;
}

export function focoEmCampoDeTexto(evento?: Event): boolean {
  const origem = evento?.composedPath?.()[0];
  if (origem instanceof Element) return ehCampoDeTexto(origem);

  let el: Element | null = typeof document === 'undefined' ? null : document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  return ehCampoDeTexto(el);
}

/** O alvo real do evento é um controle acionável por Enter/Espaço (botão, link, resumo, role=button)? */
export function alvoAcionavelPorTeclado(evento: Event): boolean {
  const origem = evento.composedPath?.()[0];
  if (!(origem instanceof Element)) return false;
  return !!origem.closest('button, a[href], summary, [role="button"]');
}
