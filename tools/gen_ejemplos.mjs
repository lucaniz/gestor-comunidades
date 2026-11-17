// Genera ficheros de ejemplo para probar las importaciones (cuentas y personas ficticias).
// Uso: node tools/gen_ejemplos.mjs
import { writeFileSync } from 'node:fs';
const w = (s, n) => String(s).padEnd(n, ' ').slice(0, n);
const z = (n, len) => String(Math.round(Math.abs(n) * 100)).padStart(len, '0');
const f = iso => iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);
const banco = '2100', oficina = '0418', cuenta = '0200051332';
const movs = [
  ['2026-11-03', 650, 'TRANSFERENCIA ALQUILER PORTERIA NOVIEMBRE'],
  ['2026-11-05', -290, 'RECIBO LIMPIEZAS BRILLO SL'],
  ['2026-11-10', -385, 'TRANSFERENCIA FONTANERIA RAMOS FACTURA 112'],
  ['2026-11-12', 396, 'TRANSF DE ELENA NAVARRO RUIZ CUOTA 2B'],
  ['2026-11-16', -12.1, 'COMISION MANTENIMIENTO CUENTA'],
  ['2026-11-20', -1180, 'ADEUDO MUTUA HOGAR SEGUROS POLIZA']
];
const L = [];
const saldoIni = 9596;
L.push('11' + banco + oficina + cuenta + f('2026-11-01') + f('2026-11-30') + '2' + z(saldoIni, 14) + '978' + '3' + w('C.P. CALLE ALAMEDA 14', 26) + '   ');
let debe = 0, haber = 0, nd = 0, nh = 0;
for (const [fecha, imp, concepto] of movs) {
  if (imp < 0) { debe += -imp; nd++; } else { haber += imp; nh++; }
  L.push('22' + '    ' + oficina + f(fecha) + f(fecha) + (imp < 0 ? '03' : '02') + '000' + (imp < 0 ? '1' : '2') + z(imp, 14) + '0000000000' + w('', 12) + w(concepto.slice(0, 16), 16));
  L.push('23' + '01' + w(concepto, 38) + w('', 38));
}
const saldoFin = saldoIni + haber - debe;
L.push('33' + banco + oficina + cuenta + String(nd).padStart(5, '0') + z(debe, 14) + String(nh).padStart(5, '0') + z(haber, 14) + (saldoFin < 0 ? '1' : '2') + z(saldoFin, 14) + '978' + '    ');
L.push('88' + '9'.repeat(18) + String(L.length).padStart(6, '0') + ' '.repeat(54));
for (const l of L) if (l.length !== 80) throw new Error('Registro de longitud ' + l.length + ': ' + l);
writeFileSync(new URL('../ejemplos/extracto_alameda14_noviembre.n43', import.meta.url), L.join('\r\n') + '\r\n');

const e2e = 'Rdemo-r-demo-c1-2026-T4-5';
writeFileSync(new URL('../ejemplos/devoluciones_ejemplo.xml', import.meta.url), `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.002.001.03">
  <CstmrPmtStsRpt>
    <GrpHdr><MsgId>DEV-20261015-0001</MsgId><CreDtTm>2026-10-15T09:00:00</CreDtTm></GrpHdr>
    <OrgnlGrpInfAndSts><OrgnlMsgId>REM-20261003-DEMO</OrgnlMsgId><OrgnlMsgNmId>pain.008.001.02</OrgnlMsgNmId><GrpSts>PART</GrpSts></OrgnlGrpInfAndSts>
    <OrgnlPmtInfAndSts>
      <OrgnlPmtInfId>REM-20261003-DEMO-1</OrgnlPmtInfId>
      <TxInfAndSts>
        <StsId>1</StsId><OrgnlEndToEndId>${e2e}</OrgnlEndToEndId><TxSts>RJCT</TxSts>
        <StsRsnInf><Rsn><Cd>AM04</Cd></Rsn></StsRsnInf>
        <OrgnlTxRef><Amt><InstdAmt Ccy="EUR">432.00</InstdAmt></Amt></OrgnlTxRef>
      </TxInfAndSts>
    </OrgnlPmtInfAndSts>
  </CstmrPmtStsRpt>
</Document>
`);
writeFileSync(new URL('../ejemplos/plantilla_pisos.csv', import.meta.url), '﻿ref;tipo;coef;propietario;nif;email;telefono;iban;domiciliado;mandatoRef;mandatoFecha;inquilino\r\n1º A;vivienda;12,5;Nombre Apellido Apellido;12345678Z;correo@ejemplo.es;600000000;ES9121000418450200051332;si;REF-001;2025-01-15;\r\n');
console.log('ejemplos generados');
