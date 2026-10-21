import { escapeHtml, initIcons, showDialog } from '../../utils';

/** Confirmação estilizada (substitui window.confirm). `mensagemHtml` deve vir com os dados dinâmicos já escapados. */
export const confirmar = (
  titulo: string,
  mensagemHtml: string,
  confirmarTexto = 'Confirmar',
  cancelarTexto = 'Cancelar'
): Promise<boolean> =>
  showDialog({ title: escapeHtml(titulo), message: mensagemHtml, confirmText: confirmarTexto, cancelText: cancelarTexto });

/** Aviso estilizado de um único botão (substitui window.alert para mensagens que o usuário precisa ler). */
export const avisarDialogo = (titulo: string, mensagemHtml: string): Promise<boolean> =>
  showDialog({ title: escapeHtml(titulo), message: mensagemHtml, isAlert: true, confirmText: 'Entendi' });

export const CLS_INPUT =
  'w-full bg-white/5 border border-white/15 hover:border-white/25 rounded-technical px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-mint-vibrant transition-colors';
export const CLS_LABEL = 'block text-[11px] font-medium tracking-wider uppercase text-white/60 mb-1';
export const CLS_BOTAO_SEC =
  'px-4 py-2 text-sm font-medium rounded-technical bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 transition-all cursor-pointer';
export const CLS_BOTAO_PRI =
  'px-4 py-2 text-sm font-bold rounded-technical bg-mint-vibrant text-forest-deep hover:brightness-110 active:scale-95 transition-all cursor-pointer';

const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let seqModal = 0;

export type LeituraModal<T> = { valor: T } | { erro: string; campo?: string };

export interface ModalFormularioConfig<T> {
  titulo: string;
  descricao?: string;
  /** HTML dos campos (dados dinâmicos já escapados). Cada campo deve ter `name`/`id` único. */
  corpoHtml: string;
  textoConfirmar: string;
  textoCancelar?: string;
  larguraClasse?: string;
  aoMontar?: (form: HTMLFormElement) => void;
  ler: (form: HTMLFormElement) => LeituraModal<T>;
}

/**
 * Modal de formulário acessível: role="dialog" + aria-modal, foco inicial no primeiro campo, Tab preso no diálogo,
 * Esc cancela e o foco volta ao elemento que abriu. Resolve com o valor lido ou null se cancelado.
 */
export function abrirModalFormulario<T>(cfg: ModalFormularioConfig<T>): Promise<T | null> {
  return new Promise((resolve) => {
    const gatilho = document.activeElement as HTMLElement | null;
    const id = `modal-cartorio-${++seqModal}`;

    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm';
    overlay.style.zIndex = '999990';

    overlay.innerHTML = `
      <div role="dialog" aria-modal="true" aria-labelledby="${id}-titulo" ${cfg.descricao ? `aria-describedby="${id}-desc"` : ''}
           class="w-full ${cfg.larguraClasse || 'max-w-md'} max-h-[92vh] overflow-y-auto bg-[#111113] border border-white/10 rounded-technical shadow-2xl p-5"
           style="background-color: var(--geo-bg-surface, #111113); color: var(--geo-text-primary, rgba(255,255,255,0.92));">
        <form novalidate class="flex flex-col gap-4">
          <div>
            <h3 id="${id}-titulo" class="text-base font-semibold tracking-tight text-white">${escapeHtml(cfg.titulo)}</h3>
            ${cfg.descricao ? `<p id="${id}-desc" class="text-xs text-white/70 mt-1 leading-relaxed">${cfg.descricao}</p>` : ''}
          </div>
          <div class="flex flex-col gap-3">${cfg.corpoHtml}</div>
          <p data-erro-modal role="alert" class="hidden text-xs font-medium text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded px-3 py-2"></p>
          <div class="flex justify-end gap-3 pt-1">
            <button type="button" data-cancelar class="${CLS_BOTAO_SEC}">${escapeHtml(cfg.textoCancelar || 'Cancelar')}</button>
            <button type="submit" class="${CLS_BOTAO_PRI}">${escapeHtml(cfg.textoConfirmar)}</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);
    initIcons();

    const dialogo = overlay.firstElementChild as HTMLElement;
    const form = overlay.querySelector('form') as HTMLFormElement;
    const caixaErro = overlay.querySelector('[data-erro-modal]') as HTMLElement;

    let encerrado = false;
    const encerrar = (valor: T | null) => {
      if (encerrado) return;
      encerrado = true;
      overlay.removeEventListener('keydown', aoTeclar);
      overlay.remove();
      if (gatilho && gatilho.isConnected) {
        try { gatilho.focus(); } catch { /* elemento sem foco */ }
      }
      resolve(valor);
    };

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        encerrar(null);
        return;
      }
      if (e.key !== 'Tab') return;
      const itens = Array.from(dialogo.querySelectorAll<HTMLElement>(FOCAVEIS)).filter(el => el.offsetParent !== null);
      if (itens.length === 0) return;
      const primeiro = itens[0];
      const ultimo = itens[itens.length - 1];
      const ativo = document.activeElement;
      if (e.shiftKey && (ativo === primeiro || !dialogo.contains(ativo))) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && (ativo === ultimo || !dialogo.contains(ativo))) {
        e.preventDefault();
        primeiro.focus();
      }
    };
    overlay.addEventListener('keydown', aoTeclar);

    overlay.querySelector('[data-cancelar]')?.addEventListener('click', () => encerrar(null));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const leitura = cfg.ler(form);
      if ('erro' in leitura) {
        caixaErro.textContent = leitura.erro;
        caixaErro.classList.remove('hidden');
        if (leitura.campo) {
          const alvo = form.querySelector<HTMLElement>(`[name="${leitura.campo}"]`);
          alvo?.focus();
          alvo?.setAttribute('aria-invalid', 'true');
        }
        return;
      }
      encerrar(leitura.valor);
    });
    form.addEventListener('input', () => {
      caixaErro.classList.add('hidden');
      form.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
    });

    cfg.aoMontar?.(form);
    setTimeout(() => {
      const inicial = dialogo.querySelector<HTMLElement>('[data-foco-inicial]')
        || dialogo.querySelector<HTMLElement>('input:not([type="hidden"]), select, textarea');
      (inicial || dialogo.querySelector<HTMLElement>('button'))?.focus();
    }, 0);
  });
}
