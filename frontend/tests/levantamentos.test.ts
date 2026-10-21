import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatarDataBr,
  listarPendenciasLev,
  filtrarPorSegmento,
  contarSegmentosLev,
  filtrarLevantamentos,
  ordenarLevantamentos,
  renderLinhasLevHtml
} from '../src/views/levantamentos/levantamentos_helpers';
import type { Levantamento } from '../src/views/levantamentos/levantamentos_helpers';

const lev = (extra: Partial<Levantamento>): Levantamento => ({
  id: 1, nome_propriedade: 'Fazenda X', status: 'EM_ANDAMENTO', data_inicio: '2026-06-17',
  numero_trt: 'BR1', total_pontos: 10, clientes: [{ nome_completo: 'João da Silva' }], ...extra
});

const lista: Levantamento[] = [
  lev({ id: 1, nome_propriedade: 'Sítio Santa Terezinha', municipio: 'Iporã', uf: 'PR', data_inicio: '2026-06-01', total_pontos: 70 }),
  lev({ id: 2, nome_propriedade: 'Ágata', status: 'CONCLUIDO', data_inicio: '2026-08-05', total_pontos: 5, codigo_ccir: '12345678901' }),
  lev({ id: 3, nome_propriedade: 'Zeca', status: 'ARQUIVADO', numero_trt: null, clientes: [], total_pontos: 0, data_inicio: '2026-07-01' }),
  lev({ id: 4, nome_propriedade: 'Beto', numero_trt: '', clientes: [], total_pontos: 3, data_inicio: '2026-07-01' })
];
const ids = (l: Levantamento[]) => l.map(x => x.id);

test('data ISO vira dd/mm/aaaa sem depender de fuso', () => {
  assert.equal(formatarDataBr('2026-06-17'), '17/06/2026');
  assert.equal(formatarDataBr('2026-06-17T00:00:00'), '17/06/2026');
  assert.equal(formatarDataBr(''), '—');
});

test('pendências: sem proprietário, sem TRT e sem pontos; arquivado nunca tem pendência', () => {
  const cod = (l: Levantamento) => listarPendenciasLev(l).map(p => p.codigo);
  assert.deepEqual(cod(lista[3]), ['sem-proprietario', 'sem-trt']);
  assert.deepEqual(cod(lev({ total_pontos: 0 })), ['sem-pontos']);
  assert.deepEqual(cod(lista[2]), []);
  assert.deepEqual(cod(lista[0]), []);
});

test('segmentos filtram por status/pendência e a contagem cobre a lista inteira', () => {
  assert.deepEqual(ids(filtrarPorSegmento(lista, 'andamento')), [1, 4]);
  assert.deepEqual(ids(filtrarPorSegmento(lista, 'concluido')), [2]);
  assert.deepEqual(ids(filtrarPorSegmento(lista, 'arquivado')), [3]);
  assert.deepEqual(ids(filtrarPorSegmento(lista, 'pendencias')), [4]);
  assert.deepEqual(contarSegmentosLev(lista), { todos: 4, andamento: 2, concluido: 1, arquivado: 1, pendencias: 1 });
});

test('busca ignora acento/caixa e olha município, proprietário, TRT e CCIR com máscara', () => {
  assert.deepEqual(ids(filtrarLevantamentos(lista, 'agata')), [2]);
  assert.deepEqual(ids(filtrarLevantamentos(lista, 'ipora')), [1]);
  assert.deepEqual(ids(filtrarLevantamentos(lista, 'joao')), [1, 2]);
  assert.deepEqual(ids(filtrarLevantamentos(lista, 'br1')), [1, 2]);
  assert.deepEqual(ids(filtrarLevantamentos(lista, '123.456')), [2]);
  assert.deepEqual(ids(filtrarLevantamentos(lista, 'inexistente')), []);
});

test('ordenação: data desc, nome sem acento, pontos; empate por nome; não muta a entrada', () => {
  assert.deepEqual(ids(ordenarLevantamentos(lista, 'data', 'desc')), [2, 4, 3, 1]);
  assert.deepEqual(ids(ordenarLevantamentos(lista, 'nome', 'asc')), [2, 4, 1, 3]);
  assert.deepEqual(ids(ordenarLevantamentos(lista, 'pontos', 'desc')), [1, 2, 4, 3]);
  assert.deepEqual(ids(lista), [1, 2, 3, 4]);
});

test('linhas escapam o nome e arquivado ganha o botão de desarquivar', () => {
  const html = renderLinhasLevHtml([
    lev({ id: 9, nome_propriedade: '<img src=x onerror=alert(1)>' }),
    lev({ id: 10, status: 'ARQUIVADO' })
  ]);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
  assert.equal(html.split('btn-desarquivar-lev').length - 1, 1);
});
