import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  listarPendenciasProp,
  filtrarPorSegmentoProp,
  contarSegmentosProp,
  filtrarPropriedades,
  ordenarPropriedades,
  resumirProprietarios,
  renderLinhasPropHtml
} from '../src/views/propriedades/propriedades_helpers';
import type { Propriedade } from '../src/views/propriedades/propriedades_helpers';
import { renderBotoesPaginacaoHtml } from '../src/utils/lista_padrao';

const prop = (extra: Partial<Propriedade>): Propriedade => ({
  id: 1, nome_propriedade: 'Fazenda X', municipio: 'Umuarama', uf: 'PR',
  total_matriculas: 1, total_levantamentos: 0, composicao_completa: true,
  clientes: [{ nome_completo: 'João da Silva Santos', percentual_participacao: 100 }], ...extra
});

const lista: Propriedade[] = [
  prop({ id: 1, nome_propriedade: 'Sítio Santa Terezinha', municipio: 'Iporã', total_levantamentos: 2, codigo_car: 'PR-123', codigo_ccir: '12345678901' }),
  prop({ id: 2, nome_propriedade: 'Ágata', total_matriculas: 0 }),
  prop({ id: 3, nome_propriedade: 'Zeca', clientes: [], total_matriculas: 3, total_levantamentos: 1 }),
  prop({ id: 4, nome_propriedade: 'Beto', composicao_completa: false, total_matriculas: 5 })
];
const ids = (l: Propriedade[]) => l.map(x => x.id);

test('pendências: sem proprietário, composição incompleta e sem matrícula', () => {
  const cod = (p: Propriedade) => listarPendenciasProp(p).map(x => x.codigo);
  assert.deepEqual(cod(lista[0]), []);
  assert.deepEqual(cod(lista[1]), ['sem-matricula']);
  assert.deepEqual(cod(lista[2]), ['sem-proprietario']);
  assert.deepEqual(cod(lista[3]), ['composicao']);
  assert.deepEqual(cod(prop({ clientes: [], total_matriculas: 0 })), ['sem-proprietario', 'sem-matricula']);
});

test('segmentos filtram e a contagem cobre a lista inteira', () => {
  assert.deepEqual(ids(filtrarPorSegmentoProp(lista, 'com-lev')), [1, 3]);
  assert.deepEqual(ids(filtrarPorSegmentoProp(lista, 'sem-lev')), [2, 4]);
  assert.deepEqual(ids(filtrarPorSegmentoProp(lista, 'pendencias')), [2, 3, 4]);
  assert.equal(filtrarPorSegmentoProp(lista, 'todos'), lista);
  assert.deepEqual(contarSegmentosProp(lista), { todos: 4, 'com-lev': 2, 'sem-lev': 2, pendencias: 3 });
});

test('busca ignora acento/caixa e olha município, proprietário, CAR e CCIR com máscara', () => {
  assert.deepEqual(ids(filtrarPropriedades(lista, 'agata')), [2]);
  assert.deepEqual(ids(filtrarPropriedades(lista, 'ipora')), [1]);
  assert.deepEqual(ids(filtrarPropriedades(lista, 'joao')), [1, 2, 4]);
  assert.deepEqual(ids(filtrarPropriedades(lista, 'pr-123')), [1]);
  assert.deepEqual(ids(filtrarPropriedades(lista, '123.456')), [1]);
  assert.deepEqual(ids(filtrarPropriedades(lista, 'inexistente')), []);
});

test('ordenação: nome sem acento, cadastro (id), vínculos; empate por nome; não muta a entrada', () => {
  assert.deepEqual(ids(ordenarPropriedades(lista, 'nome', 'asc')), [2, 4, 1, 3]);
  assert.deepEqual(ids(ordenarPropriedades(lista, 'cadastro', 'desc')), [4, 3, 2, 1]);
  // vínculos = matrículas + levantamentos: Beto 5, Zeca 4, Sítio 3, Ágata 0
  assert.deepEqual(ids(ordenarPropriedades(lista, 'vinculos', 'desc')), [4, 3, 1, 2]);
  assert.deepEqual(ids(lista), [1, 2, 3, 4]);
});

test('proprietário principal: maior participação, 2 primeiros nomes e "e mais N"', () => {
  assert.equal(resumirProprietarios([]), null);
  assert.deepEqual(resumirProprietarios([
    { nome_completo: 'Ana Maria Souza', percentual_participacao: 30 },
    { nome_completo: 'Bruno Carlos Lima Dias', percentual_participacao: 70 }
  ]), { nome: 'Bruno Carlos', extras: 1 });
});

test('linhas escapam nome e proprietário (antes o proprietário não era escapado) e marcam seleção', () => {
  const html = renderLinhasPropHtml([
    prop({ id: 7, nome_propriedade: '<img src=x onerror=alert(1)>', clientes: [{ nome_completo: '<b>Mau</b> Nome', percentual_participacao: 100 }] })
  ], new Set([7]));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<b>Mau'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('is-sel'));
  assert.ok(html.includes('data-id="7"'));
});

test('paginação compartilhada: some com 1 página e destaca a atual', () => {
  assert.equal(renderBotoesPaginacaoHtml(1, 1), '');
  const html = renderBotoesPaginacaoHtml(2, 5);
  assert.ok(html.includes('is-active'));
  assert.ok(html.includes('aria-current="page"'));
  assert.ok(html.includes('data-page="1"') && html.includes('data-page="5"'));
});
