import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatarFaixa,
  filtrarProjetos,
  ordenarLinhasProjeto,
  linhasTerceiros,
  descreverDivergencia,
  resumirUso
} from '../src/views/contagem_pontos/contagem_helpers';
import { renderContagemConteudo } from '../src/views/contagem_pontos/contagem_template';
import type { ContagemCodigo, ContagemPontos, ContagemProjeto, ContagemTipo } from '../src/views/contagem_pontos/contagem_service';

const tipo = (extra: Partial<ContagemTipo>): ContagemTipo => ({
  tipo: 'P', total: 3, minimo: 1, maximo: 3, isolados: [], proximo: 4, proximo_nome: 'XRXR-P-0004',
  faixas: [[1, 3]], lacunas: [], total_lacunas: 0, projetos: 1, ...extra
});

const projeto = (extra: Partial<ContagemProjeto>): ContagemProjeto => ({
  levantamento_id: 1, propriedade: 'Fazenda Sul', municipio: 'Iporã', uf: 'PR', status: 'EM_ANDAMENTO',
  total_pontos: 5, fora_do_padrao: 0,
  itens: [{ codigo: 'XRXR', tipo: 'P', meu: true, quantidade: 5, faixas: [[1, 5]] }], ...extra
});

const projetos: ContagemProjeto[] = [
  projeto({ levantamento_id: 1, propriedade: 'Sítio Ágata', total_pontos: 5 }),
  projeto({ levantamento_id: 2, propriedade: 'Zeca', total_pontos: 50, fora_do_padrao: 2 }),
  projeto({
    levantamento_id: 3, propriedade: 'Beto', total_pontos: 9,
    itens: [{ codigo: 'AYC', tipo: 'M', meu: false, quantidade: 9, faixas: [[2231, 2239]] }]
  }),
  projeto({ levantamento_id: 4, propriedade: 'Sem pontos', total_pontos: 0, itens: [] })
];
const ids = (l: { p: ContagemProjeto }[]) => l.map(x => x.p.levantamento_id);

test('faixa: ponto único sem repetir e intervalo com travessão', () => {
  assert.equal(formatarFaixa([7, 7]), '0007');
  assert.equal(formatarFaixa([1, 184]), '0001–0184');
});

test('filtro: só meus pontos esconde terceiros e projetos vazios; incluir terceiros traz de volta', () => {
  const base = { termo: '', incluirTerceiros: false, somenteComPontos: true };
  assert.deepEqual(ids(filtrarProjetos(projetos, base)), [1, 2]);
  assert.deepEqual(ids(filtrarProjetos(projetos, { ...base, incluirTerceiros: true })), [1, 2, 3]);
  assert.deepEqual(ids(filtrarProjetos(projetos, { ...base, somenteComPontos: false })), [1, 2, 3, 4]);
});

test('filtro: busca ignora acento/caixa e casa com id exato ou CODIGO-TIPO', () => {
  const base = { incluirTerceiros: true, somenteComPontos: true };
  assert.deepEqual(ids(filtrarProjetos(projetos, { ...base, termo: 'agata' })), [1]);
  assert.deepEqual(ids(filtrarProjetos(projetos, { ...base, termo: '2' })), [2]);
  assert.deepEqual(ids(filtrarProjetos(projetos, { ...base, termo: 'ayc-m' })), [3]);
  assert.deepEqual(ids(filtrarProjetos(projetos, { ...base, termo: 'xrxr' })), [1, 2]);
});

test('ordenação: nome sem acento, pontos desc, fora do padrão; não muta a entrada', () => {
  const linhas = filtrarProjetos(projetos, { termo: '', incluirTerceiros: true, somenteComPontos: false });
  assert.deepEqual(ids(ordenarLinhasProjeto(linhas, 'nome', 'asc')), [3, 4, 1, 2]);
  assert.deepEqual(ids(ordenarLinhasProjeto(linhas, 'pontos', 'desc')), [2, 3, 1, 4]);
  assert.deepEqual(ids(ordenarLinhasProjeto(linhas, 'fora', 'desc'))[0], 2);
  assert.deepEqual(ids(linhas), [1, 2, 3, 4]);
});

test('terceiros: uma linha por código/tipo e filtro pelo código; meus ficam de fora', () => {
  const codigos: ContagemCodigo[] = [
    { codigo: 'XRXR', meu: true, profissional: 'Dimas', tipos: { P: tipo({}) } },
    { codigo: 'AYC', meu: false, profissional: null, tipos: { M: tipo({ tipo: 'M', total: 4 }), V: tipo({ tipo: 'V', total: 1 }) } },
    { codigo: 'BJQ', meu: false, profissional: null, tipos: { P: tipo({ total: 28 }) } }
  ];
  assert.deepEqual(linhasTerceiros(codigos, '').map(l => `${l.codigo}-${l.tipo}`), ['AYC-M', 'AYC-V', 'BJQ-P']);
  assert.deepEqual(linhasTerceiros(codigos, 'bj').map(l => l.codigo), ['BJQ']);
});

test('divergência e resumo de uso', () => {
  assert.equal(descreverDivergencia(tipo({})), null);
  assert.match(descreverDivergencia(tipo({ divergencia_contador: true, contador_cadastrado: 170, maximo: 184 })) || '', /marca 170.*184/);
  assert.equal(resumirUso(tipo({ minimo: 1, maximo: 4 })), 'Usados 0001–0004');
  assert.equal(resumirUso(tipo({ total: 0 })), 'Nenhum ponto usado ainda');
});

test('conteúdo: cada bloco de tipo é fechado (regressão: ui-card era fechado com </div>) e o nome é escapado', () => {
  const dados: ContagemPontos = {
    codigos: [{
      codigo: 'XRXR', meu: true, profissional: '<b>Dimas</b>',
      tipos: {
        M: tipo({ tipo: 'M', proximo_nome: 'XRXR-M-0005' }),
        P: tipo({ lacunas: [[5, 7]], total_lacunas: 3 }),
        V: tipo({ tipo: 'V', isolados: [9999] })
      }
    }],
    projetos: [], conflitos: [{ nome: 'XRXR-P-0171', levantamentos: [13, 157] }]
  };
  const html = renderContagemConteudo(dados);
  assert.ok(!html.includes('<b>Dimas'));
  assert.ok(html.includes('&lt;b&gt;Dimas'));
  assert.equal(html.split('<ui-card').length, html.split('</ui-card>').length, 'ui-card aberto sem fechar');
  assert.equal(html.split('<div').length, html.split('</div>').length, 'div aberta sem fechar');
  assert.ok(html.includes('data-teste="proximo-XRXR-M"'));
  assert.ok(html.includes('XRXR-P-0171'));
});
