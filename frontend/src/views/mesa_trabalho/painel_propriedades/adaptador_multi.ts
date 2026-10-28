import type { CategoriaPropriedades, SeletorTipoItem, OpcaoPropriedade } from './tipos';
import {
  METODOS_SIGEF,
  LIMITES_SIGEF
} from '../painel_propriedades_helpers';
import type { Ponto, Segmento, Confrontante } from '../painel_propriedades_helpers';

export function gerarPropriedadesMulti(pontosMulti: Ponto[], ctx: any): {
  categorias: CategoriaPropriedades[];
  tipos: SeletorTipoItem[];
  tipoSelecionadoId: string;
} {
  const segmentosList: Segmento[] = ctx.segmentosList ?? [];
  const confrontantesList: Confrontante[] = ctx.confrontantesList ?? [];
  const matriculasList: any[] = ctx.matriculasList ?? [];

  // Vazio também é um valor: 1 ponto com matrícula + 3 sem é "Vários", não a matrícula do único.
  // Isso importa porque o "Aplicar" envia todos os valores exibidos para o lote inteiro.
  const resolveField = (extractor: (p: Ponto) => string): string => {
    const unique = [...new Set(pontosMulti.map(extractor))];
    return unique.length === 1 ? unique[0] : '';
  };
  const isMisto = (extractor: (p: Ponto) => string): boolean => new Set(pontosMulti.map(extractor)).size > 1;

  const extrairTipo = (p: Ponto) => (p.tipo_ponto || p.tipo || '').toUpperCase();
  const extrairMatricula = (p: Ponto) => p.matricula_id != null ? String(p.matricula_id) : '';
  const extrairMetodo = (p: Ponto) => (p as any).metodo_posicionamento || '';
  const extrairLimite = (p: Ponto) => {
    const seg = segmentosList.find((s: Segmento) => String(s.ponto_inicio_id) === String(p.id));
    return p.tipo_limite_sigef || p.tipo_limite || (seg ? seg.tipo_limite_sigef : '') || '';
  };

  const tipoResolvido = resolveField(extrairTipo);
  const matriculaResolvida = resolveField(extrairMatricula);
  const matriculaMista = isMisto(extrairMatricula);
  const metodoResolvido = resolveField(extrairMetodo);
  const metodoMisto = isMisto(extrairMetodo);
  const limiteResolvido = resolveField(extrairLimite);
  const limiteMisto = isMisto(extrairLimite);

  const resolveConf = (field: 'nome' | 'matricula_imovel' | 'cns_confrontante'): string => {
    const vals = pontosMulti.map(p => {
      const seg = segmentosList.find((s: Segmento) => String(s.ponto_inicio_id) === String(p.id));
      const cId = p.confrontante_id || (seg && seg.confrontante_id);
      if (!cId) return '';
      const cObj = confrontantesList.find((c: Confrontante) => String(c.id) === String(cId));
      return cObj ? (cObj[field] || '') : '';
    });
    const unique = [...new Set(vals)];
    return unique.length === 1 ? unique[0] : '';
  };

  const confNomeResolvido = resolveConf('nome');
  const confMatResolvido = resolveConf('matricula_imovel');
  const confCnsResolvido = resolveConf('cns_confrontante');

  const ignorarVals = pontosMulti.map(p => p.ignorar_poligono === 1);
  const todosIgnorados = ignorarVals.length > 0 && ignorarVals.every(v => v === true);

  const opcoesMatricula: OpcaoPropriedade[] = [
    { id: '', rotulo: matriculaMista ? 'Várias (Sem Alteração)' : (matriculaResolvida ? 'Manter' : 'Sem Matrícula (Sem Alteração)') },
    ...matriculasList.map((m: any) => ({
      id: String(m.id),
      rotulo: m.numero_matricula ? `Matrícula ${m.numero_matricula}` : `Matrícula #${m.id}`
    }))
  ];

  const opcoesTipo: OpcaoPropriedade[] = [
    { id: '', rotulo: tipoResolvido ? 'Manter' : 'Vários (Sem Alteração)' },
    { id: 'M', rotulo: 'Marco [M]' },
    { id: 'P', rotulo: 'Ponto [P]' },
    { id: 'V', rotulo: 'Vértice Virtual [V]' },
    { id: 'B', rotulo: 'Base [B]' }
  ];

  const opcoesMetodo: OpcaoPropriedade[] = [
    { id: '', rotulo: metodoMisto ? 'Vários (Sem Alteração)' : 'Não Especificado' },
    ...METODOS_SIGEF.map(m => ({
      id: m.codigo,
      rotulo: `${m.codigo} - ${m.nome}`
    }))
  ];

  const opcoesLimite: OpcaoPropriedade[] = [
    { id: '', rotulo: limiteMisto ? 'Vários (Sem Alteração)' : 'Não Especificado' },
    ...LIMITES_SIGEF.map(l => ({
      id: l.codigo,
      rotulo: `${l.codigo} - ${l.nome}`
    }))
  ];

  const categorias: CategoriaPropriedades[] = [
    {
      id: 'lote_identificacao',
      titulo: `Edição em Lote (${pontosMulti.length} Vértices)`,
      aberto: true,
      propriedades: [
        {
          id: 'multi_tipo_ponto',
          rotulo: 'Tipo do Ponto',
          tipo: 'selecao',
          valor: tipoResolvido,
          opcoes: opcoesTipo,
          dica: 'Aplica o tipo selecionado a todos os vértices do lote'
        },
        {
          id: 'multi_matricula_id',
          rotulo: 'Matrícula',
          tipo: 'selecao',
          valor: matriculaResolvida,
          opcoes: opcoesMatricula,
          dica: 'Vincula todos os vértices selecionados à matrícula escolhida'
        }
      ]
    },
    {
      id: 'lote_sigef',
      titulo: 'Atributos SIGEF em Lote',
      aberto: true,
      propriedades: [
        {
          id: 'multi_metodo_posicionamento',
          rotulo: 'Método Pos.',
          tipo: 'selecao',
          valor: metodoResolvido,
          opcoes: opcoesMetodo,
          dica: 'Define o método de posicionamento para o lote'
        },
        {
          id: 'multi_tipo_limite_sigef',
          rotulo: 'Tipo de Limite',
          tipo: 'selecao',
          valor: limiteResolvido,
          opcoes: opcoesLimite,
          dica: 'Define o tipo de limite para o lote'
        }
      ]
    },
    {
      id: 'lote_confrontacao',
      titulo: 'Confrontação Territorial em Lote',
      aberto: false,
      propriedades: [
        {
          id: 'multi_confrontante_nome',
          rotulo: 'Confrontante',
          tipo: 'texto',
          valor: confNomeResolvido,
          placeholder: confNomeResolvido ? confNomeResolvido : 'Vários / Digite para alterar todos'
        },
        {
          id: 'multi_confrontante_matricula',
          rotulo: 'Matrícula Conf.',
          tipo: 'texto',
          valor: confMatResolvido,
          placeholder: confMatResolvido ? confMatResolvido : 'Vários / Digite para alterar todos'
        },
        {
          id: 'multi_confrontante_cartorio',
          rotulo: 'Cartório (CNS)',
          tipo: 'texto',
          valor: confCnsResolvido,
          placeholder: confCnsResolvido ? confCnsResolvido : 'Vários / Digite para alterar todos'
        }
      ]
    },
    {
      id: 'lote_geometria',
      titulo: 'Polígono & Geometria',
      aberto: true,
      propriedades: [
        {
          id: 'multi_ignorar_poligono',
          rotulo: 'Ignorar no Polígono',
          tipo: 'booleano',
          valor: todosIgnorados,
          dica: 'Marca ou desmarca a inclusão dos vértices selecionados no polígono de cálculo'
        },
        {
          id: 'acao_ignorar_todos',
          rotulo: 'Polígono',
          tipo: 'acao' as const,
          valor: 'Ignorar Todos',
          rotuloAcao: 'Alternar Ignorar Polígono'
        },
        {
          id: 'acao_excluir_selecionados',
          rotulo: 'Exclusão',
          tipo: 'acao' as const,
          valor: 'Deletar Lote',
          rotuloAcao: 'Excluir Vértices Selecionados'
        }
      ]
    }
  ];

  const tipos: SeletorTipoItem[] = [
    {
      id: 'lote',
      rotulo: `${pontosMulti.length} Vértices Selecionados`,
      subtipo: 'Edição Múltipla'
    }
  ];

  return {
    categorias,
    tipos,
    tipoSelecionadoId: 'lote'
  };
}
