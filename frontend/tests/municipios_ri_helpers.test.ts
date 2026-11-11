import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatarCNS } from '../src/utils';
import {
  MUNICIPIOS_PARANA,
  mesclarCatalogoMunicipios,
  acharMunicipioCatalogo,
  mapearCnsParaMunicipios,
  formatarRotuloMunicipioDatalist,
  cnsEhCompleto
} from '../src/views/propriedades/municipios_ri_helpers';

test('lista oficial do Paraná contém exatamente os 399 municípios limpos', () => {
  assert.equal(MUNICIPIOS_PARANA.length, 399);
  assert.equal(new Set(MUNICIPIOS_PARANA).size, 399);
  assert.ok(MUNICIPIOS_PARANA.includes('Alto Paraíso'));
  assert.ok(!MUNICIPIOS_PARANA.includes('Alto Paraíso (3)'));
  assert.equal(MUNICIPIOS_PARANA[0], 'Abatiá');
  assert.equal(MUNICIPIOS_PARANA[MUNICIPIOS_PARANA.length - 1], 'Xambrê');
});

test('formatarCNS aplica máscara XX.XXX-X para 6 dígitos', () => {
  assert.equal(formatarCNS(''), '');
  assert.equal(formatarCNS('08'), '08');
  assert.equal(formatarCNS('08123'), '08.123');
  assert.equal(formatarCNS('081234'), '08.123-4');
  assert.equal(formatarCNS('08.123-4999'), '08.123-4');
  assert.equal(cnsEhCompleto('08.123-4'), true);
  assert.equal(cnsEhCompleto('08.123'), false);
});

test('mesclarCatalogoMunicipios preserva acento oficial, vários RIs por cidade e CNS compartilhado', () => {
  const mesclado = mesclarCatalogoMunicipios([
    { municipio: 'Cascavel', uf: 'PR', ris: [{ cns: '081111', oficio: '1º Ofício' }, { cns: '08.222-2', oficio: '2º Ofício' }] },
    { municipio: 'Iporã', uf: 'PR', ris: [{ cns: '08.123-4', oficio: '1º Ofício' }] },
    { municipio: 'Cafezal do Sul', uf: 'PR', ris: [{ cns: '08.123-4', oficio: '1º Ofício' }] },
    { municipio: 'Xambre', uf: 'PR', ris: [{ cns: '09.999-8', oficio: 'Ofício Único' }] },
    { municipio: 'Naviraí', uf: 'MS', ris: [{ cns: '11.222-3', oficio: '1º Ofício' }] },
  ]);

  // 399 PR + 1 MS (Xambre deve ter mesclado em Xambrê!)
  assert.equal(mesclado.length, 400);

  const xambre = acharMunicipioCatalogo(mesclado, 'xambre', 'PR');
  assert.ok(xambre);
  assert.equal(xambre.municipio, 'Xambrê');
  assert.deepEqual(xambre.ris, [{ cns: '09.999-8', oficio: 'Ofício Único' }]);

  const cascavel = acharMunicipioCatalogo(mesclado, 'Cascavel', 'PR');
  assert.ok(cascavel);
  assert.equal(cascavel.ris.length, 2);
  assert.match(formatarRotuloMunicipioDatalist(cascavel), /2 RIs/);

  const porCns = mapearCnsParaMunicipios(mesclado);
  const cob = porCns.get('08.123-4');
  assert.ok(cob);
  assert.equal(cob.oficio, '1º Ofício');
  assert.deepEqual(cob.municipios, ['Cafezal do Sul/PR', 'Iporã/PR']);
});
