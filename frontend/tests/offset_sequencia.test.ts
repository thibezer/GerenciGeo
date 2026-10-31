import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ordenarSequenciaOffset, pontosDoPerimetro, removerCoincidentes } from '../src/views/mesa_trabalho/offset_sequencia';
import { criarPlanoLocal, gerarGeometriaPreviewOffsetPolilinha } from '../src/utils/previewGeometria';

// Perímetro de 6 vértices da matrícula 1, mais uma base e um ponto fora do polígono
const todos = [
  { id: 10, matricula_id: 1, ordem_caminhamento: 1, tipo_ponto: 'M' },
  { id: 11, matricula_id: 1, ordem_caminhamento: 2, tipo_ponto: 'M' },
  { id: 12, matricula_id: 1, ordem_caminhamento: 3, tipo_ponto: 'M' },
  { id: 13, matricula_id: 1, ordem_caminhamento: 4, tipo_ponto: 'M' },
  { id: 14, matricula_id: 1, ordem_caminhamento: 5, tipo_ponto: 'M' },
  { id: 15, matricula_id: 1, ordem_caminhamento: 6, tipo_ponto: 'M' },
  { id: 90, matricula_id: 1, ordem_caminhamento: null, tipo_ponto: 'B' },
  { id: 91, matricula_id: 1, ordem_caminhamento: 7, tipo_ponto: 'P', ignorar_poligono: 1 },
  { id: 20, matricula_id: 2, ordem_caminhamento: 1, tipo_ponto: 'M' },
];
const porId = (ids: number[]) => ids.map(id => todos.find(p => p.id === id)!);
const ids = (r: { pontos: any[] }) => r.pontos.map(p => p.id);

test('Offset: perímetro exclui base, pontos fora do polígono e outras matrículas', () => {
  assert.deepEqual(pontosDoPerimetro(todos, 1).map(p => p.id), [10, 11, 12, 13, 14, 15]);
});

test('Offset: Shift+clique de baixo para cima volta para a ordem do caminhamento', () => {
  // Clique em P5 e Shift+clique em P1 gera [P5, P1, P2, P3, P4]
  const r = ordenarSequenciaOffset(porId([14, 10, 11, 12, 13]), pontosDoPerimetro(todos, 1));
  assert.deepEqual(ids(r), [10, 11, 12, 13, 14]);
  assert.equal(r.fechado, false);
});

test('Offset: seleção que passa pelo início do perímetro fica contínua', () => {
  const r = ordenarSequenciaOffset(porId([10, 11, 14, 15]), pontosDoPerimetro(todos, 1));
  assert.deepEqual(ids(r), [14, 15, 10, 11]);
});

test('Offset: perímetro inteiro selecionado vira polígono fechado', () => {
  const r = ordenarSequenciaOffset(porId([13, 10, 15, 11, 14, 12]), pontosDoPerimetro(todos, 1));
  assert.deepEqual(ids(r), [10, 11, 12, 13, 14, 15]);
  assert.equal(r.fechado, true);
});

test('Offset: ponto fora do perímetro mantém a ordem de seleção', () => {
  const r = ordenarSequenciaOffset(porId([12, 20, 10]), pontosDoPerimetro(todos, 1));
  assert.deepEqual(ids(r), [12, 20, 10]);
});

test('Offset: remove vértices coincidentes, inclusive o fechamento repetido', () => {
  const pts = [{ e: 0, n: 0 }, { e: 0, n: 0.0002 }, { e: 0, n: 10 }, { e: 10, n: 10 }, { e: 0, n: 0 }];
  const coord = (p: any) => ({ este: p.e, norte: p.n });
  assert.equal(removerCoincidentes(pts, coord, false).length, 4);
  assert.equal(removerCoincidentes(pts, coord, true).length, 3);
});

test('Offset: prévia de polígono fechado intercepta todos os cantos (igual ao backend)', () => {
  // Quadrado no sentido horário: à DIREITA fica o interior
  const quadrado = [
    { este: 0, norte: 0 }, { este: 0, norte: 100 }, { este: 100, norte: 100 }, { este: 100, norte: 0 },
  ];
  const fechado = gerarGeometriaPreviewOffsetPolilinha(quadrado, 10, 'DIREITA', true);
  assert.deepEqual(fechado.vertices, [
    { este: 10, norte: 10 }, { este: 10, norte: 90 }, { este: 90, norte: 90 }, { este: 90, norte: 10 },
  ]);

  const aberto = gerarGeometriaPreviewOffsetPolilinha(quadrado, 10, 'DIREITA');
  assert.deepEqual(aberto.vertices[0], { este: 10, norte: 0 });
  assert.deepEqual(aberto.vertices[3], { este: 90, norte: 0 });
});

test('Offset: trecho nulo não gera prévia desalinhada', () => {
  const pts = [{ este: 0, norte: 0 }, { este: 0, norte: 0 }, { este: 0, norte: 50 }];
  assert.equal(gerarGeometriaPreviewOffsetPolilinha(pts, 10, 'DIREITA').vertices.length, 0);
});

test('Offset: plano local converte ida e volta e mede distâncias em metros', () => {
  const plano = criarPlanoLocal(-23.5, -51.9);
  const p = plano.paraPlano(-23.5 + 0.001, -51.9 + 0.001);
  // 0,001° de latitude ~ 110,8 m perto de 23°S; de longitude ~ 102,1 m
  assert.ok(Math.abs(p.norte - 110.8) < 0.3, String(p.norte));
  assert.ok(Math.abs(p.este - 102.1) < 0.3, String(p.este));
  const g = plano.paraGeo(p);
  assert.ok(Math.abs(g.lat - (-23.499)) < 1e-12);
  assert.ok(Math.abs(g.lon - (-51.899)) < 1e-12);
});
