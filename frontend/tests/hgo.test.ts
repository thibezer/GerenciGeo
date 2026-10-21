import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classificarLog,
  lerProgressoDaLinha,
  extrairProgresso,
  percentual,
  estadoHgo
} from '../src/views/hgo/hgo_helpers';

test('log: erro vence aviso e sucesso; palavras-chave em qualquer caixa', () => {
  assert.equal(classificarLog('Falha ao converter arquivo'), 'erro');
  assert.equal(classificarLog('erro: sucesso parcial'), 'erro');
  assert.equal(classificarLog('Atenção: base sem rover'), 'aviso');
  assert.equal(classificarLog('Pasta criada com sucesso'), 'sucesso');
  assert.equal(classificarLog('Lendo cabeçalho do arquivo'), 'info');
});

test('progresso: lê [n/m] e "n de m"; sem número devolve null', () => {
  assert.deepEqual(lerProgressoDaLinha('Convertendo arquivo [1/15]'), { processados: 1, total: 15 });
  assert.deepEqual(lerProgressoDaLinha('Processados 7 de 20 arquivos'), { processados: 7, total: 20 });
  assert.equal(lerProgressoDaLinha('Iniciando...'), null);
});

test('progresso: vale a última linha que informa; total 0 é ignorado', () => {
  assert.deepEqual(extrairProgresso(['[1/4]', 'texto', '[3/4]', 'fim']), { processados: 3, total: 4 });
  assert.equal(extrairProgresso(['nada', 'aqui']), null);
  assert.equal(extrairProgresso(['[0/0]']), null);
});

test('percentual arredonda e fica entre 0 e 100', () => {
  assert.equal(percentual({ processados: 1, total: 3 }), 33);
  assert.equal(percentual({ processados: 15, total: 15 }), 100);
  assert.equal(percentual({ processados: 99, total: 15 }), 100);
});

test('estado: erro tem prioridade, depois progresso, depois pasta', () => {
  assert.equal(estadoHgo(false, null), 'sem-pasta');
  assert.equal(estadoHgo(true, null), 'pronto');
  assert.equal(estadoHgo(true, { processados: 2, total: 5 }), 'processando');
  assert.equal(estadoHgo(true, { processados: 5, total: 5 }), 'concluido');
  assert.equal(estadoHgo(true, { processados: 2, total: 5 }, 'ERRO: arquivo corrompido'), 'erro');
});
