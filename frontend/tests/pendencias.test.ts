import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  filtrarPorSegmentoPend,
  contarSegmentosPend,
  filtrarPendencias,
  ordenarPendencias,
  renderLinhasPendencias
} from '../src/views/pendencias/pendencias_helpers';
import type { Pendencia } from '../src/views/pendencias/pendencias_helpers';

const pend = (extra: Partial<Pendencia>): Pendencia => ({
  id: 1, titulo: 'Tarefa', descricao: '', status: 'PENDENTE', prioridade: 'MEDIA', data_criacao: '2026-10-01 10:00:00', ...extra
});

const lista: Pendencia[] = [
  pend({ id: 1, titulo: 'Cônjuge: Fernando', prioridade: 'ALTA', data_criacao: '2026-10-16 14:22:08' }),
  pend({ id: 2, titulo: 'Ágata', descricao: 'Revisar TRT', prioridade: 'BAIXA', data_criacao: '2026-08-27 13:44:50' }),
  pend({ id: 3, titulo: 'Concluída antiga', status: 'CONCLUIDO', prioridade: 'ALTA', data_criacao: '2026-10-20 09:00:00' }),
  pend({ id: 4, titulo: 'Média', prioridade: 'MEDIA', data_criacao: '2026-10-10 09:00:00' })
];
const ids = (l: Pendencia[]) => l.map(x => x.id);

test('segmentos: abertas, alta prioridade (só abertas), concluídas e todas; contagem sobre a lista inteira', () => {
  assert.deepEqual(ids(filtrarPorSegmentoPend(lista, 'abertas')), [1, 2, 4]);
  assert.deepEqual(ids(filtrarPorSegmentoPend(lista, 'alta')), [1]);
  assert.deepEqual(ids(filtrarPorSegmentoPend(lista, 'concluidas')), [3]);
  assert.equal(filtrarPorSegmentoPend(lista, 'todas'), lista);
  assert.deepEqual(contarSegmentosPend(lista), { abertas: 3, alta: 1, concluidas: 1, todas: 4 });
});

test('busca ignora acento/caixa e olha título e descrição', () => {
  assert.deepEqual(ids(filtrarPendencias(lista, 'conjuge')), [1]);
  assert.deepEqual(ids(filtrarPendencias(lista, 'agata')), [2]);
  assert.deepEqual(ids(filtrarPendencias(lista, 'trt')), [2]);
  assert.deepEqual(ids(filtrarPendencias(lista, 'zzz')), []);
});

test('ordenação: prioridade (ALTA primeiro), concluídas sempre por último, empate pela criação mais recente', () => {
  assert.deepEqual(ids(ordenarPendencias(lista, 'prioridade', 'desc')), [1, 4, 2, 3]);
  assert.deepEqual(ids(ordenarPendencias(lista, 'prioridade', 'asc')), [2, 4, 1, 3]);
  assert.deepEqual(ids(ordenarPendencias(lista, 'data', 'desc')), [1, 4, 2, 3]);
  assert.deepEqual(ids(ordenarPendencias(lista, 'titulo', 'asc')), [2, 1, 4, 3]);
  assert.deepEqual(ids(lista), [1, 2, 3, 4]);
});

test('linhas escapam título e descrição; concluída não oferece o botão de concluir', () => {
  const html = renderLinhasPendencias([
    pend({ id: 7, titulo: '<img src=x onerror=alert(1)>', descricao: '<b>x</b>' }),
    pend({ id: 8, status: 'CONCLUIDO' })
  ]);
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<b>x'));
  assert.ok(html.includes('&lt;img'));
  assert.equal(html.split('btn-concluir').length - 1, 1);
  assert.equal(html.split('btn-excluir').length - 1, 2);
});
