import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatarAreaCcir,
  formatarPercentualCcir,
  formatarDataImportacao,
  ordenarResultadosCcir,
  renderCcirResultadosTabela,
  renderPlanilhasImportadas
} from '../src/views/ccir/ccir_helpers';

const reg = (extra: Record<string, unknown>) => ({
  codigo_imovel: '9999979400039', denominacao: 'Chácara', municipio: 'Dourad', uf: 'PR',
  area_total: 6.05, titular: 'JOSE ***', percentual_detencao: 100, ...extra
});

const dados = [
  reg({ codigo_imovel: '3', denominacao: 'Zeca', area_total: 50, percentual_detencao: 25 }),
  reg({ codigo_imovel: '10', denominacao: 'Ágata', area_total: 5, percentual_detencao: null }),
  reg({ codigo_imovel: '2', denominacao: 'Beto', area_total: null, percentual_detencao: 100 })
];
const cods = (l: any[]) => l.map(r => r.codigo_imovel);

test('formatação: área com 4 casas e vírgula, percentual com 2 e %, ausente vira vazio', () => {
  assert.equal(formatarAreaCcir(6.05), '6,0500');
  assert.equal(formatarAreaCcir(null), '');
  assert.equal(formatarPercentualCcir(33.333), '33,33%');
  assert.equal(formatarPercentualCcir(undefined), '');
  assert.equal(formatarDataImportacao('2026-06-24 01:54:08'), '24/06 01:54');
  assert.equal(formatarDataImportacao(''), '—');
});

test('ordenação: denominação sem acento, código numérico, valor ausente sempre no fim', () => {
  assert.deepEqual(cods(ordenarResultadosCcir(dados, 'imovel', 'asc')), ['10', '2', '3']);
  assert.deepEqual(cods(ordenarResultadosCcir(dados, 'codigo', 'asc')), ['2', '3', '10']);
  assert.deepEqual(cods(ordenarResultadosCcir(dados, 'area', 'desc')), ['3', '10', '2']);
  assert.deepEqual(cods(ordenarResultadosCcir(dados, 'area', 'asc')), ['10', '3', '2']);
  assert.deepEqual(cods(ordenarResultadosCcir(dados, 'pct', 'desc')), ['2', '3', '10']);
  assert.deepEqual(cods(dados), ['3', '10', '2']);
});

test('linhas escapam denominação/titular e vazio oferece limpar filtros', () => {
  const html = renderCcirResultadosTabela([reg({ denominacao: '<img src=x onerror=alert(1)>', titular: '<b>X</b>' })]);
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<b>X'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('class="ccir-row"') || html.includes('ccir-row'));
  assert.ok(renderCcirResultadosTabela([]).includes('data-estado-acao="limpar"'));
});

test('planilhas: escapa o nome do arquivo e formata a contagem', () => {
  const html = renderPlanilhasImportadas([{ arquivo_origem: '<b>a</b>.csv', total_registros: 1920, data_importacao: '2026-06-24 01:54:08' }]);
  assert.ok(!html.includes('<b>a'));
  assert.ok(html.includes('1.920') || html.includes('1920'));
  assert.ok(html.includes('btn-delete-ccir-file'));
});
