import type { CategoriaPropriedades, SeletorTipoItem } from './tipos';
import type { Ponto, Confrontante } from '../painel_propriedades_helpers';
import { formatarHa, textoDiferencaArea } from '../area_medida';
import type { AreaMedida } from '../area_medida';

export function gerarPropriedadesGerais(ctx: any): {
  categorias: CategoriaPropriedades[];
  tipos: SeletorTipoItem[];
  tipoSelecionadoId: string;
} {
  const matriculasList: any[] = ctx.matriculasList ?? [];
  const pontosList: Ponto[] = ctx.pontosList ?? [];
  const confrontantesList: Confrontante[] = ctx.confrontantesList ?? [];

  const areaMedida: AreaMedida | null = ctx.areaMedida ?? null;
  const matObj = matriculasList.find((m: any) => String(m.id) === String(ctx.currentMatriculaId));
  const pontosAtivosCount = pontosList.filter((p: Ponto) => p.ignorar_poligono !== 1).length;
  const confrontantesCount = confrontantesList.length;

  const fusoAtual =
    (typeof localStorage !== 'undefined' ? localStorage.getItem(`utm_zone_${ctx.currentLevId}`) : null) || '22S';

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
          rotulo: 'Área (matrícula)',
          tipo: 'readonly',
          unidade: 'ha',
          valor: matObj ? String(matObj.area_ha || matObj.area || '0') : '-'
        },
        {
          id: 'mat_area_sigef',
          rotulo: 'Área SIGEF',
          tipo: 'readonly',
          unidade: 'ha',
          valor: matObj?.area_sigef_ha != null && matObj.area_sigef_ha !== ''
            ? formatarHa(Number(matObj.area_sigef_ha))
            : '-',
          dica: 'Área exata certificada/calculada no SIGEF (cadastrada na matrícula).'
        },
        {
          id: 'mat_area_medida',
          rotulo: 'Área medida',
          tipo: 'readonly',
          unidade: 'ha',
          valor: areaMedida ? formatarHa(areaMedida.area_ha) : '-',
          dica: areaMedida?.autointersecta
            ? 'A poligonal se autointersecta: a área pode estar incorreta.'
            : 'Calculada pelos vértices ativos da matrícula (fora bases e vértices ignorados).'
        },
        {
          id: 'mat_area_diferenca',
          rotulo: 'Diferença',
          tipo: 'readonly',
          valor: areaMedida && areaMedida.area_declarada_ha > 0 ? textoDiferencaArea(areaMedida) : '-'
        },
        {
          id: 'mat_perimetro',
          rotulo: 'Perímetro medido',
          tipo: 'readonly',
          unidade: 'm',
          valor: areaMedida
            ? areaMedida.perimetro_m.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : '-'
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
