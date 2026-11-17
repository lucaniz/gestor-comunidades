// Tests de la lógica de negocio: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
const GC = createRequire(import.meta.url)('../js/core.js');

test('IBAN: valida dígitos de control', () => {
  assert.equal(GC.ibanValid('ES91 2100 0418 4502 0005 1332'), true);
  assert.equal(GC.ibanValid('ES9121000418450200051333'), false);
  assert.equal(GC.ibanValid('ES91210004184502000513'), false); // longitud española incorrecta
  assert.equal(GC.ibanFmt('es9121000418450200051332'), 'ES91 2100 0418 4502 0005 1332');
});

test('Identificador de acreedor SEPA (AT-02)', () => {
  // Ejemplo oficial alemán: DE98ZZZ09999999999 → mismo algoritmo con prefijo ES.
  const mod = GC.mod97('09999999999' + 'DE00');
  assert.equal(98 - mod, 98);
  assert.equal(GC.creditorId('H85512347'), 'ES67000H85512347');
  assert.equal(GC.creditorId('H-85512347', 'ab'), 'ES67AB0H85512347');
  assert.equal(GC.creditorId(''), '');
});

test('Importes con formato español', () => {
  assert.equal(GC.num('1.234,56'), 1234.56);
  assert.equal(GC.num('12,5 %'), 12.5);
  assert.equal(GC.num('3600'), 3600);
  assert.equal(GC.num(''), 0);
});

test('Reparto por coeficiente cuadra al céntimo', () => {
  const u = [16.5, 10.5, 12, 11, 12, 11, 13.5, 13.5].map(coef => ({ coef }));
  const r = GC.splitByCoef(u, 3600);
  assert.deepEqual(r.map(x => x.imp), [594, 378, 432, 396, 432, 396, 486, 486]);
  const r3 = GC.splitByCoef([{ coef: 33.33 }, { coef: 33.33 }, { coef: 33.34 }], 100);
  assert.equal(GC.sum(r3.map(x => x.imp)), 100);
  const odd = GC.splitByCoef([{ coef: 1 }, { coef: 1 }, { coef: 1 }], 100);
  assert.equal(GC.sum(odd.map(x => x.imp)), 100);
  assert.deepEqual(GC.splitByCoef([{ coef: 0 }], 100), []);
  // Coeficientes que no suman 100: reparto proporcional.
  const p = GC.splitByCoef([{ coef: 20 }, { coef: 30 }], 1000);
  assert.deepEqual(p.map(x => x.imp), [400, 600]);
});

test('CSV: comillas, separador ; y BOM', () => {
  const rows = GC.parseCSV('﻿ref;coef;propietario\n"1º A";12,5;"Pérez; Juan"\r\n2B;10;Ana\n');
  assert.deepEqual(rows, [['ref', 'coef', 'propietario'], ['1º A', '12,5', 'Pérez; Juan'], ['2B', '10', 'Ana']]);
  assert.ok(GC.toCSV(['a'], [['x;y']]).includes('"x;y"'));
});

test('Remesa SEPA pain.008: totales, juego de caracteres y escapes', () => {
  const xml = GC.buildPain008({
    msgId: 'REM-20261117-AB', creDtTm: '2026-11-17T21:30:00', cdtrNm: 'C.P. Calle Alameda 14 & Cía',
    cdtrIban: 'ES9121000418450200051332', cdtrBic: '', cdtrId: GC.creditorId('H85512347'), fecha: '2026-11-24',
    items: [
      { e2e: 'Rdemo-1', importe: 594, mandato: 'ALA14-001', mandatoFecha: '2024-02-01', nombre: 'Farmacia Alameda S.L.', iban: 'ES9121000418450200051332', concepto: 'Bajo A Cuota 2026-T4' },
      { e2e: 'R2', importe: 378.1, mandato: 'ALA14-002', mandatoFecha: '2024-02-01', nombre: 'Tomás Ibáñez Rey', iban: 'ES9121000418450200051332', concepto: '1º B Cuota 2026-T4' }
    ]
  });
  assert.match(xml, /<NbOfTxs>2<\/NbOfTxs>/);
  assert.match(xml, /<CtrlSum>972.10<\/CtrlSum>/);
  assert.match(xml, /<Nm>Tomas Ibanez Rey<\/Nm>/);
  assert.match(xml, /<Ustrd>1 B Cuota 2026-T4<\/Ustrd>/);
  assert.ok(!xml.includes('&'), 'los caracteres fuera de SEPA se sustituyen');
  mkdirSync('tests/out', { recursive: true });
  writeFileSync('tests/out/remesa.xml', xml); // CI la valida contra el XSD oficial
});
