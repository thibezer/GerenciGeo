import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aplicarMascaraCPF,
  validarCPF,
  totalVertices,
  filtrarProfissionais,
  renderLinhasProfissionais,
  renderLinhasBancoPontos
} from '../src/views/configuracoes/configuracoes_helpers';
import type { Profissional } from '../src/views/configuracoes/configuracoes_helpers';

const prof = (extra: Partial<Profissional>): Profissional => ({ id: 1, nome: 'Dimas de Assis Ribeiro', ...extra });
const lista: Profissional[] = [
  prof({ id: 1, formacao: 'Técnico em Agrimensura', cpf: '529.982.247-25', conselho: 'CFTA', registro: 'CFTA-PR-123', codigo_credenciado: 'XRXR', contador_p: 164, contador_m: 4 }),
  prof({ id: 2, nome: 'Ágata Lima', formacao: 'Engenheira Agrônoma', cpf: '111.444.777-35' })
];
const ids = (l: Profissional[]) => l.map(x => x.id);

test('máscara de CPF é progressiva e corta em 11 dígitos', () => {
  assert.equal(aplicarMascaraCPF('52998'), '529.98');
  assert.equal(aplicarMascaraCPF('52998224725'), '529.982.247-25');
  assert.equal(aplicarMascaraCPF('529.982.247-25999'), '529.982.247-25');
  assert.equal(aplicarMascaraCPF('abc'), '');
});

test('CPF: aceita válido (com ou sem máscara); rejeita dígito errado, tamanho errado e repetidos', () => {
  assert.equal(validarCPF('529.982.247-25'), true);
  assert.equal(validarCPF('52998224725'), true);
  assert.equal(validarCPF('111.444.777-35'), true);
  assert.equal(validarCPF('529.982.247-24'), false);
  assert.equal(validarCPF('529.982.247'), false);
  assert.equal(validarCPF('111.111.111-11'), false);
  assert.equal(validarCPF(''), false);
});

test('vértices somam M + P + V tratando ausente como zero', () => {
  assert.equal(totalVertices(lista[0]), 168);
  assert.equal(totalVertices(lista[1]), 0);
});

test('busca ignora acento/caixa e olha nome, formação, registro, código e CPF com ou sem máscara', () => {
  assert.deepEqual(ids(filtrarProfissionais(lista, 'agata')), [2]);
  assert.deepEqual(ids(filtrarProfissionais(lista, 'agrimensura')), [1]);
  assert.deepEqual(ids(filtrarProfissionais(lista, 'cfta-pr')), [1]);
  assert.deepEqual(ids(filtrarProfissionais(lista, 'xrxr')), [1]);
  assert.deepEqual(ids(filtrarProfissionais(lista, '529.982')), [1]);
  assert.deepEqual(ids(filtrarProfissionais(lista, 'zzz')), []);
});

test('linhas escapam todo o cadastro (antes nome, formação e endereços entravam crus no HTML)', () => {
  const html = renderLinhasProfissionais([prof({
    id: 9, nome: '<img src=x onerror=alert(1)>', formacao: '<b>Eng</b>', registro: '<i>1</i>', conselho: 'CREA', codigo_credenciado: '<u>X</u>', cpf: '<s>1</s>'
  })]);
  for (const cru of ['<img', '<b>Eng', '<i>1', '<u>X', '<s>1']) assert.ok(!html.includes(cru), `sem ${cru}`);
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('data-action="banco"') && html.includes('data-action="editar"') && html.includes('data-action="excluir"'));
});

test('banco de pontos escapa código e propriedade e tolera data inválida', () => {
  const html = renderLinhasBancoPontos([{ codigo_completo: '<b>X</b>', tipo_ponto: 'P', numero: 7, nome_propriedade: '<script>1</script>', created_at: 'lixo' }]);
  assert.ok(!html.includes('<b>X'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('—'));
  assert.ok(renderLinhasBancoPontos([{ codigo_completo: 'A', tipo_ponto: 'M', numero: 1 }]).includes('[Arquivo Desvinculado]'));
});
