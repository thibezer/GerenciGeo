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
const CLS_BOTAO_SEC =
  'px-4 py-2 text-sm font-medium rounded-technical bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 transition-all cursor-pointer';
const CLS_BOTAO_PRI =
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

// ── Parâmetros das peças técnicas (TRT/ART, equipamento GNSS, desmembramento) ───────────────────────────────

const CHAVE_EQUIPAMENTO = 'gerencigeo_cartorio_equipamento_gnss';
export const EQUIPAMENTO_PADRAO = 'Receptor GNSS Hi-Target V30 / RTK de Dupla Frequência (L1/L2)';

export const lerEquipamentoLembrado = (): string => {
  try { return localStorage.getItem(CHAVE_EQUIPAMENTO) || EQUIPAMENTO_PADRAO; } catch { return EQUIPAMENTO_PADRAO; }
};
export const lembrarEquipamento = (valor: string) => {
  try { localStorage.setItem(CHAVE_EQUIPAMENTO, valor); } catch { /* storage indisponível */ }
};

export interface ParametrosPecaCfg {
  titulo: string;
  descricao?: string;
  /** Presente = pede/mostra TRT e data (valores atuais pré-preenchidos). */
  trt?: { numero: string; data: string };
  equipamento?: boolean;
  desmembramento?: boolean;
  textoConfirmar?: string;
}
export interface ParametrosPeca {
  numero_trt?: string;
  data_trt?: string;
  equipamento?: string;
  qtd_parcelas?: number;
  codigo_cns?: string;
}

const hojeIso = () => {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

/** UM modal para todos os parâmetros das peças, com validação (substitui os prompt() encadeados). */
export function solicitarParametrosPeca(cfg: ParametrosPecaCfg): Promise<ParametrosPeca | null> {
  const campos: string[] = [];
  if (cfg.trt) {
    campos.push(`
      <div>
        <label class="${CLS_LABEL}" for="par-trt">Número do TRT/ART *</label>
        <input id="par-trt" name="numero_trt" type="text" maxlength="60" autocomplete="off" required data-foco-inicial
               class="${CLS_INPUT}" value="${escapeHtml(cfg.trt.numero)}" placeholder="Ex.: BR20250000000" />
      </div>
      <div>
        <label class="${CLS_LABEL}" for="par-data-trt">Data de quitação do TRT/ART *</label>
        <input id="par-data-trt" name="data_trt" type="date" required class="${CLS_INPUT}" style="color-scheme: dark;"
               value="${escapeHtml(cfg.trt.data || hojeIso())}" />
      </div>`);
  }
  if (cfg.equipamento) {
    campos.push(`
      <div>
        <label class="${CLS_LABEL}" for="par-equip">Equipamento GNSS utilizado *</label>
        <input id="par-equip" name="equipamento" type="text" maxlength="200" required class="${CLS_INPUT}"
               ${cfg.trt ? '' : 'data-foco-inicial'} value="${escapeHtml(lerEquipamentoLembrado())}" />
        <p class="text-[11px] text-white/60 mt-1">O último equipamento informado fica lembrado para as próximas peças.</p>
      </div>`);
  }
  if (cfg.desmembramento) {
    campos.push(`
      <div>
        <label class="${CLS_LABEL}" for="par-cns">Código CNS do Cartório de Registro de Imóveis (opcional)</label>
        <input id="par-cns" name="codigo_cns" type="text" inputmode="numeric" maxlength="12" autocomplete="off" data-foco-inicial
               class="${CLS_INPUT}" placeholder="Somente números" />
      </div>
      <div>
        <label class="${CLS_LABEL}" for="par-parcelas">Quantidade de novas parcelas *</label>
        <input id="par-parcelas" name="qtd_parcelas" type="number" min="2" max="20" step="1" required class="${CLS_INPUT}" value="3" />
        <p class="text-[11px] text-white/60 mt-1">Número inteiro de 2 a 20.</p>
      </div>`);
  }

  return abrirModalFormulario<ParametrosPeca>({
    titulo: cfg.titulo,
    descricao: cfg.descricao,
    corpoHtml: campos.join(''),
    textoConfirmar: cfg.textoConfirmar || 'Emitir peça',
    ler: (form) => {
      const v = (nome: string) => ((form.elements.namedItem(nome) as HTMLInputElement | null)?.value || '').trim();
      const saida: ParametrosPeca = {};
      if (cfg.trt) {
        const trt = v('numero_trt');
        if (!trt) return { erro: 'Informe o número do TRT/ART.', campo: 'numero_trt' };
        const data = v('data_trt');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(Date.parse(data))) {
          return { erro: 'Informe uma data de quitação válida.', campo: 'data_trt' };
        }
        saida.numero_trt = trt;
        saida.data_trt = data;
      }
      if (cfg.equipamento) {
        const equip = v('equipamento');
        if (!equip) return { erro: 'Informe o equipamento GNSS utilizado.', campo: 'equipamento' };
        saida.equipamento = equip;
      }
      if (cfg.desmembramento) {
        const cns = v('codigo_cns');
        if (cns && !/^\d+$/.test(cns)) return { erro: 'O código CNS deve conter apenas dígitos.', campo: 'codigo_cns' };
        const qtdTxt = v('qtd_parcelas');
        const qtd = Number(qtdTxt);
        if (!/^\d+$/.test(qtdTxt) || qtd < 2 || qtd > 20) {
          return { erro: 'A quantidade de parcelas deve ser um número inteiro de 2 a 20.', campo: 'qtd_parcelas' };
        }
        saida.codigo_cns = cns;
        saida.qtd_parcelas = qtd;
      }
      return { valor: saida };
    },
  });
}

// ── Averbação de casamento ──────────────────────────────────────────────────────────────────────────────

export interface Requerente { id: number; nome: string }
export interface DadosAverbacao {
  cliente_id?: number;
  data_celebracao?: string;
  regime_bens?: string;
  cartorio_civil?: string;
  livro?: string;
  folha?: string;
  termo?: string;
  matricula_certidao?: string;
  pacto_antenupcial?: string;
  nome_conjuge?: string;
}

const isoParaBr = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

export function solicitarDadosAverbacao(requerentes: Requerente[]): Promise<DadosAverbacao | null> {
  const campoTxt = (nome: string, rotulo: string, ph = '', max = 120) => `
    <div>
      <label class="${CLS_LABEL}" for="av-${nome}">${rotulo}</label>
      <input id="av-${nome}" name="${nome}" type="text" maxlength="${max}" autocomplete="off" class="${CLS_INPUT}" placeholder="${escapeHtml(ph)}" />
    </div>`;

  const seletorRequerente = requerentes.length > 0
    ? `<div>
         <label class="${CLS_LABEL}" for="av-cliente">Requerente (proprietário que se casou) *</label>
         <select id="av-cliente" name="cliente_id" required data-foco-inicial class="${CLS_INPUT}">
           ${requerentes.length > 1 ? '<option value="">Selecione o requerente…</option>' : ''}
           ${requerentes.map(r => `<option value="${r.id}" class="bg-[#0c1510]">${escapeHtml(r.nome)}</option>`).join('')}
         </select>
       </div>`
    : `<p class="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2">
         Não há proprietários vinculados a esta propriedade; o sistema escolherá o requerente automaticamente.
       </p>`;

  return abrirModalFormulario<DadosAverbacao>({
    titulo: 'Requerimento de averbação de casamento',
    descricao: 'Informe os dados do casamento. Campos em branco usam o que estiver cadastrado ou saem como lacuna a preencher na peça.',
    larguraClasse: 'max-w-xl',
    textoConfirmar: 'Emitir requerimento',
    corpoHtml: `
      ${seletorRequerente}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="${CLS_LABEL}" for="av-data">Data da celebração</label>
          <input id="av-data" name="data_celebracao" type="date" class="${CLS_INPUT}" style="color-scheme: dark;" />
        </div>
        <div>
          <label class="${CLS_LABEL}" for="av-regime">Regime de bens</label>
          <select id="av-regime" name="regime_bens" class="${CLS_INPUT}">
            <option value="" class="bg-[#0c1510]">Conforme cadastro</option>
            <option value="comunhao_parcial" class="bg-[#0c1510]">Comunhão parcial</option>
            <option value="comunhao_universal" class="bg-[#0c1510]">Comunhão universal</option>
            <option value="separacao_total" class="bg-[#0c1510]">Separação total</option>
            <option value="participacao_final" class="bg-[#0c1510]">Participação final nos aquestos</option>
          </select>
        </div>
      </div>
      ${campoTxt('nome_conjuge', 'Nome do cônjuge', 'Conforme cadastro, se em branco', 160)}
      ${campoTxt('cartorio_civil', 'Cartório de Registro Civil', 'Ex.: Registro Civil das Pessoas Naturais de Umuarama/PR', 200)}
      <div class="grid grid-cols-3 gap-3">
        ${campoTxt('livro', 'Livro', '', 20)}
        ${campoTxt('folha', 'Folha', '', 20)}
        ${campoTxt('termo', 'Termo', '', 20)}
      </div>
      ${campoTxt('matricula_certidao', 'Matrícula da certidão de casamento', 'Substitui livro/folha/termo quando informada', 60)}
      ${campoTxt('pacto_antenupcial', 'Pacto antenupcial', 'Deixe em branco se não houve', 200)}`,
    ler: (form) => {
      const v = (nome: string) => ((form.elements.namedItem(nome) as HTMLInputElement | null)?.value || '').trim();
      const saida: DadosAverbacao = {};
      if (requerentes.length > 0) {
        const cli = Number(v('cliente_id'));
        if (!cli) return { erro: 'Selecione o requerente.', campo: 'cliente_id' };
        saida.cliente_id = cli;
      }
      const data = v('data_celebracao');
      if (data) saida.data_celebracao = isoParaBr(data);
      for (const campo of ['regime_bens', 'cartorio_civil', 'livro', 'folha', 'termo', 'matricula_certidao', 'pacto_antenupcial', 'nome_conjuge'] as const) {
        const valor = v(campo);
        if (valor) saida[campo] = valor;
      }
      return { valor: saida };
    },
  });
}
