import { escapeHtml } from '../../utils';
import {
  abrirModalFormulario,
  CLS_INPUT,
  CLS_LABEL
} from './dialogos_base';

export * from './dialogos_base';

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
