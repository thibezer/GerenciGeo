import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisoContinuidadeAlinhamento } from '../src/utils/continuidadeAlinhamento';

const pt = (id: number, ordem: number | null, extra: Record<string, unknown> = {}) =>
  ({ id, ordem_caminhamento: ordem, matricula_id: 1, tipo_ponto: 'P', ignorar_poligono: 0, ...extra });
const todos = [pt(1, 1), pt(2, 2), pt(3, 3), pt(4, 4), pt(5, 5)];

test('continuidade: pontos consecutivos não geram aviso', () => {
  assert.equal(avisoContinuidadeAlinhamento([todos[1], todos[2], todos[3]], todos, 1), null);
});

test('continuidade: pontos com lacuna geram aviso com a contagem', () => {
  const msg = avisoContinuidadeAlinhamento([todos[0], todos[1], todos[4]], todos, 1);
  assert.ok(msg && msg.includes('2 pontos'));
});

test('continuidade: mistura de perímetro e fora do perímetro avisa', () => {
  const campo = pt(9, null, { ignorar_poligono: 1 });
  const msg = avisoContinuidadeAlinhamento([todos[0], campo], [...todos, campo], 1);
  assert.ok(msg && msg.includes('fora dele'));
});

test('continuidade: só pontos fora do perímetro (rascunho) não avisam', () => {
  const a = pt(8, null, { ignorar_poligono: 1 });
  const b = pt(9, null, { ignorar_poligono: 1 });
  assert.equal(avisoContinuidadeAlinhamento([a, b], [...todos, a, b], 1), null);
});

test('continuidade: menos de 2 pontos não avalia', () => {
  assert.equal(avisoContinuidadeAlinhamento([todos[0]], todos, 1), null);
});
