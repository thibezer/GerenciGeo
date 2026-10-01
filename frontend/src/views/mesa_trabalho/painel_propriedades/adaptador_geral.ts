import type { CategoriaPropriedades, SeletorTipoItem } from './tipos';
import type { Ponto, Confrontante } from '../painel_propriedades_helpers';

export function gerarPropriedadesGerais(ctx: any): {
  categorias: CategoriaPropriedades[];
  tipos: SeletorTipoItem[];
  tipoSelecionadoId: string;
} {
  const matriculasList: any[] = ctx.matriculasList ?? [];
  const pontosList: Ponto[] = ctx.pontosList ?? [];
  const confrontantesList: Confrontante[] = ctx.confrontantesList ?? [];

  const matObj = matriculasList.find((m: any) => String(m.id) === String(ctx.currentMatriculaId));
  const pontosAtivosCount = pontosList.filter((p: Ponto) => p.ignorar_poligono !== 1).length;
  const confrontantesCount = confrontantesList.length;

  const fusoAtual = localStorage.getItem(`utm_zone_${ctx.currentLevId}`) || '22S';

  const categorias: CategoriaPropriedades[] = [
    {
      id: 'projeto',
      titulo: 'Geral do Projeto',
      aberto: true,
      propriedades: [
        {
          id: 'proj_nome',
          rotulo: 'Nome',
          tipo: 'readonly',
          valor: ctx.currentLevantamento?.nome_propriedade || '-'
        },
        {
          id: 'proj_status',
          rotulo: 'Status',
          tipo: 'readonly',
          valor: ctx.currentLevantamento?.status || '-'
        },
        {
          id: 'proj_car',
          rotulo: 'CAR',
          tipo: 'readonly',
          valor: ctx.currentLevantamento?.codigo_car || 'Não Informado'
        },
        {
          id: 'proj_incra',
          rotulo: 'INCRA',
          tipo: 'readonly',
          valor: ctx.currentLevantamento?.codigo_incra || 'Não Informado'
        }
      ]
    },
    {
      id: 'matricula',
      titulo: 'Matrícula Ativa',
      aberto: true,
      propriedades: [
        {
          id: 'mat_numero',
          rotulo: 'Número',
          tipo: 'readonly',
          valor: matObj ? matObj.numero_matricula : '-'
        },
        {
          id: 'mat_area',
          rotulo: 'Área',
          tipo: 'readonly',
          unidade: 'ha',
          valor: matObj ? String(matObj.area_ha || matObj.area || '0') : '-'
        },
        {
          id: 'mat_vertices',
          rotulo: 'Vértices Ativos',
          tipo: 'readonly',
          valor: String(pontosAtivosCount)
        },
        {
          id: 'mat_confrontantes',
          rotulo: 'Confrontantes',
          tipo: 'readonly',
          valor: String(confrontantesCount)
        },
        {
          id: 'mat_fuso',
          rotulo: 'Fuso UTM',
          tipo: 'readonly',
          valor: fusoAtual
        }
      ]
    }
  ];

  const tipos: SeletorTipoItem[] = [
    {
      id: 'info_geral',
      rotulo: 'Nenhum Vértice Selecionado',
      subtipo: 'Propriedades Gerais'
    }
  ];

  return {
    categorias,
    tipos,
    tipoSelecionadoId: 'info_geral'
  };
}
