import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  filtrarClientes,
  aplicarMascaraCpfCnpj,
  ehPessoaJuridica,
  montarEnderecoDetalhe,
  montarConfirmacaoExclusao,
  renderOpcoesRepresentanteHtml,
  renderDocumentosTabelaHtml,
  calcularEstatisticasClientes,
  listarPendenciasCliente,
  filtrarPorSegmento,
  contarSegmentos,
  ordenarClientes,
  renderLinhasTabelaHtml
} from '../src/views/clientes/clientes_helpers';
import type { Cliente } from '../src/types';

const cli = (extra: Partial<Cliente>): Cliente => ({ id: 1, nome_completo: 'Sem Nome', cpf_cnpj: '', ...extra } as Cliente);

const clientes: Cliente[] = [
  cli({ id: 1, nome_completo: 'João da Silva', cpf_cnpj: '52998224725', email: 'joao@x.com', telefone: '(44) 99911-2233' }),
  cli({ id: 2, nome_completo: 'Maria Souza', cpf_cnpj: '11144477735' }),
  cli({ id: 3, nome_completo: 'Agro Silva Ltda', razao_social: 'Agro Silva Ltda', cpf_cnpj: '11222333000181', tipo_pessoa: 'PJ' }),
  cli({ id: 4, nome_completo: 'Fazenda Nova S/A', cpf_cnpj: '12ABC34501DE35', tipo_pessoa: 'PJ' })
];
const ids = (lista: Cliente[]) => lista.map(c => c.id);

test('busca por nome sem dígitos filtra de verdade (antes casava com todos via includes(""))', () => {
  assert.deepEqual(ids(filtrarClientes(clientes, 'silva')), [1, 3]);
  assert.deepEqual(ids(filtrarClientes(clientes, 'zzz-inexistente')), []);
});

test('busca ignora acentos e caixa e olha e-mail', () => {
  assert.deepEqual(ids(filtrarClientes(clientes, 'JOAO')), [1]);
  assert.deepEqual(ids(filtrarClientes(clientes, 'joao@x')), [1]);
});

test('busca por CPF/CNPJ aceita máscara parcial e CNPJ alfanumérico', () => {
  assert.deepEqual(ids(filtrarClientes(clientes, '529.982')), [1]);
  assert.deepEqual(ids(filtrarClientes(clientes, '11.222.333/0001-81')), [3]);
  assert.deepEqual(ids(filtrarClientes(clientes, '12.abc.345/01de-35')), [4]);
});

test('busca por telefone exige ao menos 3 dígitos e termo vazio devolve a lista inteira', () => {
  assert.deepEqual(ids(filtrarClientes(clientes, '99911')), [1]);
  assert.equal(filtrarClientes(clientes, '   ').length, clientes.length);
});

test('máscara de CPF, CNPJ numérico e CNPJ alfanumérico', () => {
  assert.equal(aplicarMascaraCpfCnpj('52998224725'), '529.982.247-25');
  assert.equal(aplicarMascaraCpfCnpj('11222333000181'), '11.222.333/0001-81');
  assert.equal(aplicarMascaraCpfCnpj('12abc34501de35'), '12.ABC.345/01DE-35');
});

test('CNPJ alfanumérico é reconhecido como pessoa jurídica mesmo sem tipo_pessoa', () => {
  assert.equal(ehPessoaJuridica({ cpf_cnpj: '12.ABC.345/01DE-35' }), true);
  assert.equal(ehPessoaJuridica({ cpf_cnpj: '529.982.247-25' }), false);
  assert.equal(ehPessoaJuridica({ cpf_cnpj: '', tipo_pessoa: 'PJ' }), true);
  const stats = calcularEstatisticasClientes(clientes);
  assert.equal(stats.pj, 2);
  assert.equal(stats.pf, 2);
});

test('select de representante escapa nome e não lista PJ', () => {
  const html = renderOpcoesRepresentanteHtml([
    cli({ id: 10, pessoa_id: 100, nome_completo: '<img src=x onerror=alert(1)>', cpf_cnpj: '52998224725' }),
    cli({ id: 11, nome_completo: 'Empresa', cpf_cnpj: '11222333000181', tipo_pessoa: 'PJ' })
  ], 100);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('Empresa'));
  assert.ok(html.includes('value="100" selected'));
});

test('endereço de detalhe não fabrica separadores quando faltam partes', () => {
  assert.equal(montarEnderecoDetalhe(cli({})), '');
  assert.equal(
    montarEnderecoDetalhe(cli({ endereco_completo: 'Rua A, 10', bairro: 'Centro', cidade: 'Cascavel', estado: 'PR', cep: '85800000' })),
    'Rua A, 10 - Centro · Cascavel/PR · CEP: 85800-000'
  );
  assert.equal(montarEnderecoDetalhe(cli({ cidade: 'Cascavel' })), 'Cascavel');
});

test('confirmação de exclusão avisa sobre vínculos com propriedades e limita a lista de nomes', () => {
  const unico = montarConfirmacaoExclusao([cli({ nome_completo: 'Ana', total_propriedades: 2 })]);
  assert.match(unico, /Excluir este cliente\?/);
  assert.match(unico, /2 vínculo\(s\) com propriedades/);

  const muitos = montarConfirmacaoExclusao(Array.from({ length: 8 }, (_, i) => cli({ id: i, nome_completo: `C${i}` })));
  assert.match(muitos, /Excluir 8 clientes\?/);
  assert.match(muitos, /e mais 3/);
  assert.doesNotMatch(muitos, /Atenção/);
});

test('link do PDF anexado usa a base da API', () => {
  const html = renderDocumentosTabelaHtml([
    { id: 7, tipo_documento: 'RG', numero: '1', arquivo_nome: 'rg.pdf' } as never
  ], 3);
  assert.match(html, /href="http:\/\/127\.0\.0\.1:8000\/clientes\/3\/documentos\/7\/arquivo"/);
});

import { deveAnexarAutorizacao } from '../src/utils/fetch_autenticado';

test('token só vai para a API do app e nunca para login/cadastro ou para sites de terceiros', () => {
  const base = 'http://127.0.0.1:8000';
  assert.equal(deveAnexarAutorizacao(`${base}/clientes`, base), true);
  assert.equal(deveAnexarAutorizacao('/clientes/3/revelar-senha', base), true);
  assert.equal(deveAnexarAutorizacao('/api.php/clientes', base), true);
  assert.equal(deveAnexarAutorizacao('https://viacep.com.br/ws/85800000/json/', base), false);
  assert.equal(deveAnexarAutorizacao('https://servicodados.ibge.gov.br/api/v1/localidades', base), false);
  assert.equal(deveAnexarAutorizacao(`${base}/auth/login`, base), false);
  assert.equal(deveAnexarAutorizacao(`${base}/auth/register`, base), false);
  assert.equal(deveAnexarAutorizacao('/api.php?action=login', base), false);
  assert.equal(deveAnexarAutorizacao(`${base}/auth/me`, base), true);
});

test('pendências: cônjuge faltando, CNH vencida e sem contato; cadastro completo não tem nenhuma', () => {
  const codigos = (c: Cliente) => listarPendenciasCliente(c).map(p => p.codigo);
  assert.deepEqual(codigos(cli({ estado_civil: 'Casado(a)', nome_conjuge: ' ', telefone: '44999990000' })), ['conjuge']);
  assert.deepEqual(codigos(cli({ cnh_validade: '2000-01-01', email: 'a@b.com' })), ['cnh-vencida']);
  assert.deepEqual(codigos(cli({})), ['sem-contato']);
  assert.deepEqual(codigos(cli({ estado_civil: 'Solteiro(a)', telefone: '44999990000' })), []);
});

test('segmentos: PF, PJ e pendências filtram e a contagem cobre a lista inteira', () => {
  assert.deepEqual(ids(filtrarPorSegmento(clientes, 'pj')), [3, 4]);
  assert.deepEqual(ids(filtrarPorSegmento(clientes, 'pf')), [1, 2]);
  assert.equal(filtrarPorSegmento(clientes, 'todos'), clientes);
  // só o cliente 1 tem contato; os demais caem em "sem contato"
  assert.deepEqual(ids(filtrarPorSegmento(clientes, 'pendencias')), [2, 3, 4]);
  assert.deepEqual(contarSegmentos(clientes), { todos: 4, pf: 2, pj: 2, pendencias: 3 });
});

test('ordenação: nome sem acento/caixa, vínculos desc, cidade vazia sempre no fim, sem mutar a entrada', () => {
  const lista = [
    cli({ id: 1, nome_completo: 'Ágata', cidade: 'Umuarama', total_propriedades: 1 }),
    cli({ id: 2, nome_completo: 'beto', cidade: '', total_propriedades: 3, total_levantamentos: 2 }),
    cli({ id: 3, nome_completo: 'Zeca', cidade: 'Douradina', total_levantamentos: 1 })
  ];
  assert.deepEqual(ids(ordenarClientes(lista, 'nome', 'asc')), [1, 2, 3]);
  assert.deepEqual(ids(ordenarClientes(lista, 'nome', 'desc')), [3, 2, 1]);
  assert.deepEqual(ids(ordenarClientes(lista, 'vinculos', 'desc')), [2, 1, 3]);
  assert.deepEqual(ids(ordenarClientes(lista, 'cidade', 'asc')), [3, 1, 2]);
  assert.deepEqual(ids(lista), [1, 2, 3]);
});

test('linhas da tabela escapam nome e marcam a seleção', () => {
  const html = renderLinhasTabelaHtml(
    [cli({ id: 7, nome_completo: '<img src=x onerror=alert(1)>', cpf_cnpj: '52998224725' })],
    new Set([7])
  );
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('is-sel'));
  assert.ok(html.includes('data-id="7"'));
});
