import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pontoDentroDoPoligono } from '../src/views/mesa_trabalho/caneta/caneta_geometria';
import {
  calcularDistancia2D,
  calcularScoreMestre,
  detectarGruposSobrepostos
} from '../src/views/mesa_trabalho/sobrepostos/sobrepostos_detector';

test('Caneta: deve identificar ponto no interior do polígono (Ray-Casting)', () => {
  const quadrado = [
    { lat: 0, lng: 0 },
    { lat: 10, lng: 0 },
    { lat: 10, lng: 10 },
    { lat: 0, lng: 10 }
  ];

  assert.equal(pontoDentroDoPoligono(5, 5, quadrado), true);
  assert.equal(pontoDentroDoPoligono(1, 1, quadrado), true);
});

test('Caneta: deve identificar ponto fora do polígono (Ray-Casting)', () => {
  const quadrado = [
    { lat: 0, lng: 0 },
    { lat: 10, lng: 0 },
    { lat: 10, lng: 10 },
    { lat: 0, lng: 10 }
  ];

  assert.equal(pontoDentroDoPoligono(15, 5, quadrado), false);
  assert.equal(pontoDentroDoPoligono(-1, 5, quadrado), false);
  assert.equal(pontoDentroDoPoligono(5, 12, quadrado), false);
});

test('Sobrepostos: calcula distância euclidiana 2D corretamente via UTM', () => {
  const mockCtx: any = {
    latLonToUTM: (lat: number, lon: number) => ({ e: lon * 100000, n: lat * 100000 }),
    currentMatriculaId: 1
  };
  const p1 = { easting: 100, northing: 200 };
  const p2 = { easting: 103, northing: 204 };
  const dist = calcularDistancia2D(p1, p2, mockCtx);
  assert.ok(Math.abs(dist - 5.0) < 0.001);
});

test('Sobrepostos: calcula score mestre priorizando CORRIGIDO e marcos M oficiais SIGEF', () => {
  const pBruto = { id: 1, status_ponto: 'BRUTO', tipo_ponto: 'P', nome_vertice: 'P1' };
  const pCorrigido = { id: 2, status_ponto: 'CORRIGIDO', tipo_ponto: 'P', nome_vertice: 'P1' };
  const pOficialSIGEF = { id: 3, status_ponto: 'CORRIGIDO', tipo_ponto: 'M', nome_vertice: 'ABC-M-0001' };

  const scoreBruto = calcularScoreMestre(pBruto);
  const scoreCorrigido = calcularScoreMestre(pCorrigido);
  const scoreOficial = calcularScoreMestre(pOficialSIGEF);

  assert.ok(scoreCorrigido > scoreBruto);
  assert.ok(scoreOficial > scoreCorrigido);
});

test('Sobrepostos: detecta clusters de pontos geometricamente sobrepostos', () => {
  const mockCtx: any = {
    latLonToUTM: (lat: number, lon: number) => ({ e: lon * 100000, n: lat * 100000 }),
    currentMatriculaId: 1
  };
  const pontos = [
    { id: 10, matricula_id: 1, easting: 500000.00, northing: 7000000.00, status_ponto: 'BRUTO', nome_vertice: 'P-10' },
    { id: 11, matricula_id: 1, easting: 500000.02, northing: 7000000.01, status_ponto: 'CORRIGIDO', nome_vertice: 'P-11' }, // Sobreposto a 10 (dist ~2.2cm)
    { id: 12, matricula_id: 1, easting: 500100.00, northing: 7000100.00, status_ponto: 'CORRIGIDO', nome_vertice: 'P-12' }  // Ponto isolado
  ];

  const ctx = {
    ...mockCtx,
    pontosList: pontos
  };

  const grupos = detectarGruposSobrepostos(ctx, 0.05); // tolerância 5cm
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].pontos.length, 2);
  assert.equal(grupos[0].pontos[0].ponto.id, 11);
  assert.equal(grupos[0].pontos[0].isSugeridoMestre, true);
  assert.equal(grupos[0].temNomesDiferentes, true);
});
