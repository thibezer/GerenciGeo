import type { CategoriaPropriedades, SeletorTipoItem, OpcaoPropriedade } from './tipos';
import {
  METODOS_SIGEF,
  LIMITES_SIGEF
} from '../painel_propriedades_helpers';
import type { Ponto, Confrontante } from '../painel_propriedades_helpers';

export function gerarPropriedadesSegmento(segmento: any, ctx: any): {
  categorias: CategoriaPropriedades[];
  tipos: SeletorTipoItem[];
  tipoSelecionadoId: string;
} {
  const pontosList: Ponto[] = ctx.pontosList ?? [];
  const confrontantesList: Confrontante[] = ctx.confrontantesList ?? [];
  const matriculasList: any[] = ctx.matriculasList ?? [];

  const isArquivado = ctx.currentLevantamento?.status === 'ARQUIVADO';
  const isDisabled = isArquivado;

  // Localiza vértices de início e fim
  let pIni = pontosList.find((p: Ponto) => String(p.id) === String(segmento.ponto_inicio_id));
  if (!pIni && ctx.bancoPontosList) {
    pIni = ctx.bancoPontosList.find((p: any) => String(p.id) === String(segmento.ponto_inicio_id));
  }
  let pFim = pontosList.find((p: Ponto) => String(p.id) === String(segmento.ponto_fim_id));
  if (!pFim && ctx.bancoPontosList) {
    pFim = ctx.bancoPontosList.find((p: any) => String(p.id) === String(segmento.ponto_fim_id));
  }

  const nomeIni = pIni?.nome_vertice || pIni?.ponto_nome || `VRT-${segmento.ponto_inicio_id}`;
  const nomeFim = pFim?.nome_vertice || pFim?.ponto_nome || `VRT-${segmento.ponto_fim_id}`;
  const rotuloTrecho = `${nomeIni} ➔ ${nomeFim}`;

  // Métricas geodésicas (distância, azimute e desnível)
  const metricas = calcularMetricasSegmento(pIni, pFim);

  // Opções de Matrículas
  const opcoesMatricula: OpcaoPropriedade[] = [
    { id: '', rotulo: 'Nenhuma (Sem Matrícula)' },
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

  // Opções de Confrontantes
  const opcoesConfrontante: OpcaoPropriedade[] = [
    { id: '', rotulo: 'Nenhum / Não Informado' },
    ...confrontantesList.map((c: Confrontante) => ({
      id: String(c.id),
      rotulo: c.nome ? `${c.nome} ${c.matricula_imovel ? `(${c.matricula_imovel})` : ''}` : `Confrontante #${c.id}`
    }))
  ];

  // Confrontante vinculado
  let confMatricula = '';
  let confCartorio = '';
  if (segmento.confrontante_id) {
    const cObj = confrontantesList.find((c: Confrontante) => String(c.id) === String(segmento.confrontante_id));
    if (cObj) {
      confMatricula = cObj.matricula_imovel || '';
      confCartorio = cObj.cns_confrontante || '';
    }
  }

  const tipos: SeletorTipoItem[] = [
    {
      id: 'segmento',
      rotulo: 'Divisa / Segmento',
      subtipo: 'Vetor Geodésico'
    }
  ];

  const categorias: CategoriaPropriedades[] = [
    {
      id: 'identificacao',
      titulo: 'Identificação da Divisa',
      aberto: true,
      propriedades: [
        {
          id: 'trecho_rotulo',
          rotulo: 'Trecho / Divisa',
          tipo: 'readonly',
          valor: rotuloTrecho
        },
        {
          id: 'ponto_inicio_nome',
          rotulo: 'Vértice Inicial',
          tipo: 'readonly',
          valor: nomeIni
        },
        {
          id: 'ponto_fim_nome',
          rotulo: 'Vértice Final',
          tipo: 'readonly',
          valor: nomeFim
        },
        {
          id: 'matricula_id',
          rotulo: 'Matrícula',
          tipo: isDisabled ? 'readonly' : 'selecao',
          valor: segmento.matricula_id != null ? String(segmento.matricula_id) : '',
          opcoes: opcoesMatricula,
          somenteLeitura: isDisabled
        }
      ]
    },
    {
      id: 'geometria',
      titulo: 'Geometria e Métricas',
      aberto: true,
      propriedades: [
        {
          id: 'extensao_linear',
          rotulo: 'Extensão Linear',
          tipo: 'readonly',
          valor: metricas.extensaoFormatada
        },
        {
          id: 'azimute_plano',
          rotulo: 'Azimute',
          tipo: 'readonly',
          valor: metricas.azimuteFormatado
        },
        {
          id: 'desnivel',
          rotulo: 'Desnível (ΔZ)',
          tipo: 'readonly',
          valor: metricas.desnivelFormatado
        }
      ]
    },
    {
      id: 'norma_sigef',
      titulo: 'Norma Técnica INCRA / SIGEF',
      aberto: true,
      propriedades: [
        {
          id: 'tipo_limite_sigef',
          rotulo: 'Tipo de Limite',
          tipo: isDisabled ? 'readonly' : 'selecao',
          valor: segmento.tipo_limite_sigef || segmento.tipo_limite || '',
          opcoes: opcoesLimite,
          somenteLeitura: isDisabled
        },
        {
          id: 'metodo_posicionamento_sigef',
          rotulo: 'Método Posic.',
          tipo: isDisabled ? 'readonly' : 'selecao',
          valor: segmento.metodo_posicionamento_sigef || segmento.metodo_posicionamento || '',
          opcoes: opcoesMetodo,
          somenteLeitura: isDisabled
        }
      ]
    },
    {
      id: 'confrontacao',
      titulo: 'Confrontação e Cartório',
      aberto: true,
      propriedades: [
        {
          id: 'confrontante_id',
          rotulo: 'Confrontante',
          tipo: isDisabled ? 'readonly' : 'selecao',
          valor: segmento.confrontante_id != null ? String(segmento.confrontante_id) : '',
          opcoes: opcoesConfrontante,
          somenteLeitura: isDisabled
        },
        {
          id: 'confrontante_matricula_exibicao',
          rotulo: 'Matrícula Confront.',
          tipo: 'readonly',
          valor: confMatricula || '-'
        },
        {
          id: 'confrontante_cns_exibicao',
          rotulo: 'CNS / Cartório',
          tipo: 'readonly',
          valor: confCartorio || '-'
        },
        {
          id: 'anuencia_assinada',
          rotulo: 'Anuência Assinada',
          tipo: isDisabled ? 'readonly' : 'booleano',
          valor: Boolean(segmento.anuencia_assinada === 1 || segmento.anuencia_assinada === true),
          somenteLeitura: isDisabled
        }
      ]
    }
  ];

  return {
    categorias,
    tipos,
    tipoSelecionadoId: 'segmento'
  };
}

function calcularMetricasSegmento(pIni?: any, pFim?: any): {
  extensaoFormatada: string;
  azimuteFormatado: string;
  desnivelFormatado: string;
} {
  if (!pIni || !pFim) {
    return {
      extensaoFormatada: '-',
      azimuteFormatado: '-',
      desnivelFormatado: '-'
    };
  }

  const e1 = pIni.e_corrigido ?? pIni.e_original ?? pIni.este;
  const n1 = pIni.n_corrigido ?? pIni.n_original ?? pIni.norte;
  const e2 = pFim.e_corrigido ?? pFim.e_original ?? pFim.este;
  const n2 = pFim.n_corrigido ?? pFim.n_original ?? pFim.norte;

  let distM: number | null = null;
  let azimuteGms = '-';

  if (e1 != null && n1 != null && e2 != null && n2 != null) {
    const de = Number(e2) - Number(e1);
    const dn = Number(n2) - Number(n1);
    distM = Math.hypot(de, dn);

    let rad = Math.atan2(de, dn);
    if (rad < 0) rad += 2 * Math.PI;
    const degTotal = (rad * 180) / Math.PI;

    const g = Math.floor(degTotal);
    const mTotal = (degTotal - g) * 60;
    const m = Math.floor(mTotal);
    const s = (mTotal - m) * 60;

    azimuteGms = `${String(g).padStart(2, '0')}° ${String(m).padStart(2, '0')}' ${s.toFixed(1).padStart(4, '0')}"`;
  } else if (pIni.lat != null && pIni.lon != null && pFim.lat != null && pFim.lon != null) {
    const R = 6371000;
    const phi1 = (Number(pIni.lat) * Math.PI) / 180;
    const phi2 = (Number(pFim.lat) * Math.PI) / 180;
    const dPhi = ((Number(pFim.lat) - Number(pIni.lat)) * Math.PI) / 180;
    const dLambda = ((Number(pFim.lon) - Number(pIni.lon)) * Math.PI) / 180;

    const a =
      Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    distM = R * c;

    const y = Math.sin(dLambda) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
    let azRad = Math.atan2(y, x);
    if (azRad < 0) azRad += 2 * Math.PI;
    const degTotal = (azRad * 180) / Math.PI;
    const g = Math.floor(degTotal);
    const mTotal = (degTotal - g) * 60;
    const m = Math.floor(mTotal);
    const s = (mTotal - m) * 60;
    azimuteGms = `${String(g).padStart(2, '0')}° ${String(m).padStart(2, '0')}' ${s.toFixed(1).padStart(4, '0')}"`;
  }

  const z1 = pIni.alt_corrigido ?? pIni.alt ?? pIni.alt_original ?? pIni.altitude;
  const z2 = pFim.alt_corrigido ?? pFim.alt ?? pFim.alt_original ?? pFim.altitude;
  let desnivelFormatado = '-';
  if (z1 != null && z2 != null) {
    const dz = Number(z2) - Number(z1);
    const sinal = dz >= 0 ? '+' : '';
    desnivelFormatado = `${sinal}${dz.toFixed(3)} m`;
  }

  return {
    extensaoFormatada: distM != null ? `${distM.toFixed(2)} m` : '-',
    azimuteFormatado: azimuteGms,
    desnivelFormatado
  };
}
