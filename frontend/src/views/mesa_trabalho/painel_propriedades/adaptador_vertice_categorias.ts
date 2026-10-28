import type { CategoriaPropriedades, OpcaoPropriedade } from './tipos';
import type { Ponto } from '../painel_propriedades_helpers';

export interface ParametrosCategoriasVertice {
  p: Ponto;
  isDisabled: boolean;
  origemTexto: string;
  tipoSelecionadoId: string;
  opcoesTipo: OpcaoPropriedade[];
  opcoesMatricula: OpcaoPropriedade[];
  opcoesMetodo: OpcaoPropriedade[];
  opcoesLimite: OpcaoPropriedade[];
  fusoAtual: string;
  eVal: number | null;
  nVal: number | null;
  hVal: number | null;
  latVal: number | null;
  lonVal: number | null;
  resultante: string;
  nomeBaseApoio: string;
  confNome: string;
  confMatricula: string;
  confCartorio: string;
  tipoLimiteCalculado: string;
}

export function construirCategoriasVertice(params: ParametrosCategoriasVertice): CategoriaPropriedades[] {
  const {
    p,
    isDisabled,
    origemTexto,
    tipoSelecionadoId,
    opcoesTipo,
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
  } = params;

  return [
    {
      id: 'identificacao',
      titulo: 'Identificação do Vértice',
      aberto: true,
      propriedades: [
        {
          id: 'nome_vertice',
          rotulo: 'Nome Vértice',
          tipo: isDisabled ? 'readonly' : 'texto',
          valor: p.nome_vertice || p.ponto_nome || '',
          placeholder: 'Ex: M-01',
          somenteLeitura: isDisabled
        },
        {
          id: 'tipo_ponto',
          rotulo: 'Tipo do Ponto',
          tipo: isDisabled ? 'readonly' : 'selecao',
          valor: isDisabled
            ? String(opcoesTipo.find(o => String(o.id) === tipoSelecionadoId)?.rotulo ?? (p.tipo_ponto || '-'))
            : tipoSelecionadoId,
          opcoes: opcoesTipo,
          somenteLeitura: isDisabled,
          dica: 'M: marco de divisa · P: ponto · V: vértice virtual · B: base de campo (fica fora do perímetro)'
        },
        {
          id: 'codigo_sigef',
          rotulo: 'Código SIGEF',
          tipo: isDisabled ? 'readonly' : 'texto',
          valor: p.codigo_sigef || '',
          placeholder: 'Ex: ABC-M-0001',
          somenteLeitura: isDisabled
        },
        {
          id: 'matricula_id',
          rotulo: 'Matrícula',
          tipo: isDisabled ? 'readonly' : 'selecao',
          valor: p.matricula_id != null ? String(p.matricula_id) : '',
          opcoes: opcoesMatricula,
          somenteLeitura: isDisabled
        },
        {
          id: 'camada_origem',
          rotulo: 'Camada / Origem',
          tipo: 'readonly',
          valor: origemTexto
        },
        ...(isDisabled
          ? []
          : [
              {
                id: 'acao_sugerir_codigo',
                rotulo: 'Automação',
                tipo: 'acao' as const,
                valor: 'Sugerir Código',
                rotuloAcao: 'Sugerir Próximo Código SIGEF'
              }
            ])
      ]
    },
    {
      id: 'coordenadas_utm',
      titulo: `Coordenadas UTM (${fusoAtual})`,
      aberto: true,
      propriedades: [
        {
          id: 'e_corrigido',
          rotulo: 'Este (E)',
          tipo: isDisabled ? 'readonly' : 'numero',
          valor: eVal ?? 0,
          casasDecimais: 3,
          unidade: 'm',
          somenteLeitura: isDisabled
        },
        {
          id: 'n_corrigido',
          rotulo: 'Norte (N)',
          tipo: isDisabled ? 'readonly' : 'numero',
          valor: nVal ?? 0,
          casasDecimais: 3,
          unidade: 'm',
          somenteLeitura: isDisabled
        },
        {
          id: 'alt_corrigido',
          rotulo: 'Altitude (H)',
          tipo: isDisabled ? 'readonly' : 'numero',
          valor: hVal ?? 0,
          casasDecimais: 3,
          unidade: 'm',
          somenteLeitura: isDisabled
        },
        {
          id: 'status_correcao',
          rotulo: 'Status Ponto',
          tipo: 'readonly',
          valor: p.status_correcao || p.status_ponto || 'BRUTO'
        }
      ]
    },
    {
      id: 'coordenadas_geo',
      titulo: 'Coordenadas Geodésicas (SIRGAS 2000)',
      aberto: false,
      propriedades: [
        {
          id: 'lat',
          rotulo: 'Latitude',
          tipo: isDisabled ? 'readonly' : 'numero',
          valor: latVal ?? 0,
          casasDecimais: 9,
          unidade: '°',
          somenteLeitura: isDisabled
        },
        {
          id: 'lon',
          rotulo: 'Longitude',
          tipo: isDisabled ? 'readonly' : 'numero',
          valor: lonVal ?? 0,
          casasDecimais: 9,
          unidade: '°',
          somenteLeitura: isDisabled
        },
        {
          id: 'alt_geo',
          rotulo: 'Altitude Elip. (h)',
          tipo: 'readonly',
          valor: hVal ?? 0,
          casasDecimais: 3,
          unidade: 'm'
        }
      ]
    },
    {
      id: 'precisao_sigmas',
      titulo: 'Precisão e Incertezas',
      aberto: false,
      propriedades: [
        {
          id: 'sigma_e',
          rotulo: 'Sigma E (σE)',
          tipo: isDisabled ? 'readonly' : 'numero',
          valor: p.sigma_e ?? 0.05,
          casasDecimais: 3,
          unidade: 'm',
          somenteLeitura: isDisabled
        },
        {
          id: 'sigma_n',
          rotulo: 'Sigma N (σN)',
          tipo: isDisabled ? 'readonly' : 'numero',
          valor: p.sigma_n ?? 0.05,
          casasDecimais: 3,
          unidade: 'm',
          somenteLeitura: isDisabled
        },
        {
          id: 'sigma_z',
          rotulo: 'Sigma Z (σH)',
          tipo: isDisabled ? 'readonly' : 'numero',
          valor: p.sigma_z ?? p.sigma_alt ?? 0.08,
          casasDecimais: 3,
          unidade: 'm',
          somenteLeitura: isDisabled
        },
        {
          id: 'resultante_mm',
          rotulo: 'Resultante Horiz.',
          tipo: 'readonly',
          valor: resultante
        }
      ]
    },
    {
      id: 'sigef_incra',
      titulo: 'Atributos INCRA / SIGEF',
      aberto: true,
      propriedades: [
        {
          id: 'metodo_posicionamento',
          rotulo: 'Método Pos.',
          tipo: isDisabled ? 'readonly' : 'selecao',
          valor: (p as any).metodo_posicionamento || '',
          opcoes: opcoesMetodo,
          somenteLeitura: isDisabled
        },
        {
          id: 'tipo_limite_sigef',
          rotulo: 'Tipo de Limite',
          tipo: isDisabled ? 'readonly' : 'selecao',
          valor: tipoLimiteCalculado,
          opcoes: opcoesLimite,
          somenteLeitura: isDisabled
        },
        {
          id: 'base_apoio',
          rotulo: 'Base de Apoio',
          tipo: 'readonly',
          valor: nomeBaseApoio
        }
      ]
    },
    {
      id: 'confrontacao',
      titulo: 'Confrontação Territorial',
      aberto: false,
      propriedades: [
        {
          id: 'confrontante_nome',
          rotulo: 'Confrontante',
          tipo: isDisabled ? 'readonly' : 'texto',
          valor: confNome,
          placeholder: 'Nome do proprietário confrontante',
          somenteLeitura: isDisabled
        },
        {
          id: 'confrontante_matricula',
          rotulo: 'Matrícula Conf.',
          tipo: isDisabled ? 'readonly' : 'texto',
          valor: confMatricula,
          placeholder: 'Nº da matrícula do vizinho',
          somenteLeitura: isDisabled
        },
        {
          id: 'confrontante_cartorio',
          rotulo: 'Cartório (CNS)',
          tipo: isDisabled ? 'readonly' : 'texto',
          valor: confCartorio,
          placeholder: 'Código CNS do cartório',
          somenteLeitura: isDisabled
        }
      ]
    },
    {
      id: 'geometria_acoes',
      titulo: 'Polígono & Gerenciamento',
      aberto: true,
      propriedades: [
        {
          id: 'ignorar_poligono',
          rotulo: 'Ignorar no Polígono',
          tipo: isDisabled ? 'readonly' : 'booleano',
          valor: p.ignorar_poligono === 1,
          somenteLeitura: isDisabled,
          dica: 'Exclui o vértice do cálculo de área e perímetro sem apagá-lo'
        },
        ...(isDisabled
          ? []
          : [
              {
                id: 'acao_excluir_vertice',
                rotulo: 'Exclusão',
                tipo: 'acao' as const,
                valor: 'Excluir Ponto',
                rotuloAcao: 'Excluir Vértice'
              }
            ])
      ]
    }
  ];
}
