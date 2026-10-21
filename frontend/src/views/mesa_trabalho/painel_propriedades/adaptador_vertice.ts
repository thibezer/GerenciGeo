import type { CategoriaPropriedades, SeletorTipoItem, OpcaoPropriedade } from './tipos';
import {
  METODOS_SIGEF,
  LIMITES_SIGEF,
  parseNumberOrNull,
  parseNumberDefault
} from '../painel_propriedades_helpers';
import type { Ponto, Segmento, Confrontante } from '../painel_propriedades_helpers';
import { construirCategoriasVertice } from './adaptador_vertice_categorias';

export function gerarPropriedadesVertice(p: Ponto, ctx: any): {
  categorias: CategoriaPropriedades[];
  tipos: SeletorTipoItem[];
  tipoSelecionadoId: string;
} {
  const pontosList: Ponto[] = ctx.pontosList ?? [];
  const segmentosList: Segmento[] = ctx.segmentosList ?? [];
  const confrontantesList: Confrontante[] = ctx.confrontantesList ?? [];
  const matriculasList: any[] = ctx.matriculasList ?? [];

  const isHomologado = Boolean(p.camada_ciclo_vida === 'HOMOLOGADO' || p.origem_homologada === 1 || (p as any).is_homologado_sigef);
  const isPontoVizinho = Boolean(p.ponto_vizinho === 1);
  const isArquivado = ctx.currentLevantamento?.status === 'ARQUIVADO';
  const isDisabled = isPontoVizinho || isArquivado || isHomologado;
  const isCorrigido = p.status_correcao === 'CORRIGIDO' || p.status_ponto === 'CORRIGIDO' || isHomologado;

  // Resolução de Coordenadas
  const eVal = isCorrigido ? parseNumberOrNull(p.e_corrigido ?? p.e_original) : parseNumberOrNull(p.e_original ?? p.e_corrigido);
  const nVal = isCorrigido ? parseNumberOrNull(p.n_corrigido ?? p.n_original) : parseNumberOrNull(p.n_original ?? p.n_corrigido);
  const hVal = isCorrigido ? parseNumberOrNull(p.alt_corrigido ?? (p.alt ?? p.alt_original)) : parseNumberOrNull(p.alt ?? p.alt_original);

  const latVal = isCorrigido ? parseNumberOrNull(p.lat_corrigido ?? p.lat) : parseNumberOrNull(p.lat);
  const lonVal = isCorrigido ? parseNumberOrNull(p.lon_corrigido ?? p.lon) : parseNumberOrNull(p.lon);

  // Sigmas e Resultante
  const sigE = parseNumberDefault(p.sigma_e, 0);
  const sigN = parseNumberDefault(p.sigma_n, 0);
  const temSigmas = p.sigma_e != null && p.sigma_n != null;
  const resultante = temSigmas ? `${(Math.sqrt(sigE * sigE + sigN * sigN) * 1000).toFixed(1)} mm` : '-';

  // Resolução de Confrontante
  const seg = segmentosList.find((s: Segmento) => String(s.ponto_inicio_id) === String(p.id));
  const confrontanteId = p.confrontante_id || (seg && seg.confrontante_id);
  let confNome = '';
  let confMatricula = '';
  let confCartorio = '';
  if (confrontanteId) {
    const cObj = confrontantesList.find((c: Confrontante) => String(c.id) === String(confrontanteId));
    if (cObj) {
      confNome = cObj.nome || '';
      confMatricula = cObj.matricula_imovel || '';
      confCartorio = cObj.cns_confrontante || '';
    }
  }
  if (!confNome) {
    confNome = (p as any).confrontante_descritivo || (p as any).confrontante_nome || '';
    confMatricula = (p as any).matricula_confrontante || (p as any).confrontante_matricula || '';
    confCartorio = (p as any).cns_confrontante || (p as any).confrontante_cartorio || '';
  }

  // Base de apoio
  let nomeBaseApoio = 'Nenhuma';
  if (p.ponto_base_id) {
    const basePt = pontosList.find((pt: Ponto) => String(pt.id) === String(p.ponto_base_id));
    if (basePt) nomeBaseApoio = basePt.nome_vertice || `ID ${p.ponto_base_id}`;
  }

  // Identificação da Camada de Origem
  let origemTexto = 'Campo (Bruto)';
  const camada = p.camada_ciclo_vida || (p.matricula_id ? 'PERIMETRO' : 'CAMPO');
  if (isPontoVizinho || camada === 'VIZINHO' || p.ponto_vizinho === 1) {
    origemTexto = 'Confrontante / Vizinho';
  } else if (camada === 'HOMOLOGADO' || (p as any).origem_homologada === 1 || isHomologado) {
    origemTexto = 'Homologado SIGEF';
  } else if (camada === 'PERIMETRO') {
    origemTexto = 'Perímetro Ativo';
  } else if (p.confrontante_id) {
    origemTexto = 'Vizinho Integrado';
  }

  // Opções de Matrículas
  const opcoesMatricula: OpcaoPropriedade[] = [
    { id: '', rotulo: 'Nenhuma (Ponto Solto)' },
    ...matriculasList.map((m: any) => ({
      id: String(m.id),
      rotulo: m.numero_matricula ? `Matrícula ${m.numero_matricula}` : `Matrícula #${m.id}`
    }))
  ];

  // Opções de Métodos SIGEF
  const opcoesMetodo: OpcaoPropriedade[] = [
    { id: '', rotulo: 'Não Especificado' },
    ...METODOS_SIGEF.map(m => ({
      id: m.codigo,
      rotulo: `${m.codigo} - ${m.nome}`
    }))
  ];

  // Opções de Limites SIGEF
  const opcoesLimite: OpcaoPropriedade[] = [
    { id: '', rotulo: 'Não Especificado' },
    ...LIMITES_SIGEF.map(l => ({
      id: l.codigo,
      rotulo: `${l.codigo} - ${l.nome}`
    }))
  ];

  const fusoAtual = localStorage.getItem(`utm_zone_${ctx.currentLevId}`) || '22S';
  const tipoLimiteCalculado = p.tipo_limite_sigef || p.tipo_limite || (seg ? seg.tipo_limite_sigef : '') || '';

  const categorias = construirCategoriasVertice({
    p,
    isDisabled,
    origemTexto,
    opcoesMatricula,
    opcoesMetodo,
    opcoesLimite,
    fusoAtual,
    eVal,
    nVal,
    hVal,
    latVal,
    lonVal,
    resultante,
    nomeBaseApoio,
    confNome,
    confMatricula,
    confCartorio,
    tipoLimiteCalculado
  });

  // Seletor de Tipo Superior (M / V / P / O)
  const tipos: SeletorTipoItem[] = [
    { id: 'M', rotulo: 'Marco [M]', subtipo: 'Limite Fixo Artificial' },
    { id: 'P', rotulo: 'Ponto [P]', subtipo: 'Limite Natural ou Inacessível' },
    { id: 'V', rotulo: 'Vértice Virtual [V]', subtipo: 'Cálculo de Projeção' },
    { id: 'O', rotulo: 'Outro [O]', subtipo: 'Não Normatizado' }
  ];

  const tipoAtual = (p.tipo_ponto || p.tipo || 'M').toUpperCase();
  const tipoSelecionadoId = tipos.some(t => t.id === tipoAtual) ? tipoAtual : 'M';

  return {
    categorias,
    tipos,
    tipoSelecionadoId
  };
}
