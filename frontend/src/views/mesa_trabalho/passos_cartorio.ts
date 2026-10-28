/**
 * Navegação em 4 passos da etapa Peças de Cartório (Homologação ➔ Divisas ➔ Confrontantes ➔ Peças).
 * Cada parte da tela informa os números que conhece via `atualizar`; daqui saem os rótulos de status
 * dos passos, a prontidão de cada peça técnica e o passo em que o painel abre.
 */

export type PassoCartorio = 'homologacao' | 'divisas' | 'confrontantes' | 'pecas';

export interface StatusCartorio {
  planilhas?: number;
  pontosPlanilhas?: number;
  vertices?: number;
  verticesSemConfrontante?: number;
  alteracoesSigef?: number;
  anuenciasExigidas?: number;
  anuenciasAssinadas?: number;
  confrontantesSemCpf?: number;
  propriedadeVinculada?: boolean;
  profissionalVinculado?: boolean;
}

export interface PassosCartorio {
  irPara(passo: PassoCartorio): void;
  atualizar(parcial: StatusCartorio): void;
  /** Ao entrar na etapa ou trocar de matrícula: abre no primeiro passo com pendência assim que os dados chegarem */
  reiniciarEscolha(): void;
}

type Estado = 'ok' | 'aviso' | 'neutro';

const PASSOS: PassoCartorio[] = ['homologacao', 'divisas', 'confrontantes', 'pecas'];
const CHAVE_PASSO = 'gerencigeo_cartorio_passo';
const CLASSE_BADGE: Record<Estado, string> = { ok: 'geo-badge--ok', aviso: 'geo-badge--aviso', neutro: '' };

interface PecaTecnica { botao: string; precisaVertices?: boolean; opcional?: boolean }
const PECAS: PecaTecnica[] = [
  { botao: 'btn-emitir-req-cartorio', precisaVertices: true },
  { botao: 'btn-emitir-laudo-tec', precisaVertices: true },
  { botao: 'btn-emitir-decl-resp' },
  { botao: 'btn-emitir-termo-sigef' },
  { botao: 'btn-emitir-manual-proprietario' },
  { botao: 'btn-emitir-anuencia-desmembramento', opcional: true },
  { botao: 'btn-emitir-averbacao-casamento', opcional: true },
];

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const lerPassoSalvo = (): PassoCartorio => {
  try {
    const salvo = localStorage.getItem(CHAVE_PASSO);
    if (salvo && (PASSOS as string[]).includes(salvo)) return salvo as PassoCartorio;
  } catch { /* storage indisponível */ }
  return 'confrontantes';
};

export function criarPassosCartorio(): PassosCartorio {
  const status: StatusCartorio = {};
  let escolhaAutomatica = true;

  const aba = (p: PassoCartorio) => document.getElementById(`passo-tab-${p}`);

  // Badge de prontidão dentro de cada botão de peça (antes do ícone de download)
  PECAS.forEach(p => {
    const btn = document.getElementById(p.botao);
    if (!btn || btn.querySelector('.doc-row-status')) return;
    const badge = document.createElement('span');
    badge.className = 'doc-row-status geo-badge';
    btn.insertBefore(badge, btn.querySelector('.doc-row-go'));
  });

  const mostrar = (passo: PassoCartorio) => {
    PASSOS.forEach(p => {
      const ativo = p === passo;
      aba(p)?.setAttribute('aria-selected', String(ativo));
      aba(p)?.setAttribute('tabindex', ativo ? '0' : '-1');
      const corpo = document.getElementById(`passo-${p}`);
      if (corpo) corpo.hidden = !ativo;
    });
  };

  const avaliarPecas = () => {
    const faltaBase = status.propriedadeVinculada === false
      ? 'sem propriedade'
      : status.profissionalVinculado === false ? 'sem profissional' : '';
    let prontas = 0;
    let total = 0;
    PECAS.forEach(p => {
      const badge = document.querySelector<HTMLElement>(`#${p.botao} .doc-row-status`);
      let texto: string;
      let estado: Estado;
      if (p.opcional) {
        texto = 'se aplicável';
        estado = 'neutro';
      } else {
        total++;
        const falta = faltaBase || (p.precisaVertices && status.vertices === 0 ? 'sem vértices' : '');
        if (falta) { texto = falta; estado = 'aviso'; } else { texto = 'pronta'; estado = 'ok'; prontas++; }
      }
      if (badge) {
        badge.textContent = texto;
        badge.className = `doc-row-status geo-badge ${CLASSE_BADGE[estado]}`;
      }
    });

    const aviso = document.getElementById('aviso-pecas');
    if (aviso) {
      const faltam = [
        status.propriedadeVinculada === false ? 'a propriedade' : '',
        status.profissionalVinculado === false ? 'o profissional' : '',
      ].filter(Boolean).join(' e ');
      aviso.textContent = faltam ? `Vincule ${faltam} ao levantamento: sem isso as peças saem com campos em branco.` : '';
      aviso.classList.toggle('hidden', !faltam);
    }
    const resumo = document.getElementById('resumo-pecas');
    if (resumo) resumo.textContent = `${prontas} de ${total} prontas`;
    return { prontas, total };
  };

  const avaliarPassos = (): Record<PassoCartorio, [string, Estado]> => {
    const s = status;
    const homologacao: [string, Estado] = s.planilhas === undefined
      ? ['—', 'neutro']
      : s.planilhas === 0
        ? ['importe a planilha', 'aviso']
        : [`${plural(s.planilhas, 'planilha', 'planilhas')} · ${s.pontosPlanilhas ?? 0} pontos`, 'ok'];

    let divisas: [string, Estado] = ['—', 'neutro'];
    if (s.vertices === 0) divisas = ['sem vértices homologados', 'neutro'];
    else if (s.vertices !== undefined) {
      const sem = s.verticesSemConfrontante ?? 0;
      const alt = s.alteracoesSigef ?? 0;
      const partes = [sem > 0 ? `${plural(sem, 'divisa', 'divisas')} sem confrontante` : 'confrontantes completos'];
      if (alt > 0) partes.push(`${alt} p/ SIGEF`);
      divisas = [partes.join(' · '), sem > 0 || alt > 0 ? 'aviso' : 'ok'];
    }

    let confrontantes: [string, Estado] = ['—', 'neutro'];
    if (s.anuenciasExigidas === 0) confrontantes = ['nenhuma anuência exigida', 'neutro'];
    else if (s.anuenciasExigidas !== undefined) {
      const assinadas = s.anuenciasAssinadas ?? 0;
      const semCpf = s.confrontantesSemCpf ?? 0;
      const partes = [`${assinadas} de ${s.anuenciasExigidas} assinadas`];
      if (semCpf > 0) partes.push(`${semCpf} sem CPF`);
      confrontantes = [partes.join(' · '), assinadas >= s.anuenciasExigidas && semCpf === 0 ? 'ok' : 'aviso'];
    }

    const { prontas, total } = avaliarPecas();
    const pecas: [string, Estado] = [`${prontas} de ${total} prontas`, prontas === total ? 'ok' : 'aviso'];

    return { homologacao, divisas, confrontantes, pecas };
  };

  const render = () => {
    const avaliacao = avaliarPassos();
    PASSOS.forEach(p => {
      const [texto, estado] = avaliacao[p];
      const el = document.getElementById(`passo-status-${p}`);
      if (el) { el.textContent = texto; el.title = texto; }
      aba(p)?.setAttribute('data-estado', estado);
    });

    const conhecidos = status.planilhas !== undefined && status.vertices !== undefined && status.anuenciasExigidas !== undefined;
    const pendencias = PASSOS.filter(p => avaliacao[p][1] === 'aviso').length;
    const badge = document.getElementById('badge-pendencias-cartorio');
    if (badge) {
      badge.classList.toggle('hidden', !conhecidos);
      badge.textContent = pendencias ? `${plural(pendencias, 'passo', 'passos')} com pendência` : 'pronto para emitir';
      badge.className = `geo-badge ${pendencias ? 'geo-badge--aviso' : 'geo-badge--ok'}${conhecidos ? '' : ' hidden'}`;
    }

    if (escolhaAutomatica && conhecidos) {
      escolhaAutomatica = false;
      mostrar(PASSOS.find(p => p !== 'pecas' && avaliacao[p][1] === 'aviso') || 'pecas');
    }
  };

  const irPara = (passo: PassoCartorio) => {
    escolhaAutomatica = false;
    mostrar(passo);
    try { localStorage.setItem(CHAVE_PASSO, passo); } catch { /* ignora */ }
  };

  const barra = document.querySelector<HTMLElement>('.cartorio-passos');
  if (barra && barra.dataset.eventosVinculados !== '1') {
    barra.dataset.eventosVinculados = '1';
    barra.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('.cartorio-passo');
      if (btn?.dataset.passo) irPara(btn.dataset.passo as PassoCartorio);
    });
    // Setas entre as abas (padrão WAI-ARIA de tablist)
    barra.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      const atual = PASSOS.findIndex(p => aba(p)?.getAttribute('aria-selected') === 'true');
      let i = atual;
      if (e.key === 'ArrowLeft') i = (atual + PASSOS.length - 1) % PASSOS.length;
      else if (e.key === 'ArrowRight') i = (atual + 1) % PASSOS.length;
      else if (e.key === 'Home') i = 0;
      else i = PASSOS.length - 1;
      e.preventDefault();
      irPara(PASSOS[i]);
      aba(PASSOS[i])?.focus();
    });
  }

  mostrar(lerPassoSalvo());
  render();

  return {
    irPara,
    atualizar(parcial) {
      Object.assign(status, parcial);
      render();
    },
    reiniciarEscolha() {
      escolhaAutomatica = true;
      delete status.vertices;
      delete status.verticesSemConfrontante;
      delete status.anuenciasExigidas;
      delete status.anuenciasAssinadas;
      delete status.confrontantesSemCpf;
      render();
    },
  };
}
