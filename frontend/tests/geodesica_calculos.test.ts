import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  latLonToUTM,
  calcularSigmaHorizontal,
  calcularSigma3D,
  avaliarToleranciaIncra,
  formatarAzimuteDMS,
  calcularDistanciaAzimute,
  calcularAreaGaussShoelace,
  TOLERANCIA_INCRA
} from '../src/views/mesa_trabalho/geodesica/geodesica_calculos';

test('latLonToUTM projeta coordenadas para SIRGAS 2000 UTM 22S corretamente', () => {
  // Ponto no Paraná / Fuso 22S: Lat -24.0, Lon -51.0
  const utm = latLonToUTM(-24.0, -51.0, 22);
  assert.equal(utm.zone, 22);
  assert.ok(utm.e > 490000 && utm.e < 510000, `Este esperado próximo a 500000m, obtido: ${utm.e}`);
  assert.ok(utm.n > 7300000 && utm.n < 7400000, `Norte esperado em ~7344000m, obtido: ${utm.n}`);
});

test('calcularSigmaHorizontal e calcularSigma3D calculam erros quadráticos corretos', () => {
  const sigmaH = calcularSigmaHorizontal(0.03, 0.04);
  assert.equal(Math.round(sigmaH * 1000) / 1000, 0.05);

  const sigma3D = calcularSigma3D(0.02, 0.03, 0.06);
  assert.equal(Math.round(sigma3D * 1000) / 1000, 0.07);
});

test('avaliarToleranciaIncra valida limites da NTGIR 3ª Edição (M <= 0.10m, V <= 0.50m, P <= 3.00m)', () => {
  assert.equal(TOLERANCIA_INCRA.M, 0.10);
  assert.equal(TOLERANCIA_INCRA.V, 0.50);
  assert.equal(TOLERANCIA_INCRA.P, 3.00);

  // Marco com 0.08m de sigma -> Conforme
  const rMarcoBom = avaliarToleranciaIncra('M', 0.08);
  assert.equal(rMarcoBom.conforme, true);
  assert.equal(rMarcoBom.limite, 0.10);

  // Marco com 0.12m de sigma -> Não conforme
  const rMarcoRuim = avaliarToleranciaIncra('M', 0.12);
  assert.equal(rMarcoRuim.conforme, false);
  assert.ok(rMarcoRuim.diferenca > 0);

  // Vértice Virtual com 0.45m -> Conforme
  const rVerticeBom = avaliarToleranciaIncra('V', 0.45);
  assert.equal(rVerticeBom.conforme, true);

  // Ponto Natural com 2.50m -> Conforme
  const rPontoBom = avaliarToleranciaIncra('P', 2.50);
  assert.equal(rPontoBom.conforme, true);
});

test('formatarAzimuteDMS formata sexagesimal com graus, minutos e segundos', () => {
  // 90 graus exatos -> 90° 00' 00.00"
  assert.equal(formatarAzimuteDMS(90), `90° 00' 00.00"`);

  // 125.5 graus -> 125° 30' 00.00"
  assert.equal(formatarAzimuteDMS(125.5), `125° 30' 00.00"`);
});

test('calcularDistanciaAzimute calcula distância plana e orientação correta', () => {
  const p1 = { e: 1000, n: 1000 };
  const p2 = { e: 1000, n: 1100 }; // 100m para o norte -> azimute 0°

  const calc = calcularDistanciaAzimute(p1, p2);
  assert.equal(calc.distancia, 100);
  assert.equal(calc.azimuteDec, 0);

  const pLeste = { e: 1100, n: 1000 }; // 100m para o leste -> azimute 90°
  const calcLeste = calcularDistanciaAzimute(p1, pLeste);
  assert.equal(calcLeste.distancia, 100);
  assert.equal(calcLeste.azimuteDec, 90);
});

test('calcularAreaGaussShoelace calcula área e perímetro com precisão milimétrica', () => {
  // Retângulo 100m x 200m = 20.000 m² = 2.0000 ha
  const retangulo = [
    { e: 1000, n: 1000 },
    { e: 1100, n: 1000 },
    { e: 1100, n: 1200 },
    { e: 1000, n: 1200 }
  ];

  const resultado = calcularAreaGaussShoelace(retangulo);
  assert.equal(resultado.areaM2, 20000);
  assert.equal(resultado.areaHa, 2.0);
  assert.equal(resultado.perimetroM, 600);
});
