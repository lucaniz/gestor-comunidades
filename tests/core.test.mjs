// Tests de la lógica de negocio: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
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

test('Repartos especiales: exentos y presupuesto por partidas', () => {
  const us = [
    { ref: 'Bajo', coef: 20, coefs: { asc: 0, gar: 0 } },
    { ref: '1º', coef: 40, coefs: { asc: 50, gar: 1 } },
    { ref: '2º', coef: 40, coefs: { asc: 50 } }
  ];
  assert.equal(GC.coefOf(us[0], 'general'), 20);
  assert.equal(GC.coefOf(us[2], 'gar'), 0);
  const asc = GC.splitByCoef(us, 100, 'asc');
  assert.deepEqual(asc.map(x => [x.u.ref, x.imp]), [['1º', 50], ['2º', 50]]); // el bajo no paga ascensor
  const partidas = [{ importe: 4000, reparto: 'general' }, { importe: 1200, reparto: 'asc' }, { importe: 400, reparto: 'gar' }];
  const c = GC.cuotaPresupuesto(us, partidas, 4);
  assert.deepEqual(c.map(x => x.imp), [200, 650, 550]);   // 1000·coef + 300 ascensor + 100 garaje
  assert.equal(GC.sum(c.map(x => x.imp)), (4000 + 1200 + 400) / 4);
  assert.deepEqual(c[1].desglose, { general: 400, asc: 150, gar: 100 });
});

test('Extracto Norma 43: cabecera, movimientos, conceptos y saldo final', () => {
  const txt = readFileSync(new URL('../ejemplos/extracto_alameda14_noviembre.n43', import.meta.url), 'utf8');
  const [c] = GC.parseNorma43(txt);
  assert.equal(c.banco + c.oficina + c.cuenta, '210004180200051332');
  assert.equal(c.saldoInicial, 9596);
  assert.equal(c.movimientos.length, 6);
  assert.deepEqual([c.movimientos[0].fecha, c.movimientos[0].importe], ['2026-11-03', 650]);
  assert.equal(c.movimientos[4].importe, -12.1);
  assert.equal(c.movimientos[1].concepto, 'RECIBO LIMPIEZAS BRILLO SL');
  assert.equal(c.saldoFinal, GC.r2(9596 + 650 + 396 - 290 - 385 - 12.1 - 1180));
});

test('Devoluciones SEPA pain.002', () => {
  const xml = readFileSync(new URL('../ejemplos/devoluciones_ejemplo.xml', import.meta.url), 'utf8');
  const r = GC.parsePain002(xml, DOMParser);
  assert.deepEqual(r, [{ e2e: 'Rdemo-r-demo-c1-2026-T4-5', estado: 'RJCT', motivo: 'AM04', motivoTexto: 'Fondos insuficientes', importe: 432 }]);
  assert.equal(GC.e2eRecibo('demo-r-demo-c1-2026-T4-5'), 'Rdemo-r-demo-c1-2026-T4-5');
  assert.ok(GC.e2eRecibo('0f8fad5b-d9cb-469f-a165-70867728950e').length <= 35);
});

test('Conciliación: parecido entre concepto bancario y nombre', () => {
  assert.equal(GC.parecido('TRANSF DE ELENA NAVARRO RUIZ CUOTA 2B', 'Elena Navarro Ruiz'), 1);
  assert.equal(GC.parecido('RECIBO LIMPIEZAS BRILLO SL', 'Fontanería Ramos'), 0);
});

test('Correo entrante: aviso de Postmark y formato genérico', async () => {
  const { normalizar, quitarHtml } = await import('../supabase/functions/correo-entrante/normalizar.mjs');
  const pm = JSON.parse(readFileSync(new URL('../ejemplos/correo_postmark_ejemplo.json', import.meta.url), 'utf8'));
  const m = normalizar(pm);
  assert.equal(m.de, 'elena@ejemplo.es');
  assert.equal(m.nombre, 'Elena Navarro Ruiz');
  assert.equal(m.para, 'comunidades@ejemplo.es');
  assert.equal(m.fecha, '2026-11-14T09:12');
  assert.match(m.texto, /transferencia por las dos cuotas/);
  assert.deepEqual(m.adjuntos, [{ nombre: 'justificante.pdf', tipo: 'application/pdf', bytes: 48213 }]);
  assert.ok(!JSON.stringify(m).includes('JVBERi0'), 'no se guarda el contenido de los adjuntos');
  const g = normalizar({ from: 'Ana Ruiz <ANA@x.es>', subject: 'Hola', html: '<p>Uno</p><p>Dos &amp; tres</p>' });
  assert.equal(g.de, 'ana@x.es');
  assert.equal(g.texto, 'Uno\nDos & tres');
  assert.equal(quitarHtml('<style>p{}</style><b>x</b>'), 'x');
});
