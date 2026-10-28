import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gerarPropriedadesMulti } from '../src/views/mesa_trabalho/painel_propriedades/adaptador_multi';
import { construirCategoriasVertice } from '../src/views/mesa_trabalho/painel_propriedades/adaptador_vertice_categorias';

const ctx = {
  segmentosList: [],
  confrontantesList: [{ id: 9, nome: 'João', matricula_imovel: '123', cns_confrontante: '' }],
  matriculasList: [{ id: 187, numero_matricula: '5501' }, { id: 188, numero_matricula: '5502' }]
};

const prop = (categorias: any[], id: string) =>
  categorias.flatMap((c: any) => c.propriedades).find((p: any) => p.id === id);

test('Multi: 1 ponto com matrícula e outros sem aparece como "Várias", não como a matrícula do único', () => {
  const pontos: any[] = [
    { id: 1, tipo_ponto: 'P', matricula_id: 187 },
    { id: 2, tipo_ponto: 'P', matricula_id: null },
    { id: 3, tipo_ponto: 'P', matricula_id: null }
  ];
  const { categorias } = gerarPropriedadesMulti(pontos, ctx);
  const matricula = prop(categorias, 'multi_matricula_id');
  assert.equal(matricula.valor, '');
  assert.equal(matricula.opcoes[0].rotulo, 'Várias (Sem Alteração)');
});

test('Multi: mesma matrícula em todos continua resolvida', () => {
  const pontos: any[] = [
    { id: 1, tipo_ponto: 'P', matricula_id: 187 },
    { id: 2, tipo_ponto: 'M', matricula_id: 187 }
  ];
  const { categorias } = gerarPropriedadesMulti(pontos, ctx);
  assert.equal(prop(categorias, 'multi_matricula_id').valor, '187');
  assert.equal(prop(categorias, 'multi_tipo_ponto').valor, '', 'tipos diferentes = Vários');
});

test('Multi: confrontante de um só ponto não é exibido como o do lote', () => {
  const pontos: any[] = [
    { id: 1, tipo_ponto: 'P', confrontante_id: 9 },
    { id: 2, tipo_ponto: 'P' }
  ];
  const { categorias } = gerarPropriedadesMulti(pontos, ctx);
  assert.equal(prop(categorias, 'multi_confrontante_nome').valor, '');
});

test('Multi: só oferece tipos aceitos pelo backend (M/P/V/B)', () => {
  const { categorias } = gerarPropriedadesMulti([{ id: 1, tipo_ponto: 'P' } as any], ctx);
  const ids = prop(categorias, 'multi_tipo_ponto').opcoes.map((o: any) => o.id).filter(Boolean);
  assert.deepEqual(ids, ['M', 'P', 'V', 'B']);
});

const paramsVertice = (p: any, isDisabled = false) => ({
  p, isDisabled, origemTexto: '', tipoSelecionadoId: p.tipo_ponto,
  opcoesTipo: [{ id: 'M', rotulo: 'Marco [M]' }, { id: 'B', rotulo: 'Base [B]' }],
  opcoesMatricula: [], opcoesMetodo: [], opcoesLimite: [], fusoAtual: '22S',
  eVal: null, nVal: null, hVal: null, latVal: null, lonVal: null, resultante: '',
  nomeBaseApoio: '', confNome: '', confMatricula: '', confCartorio: '', tipoLimiteCalculado: ''
});

test('Vértice: tipo do ponto é editável na tabela de propriedades', () => {
  const categorias = construirCategoriasVertice(paramsVertice({ id: 1, tipo_ponto: 'M' }));
  const tipo = prop(categorias, 'tipo_ponto');
  assert.equal(tipo.tipo, 'selecao');
  assert.equal(tipo.valor, 'M');
});

test('Vértice: ponto somente leitura mostra o rótulo do tipo', () => {
  const categorias = construirCategoriasVertice(paramsVertice({ id: 1, tipo_ponto: 'B' }, true));
  const tipo = prop(categorias, 'tipo_ponto');
  assert.equal(tipo.tipo, 'readonly');
  assert.equal(tipo.valor, 'Base [B]');
});
