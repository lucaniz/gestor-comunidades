// Genera js/demo.js: datos de ejemplo ficticios (demo:true) para el Gestor de Comunidades.
// Uso: node tools/gen_demo.mjs
import { writeFileSync } from 'node:fs';

function mod97(str){ let r=0; for (const ch of str){ const v=/[A-Z]/.test(ch)?String(ch.charCodeAt(0)-55):ch; for (const d of v) r=(r*10+ +d)%97; } return r; }
let seed=7; const rnd=()=>{ seed=(seed*9301+49297)%233280; return seed/233280; };
function iban(bank){ let acc=''; for(let i=0;i<10;i++) acc+=Math.floor(rnd()*10); const bban=bank+'0418'+'45'+acc; const chk=98-mod97(bban+'ES00'); return 'ES'+String(chk).padStart(2,'0')+bban; }
function dni(){ const n=10000000+Math.floor(rnd()*89999999); return n+'TRWAGMYFPDXBNJZSQVHLCKE'[n%23]; }

const D={comunidades:[],unidades:[],recibos:[],gastos:[],proveedores:[],juntas:[],incidencias:[],ingresos:[],movimientos:[],facturas:[],solicitudes:[],mensajes:[]};
const add=(col,o)=>D[col].push({...o,demo:true});

add('comunidades',{id:'demo-c1',nombre:'C.P. Calle Alameda 14',cif:'H85512347',direccion:'Calle Alameda 14',cp:'28014',ciudad:'Madrid',presidente:'Carmen Ortega Vidal',iban:'ES9121000418450200051332',bic:'',sepaSufijo:'000',presupuestoAnual:14400,fondoReservaPct:10,periodicidad:'trimestral',saldoInicial:6250,saldoFecha:'2026-07-01',honorariosMes:120,notas:'Datos de ejemplo',
  repartos:[{id:'r-asc',nombre:'Ascensor (sin bajos)'},{id:'r-gar',nombre:'Garaje'}],
  partidas:[{id:'p1',nombre:'Limpieza',reparto:'general',importe:3600,categoria:'Limpieza'},{id:'p2',nombre:'Ascensor',reparto:'r-asc',importe:1700,categoria:'Ascensor'},{id:'p3',nombre:'Seguro multirriesgo',reparto:'general',importe:1200,categoria:'Seguros'},{id:'p4',nombre:'Puerta y mantenimiento del garaje',reparto:'r-gar',importe:800,categoria:''},{id:'p5',nombre:'Administración',reparto:'general',importe:1742.4,categoria:'Administración'},{id:'p6',nombre:'Agua y luz comunes',reparto:'general',importe:2400,categoria:'Suministros'},{id:'p7',nombre:'Reparaciones y otros',reparto:'general',importe:2957.6,categoria:'Reparaciones'}]});
add('comunidades',{id:'demo-c2',nombre:'C.P. Plaza del Olivo 3',cif:'H86623451',direccion:'Plaza del Olivo 3',cp:'28045',ciudad:'Madrid',presidente:'Andrés Fuentes Mora',iban:iban('0049'),bic:'',sepaSufijo:'000',presupuestoAnual:9000,fondoReservaPct:10,periodicidad:'mensual',saldoInicial:3120,saldoFecha:'2026-10-01',honorariosMes:85,notas:'Datos de ejemplo'});

const u1=[['Bajo A','local',16.5,'Farmacia Alameda S.L.'],['Bajo B','vivienda',10.5,'Luis Prieto Gil'],['1º A','vivienda',12,'Marta Serrano López'],['1º B','vivienda',11,'Tomás Ibáñez Rey'],['2º A','vivienda',12,'Pablo Herrera Díaz'],['2º B','vivienda',11,'Elena Navarro Ruiz'],['3º A','vivienda',13.5,'Carmen Ortega Vidal'],['3º B','vivienda',13.5,'Jorge Molina Santos']];
u1.forEach(([ref,tipo,coef,prop],i)=>{
  const id='demo-u1-'+(i+1);
  const domic = ref!=='2º B';
  const coefs={'r-asc':tipo==='local'||ref.startsWith('Bajo')?0:16.67,'r-gar':['1º A','2º A','3º A','3º B'].includes(ref)?25:0};
  add('unidades',{id,cid:'demo-c1',ref,tipo,coef,coefs,propietario:prop,nif:tipo==='local'?'B84512369':dni(),email:prop.split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')+'@ejemplo.es',telefono:'6'+String(10000000+Math.floor(rnd()*89999999)),iban:iban('2100'),domiciliado:domic,mandatoRef:(domic&&ref!=='3º B')?('ALA14-'+String(i+1).padStart(3,'0')):'',mandatoFecha:(domic&&ref!=='3º B')?'2024-02-01':'',inquilino:'',notas:ref==='2º B'?'Paga por transferencia':''});
});
const u2=[['1º Izq.','vivienda',17,'Raquel Campos Vega'],['1º Dcha.','vivienda',17,'Andrés Fuentes Mora'],['2º Izq.','vivienda',16.5,'Sergio Lozano Pardo'],['2º Dcha.','vivienda',16.5,'Lucía Benítez Soto'],['Ático','vivienda',18,'Óscar Peña Marín'],['Local','local',15,'Talleres Olivo S.L.']];
u2.forEach(([ref,tipo,coef,prop],i)=>{
  add('unidades',{id:'demo-u2-'+(i+1),cid:'demo-c2',ref,tipo,coef,propietario:prop,nif:tipo==='local'?'B86325147':dni(),email:'',telefono:'',iban:iban('0182'),domiciliado:true,mandatoRef:'OLI3-'+String(i+1).padStart(3,'0'),mandatoFecha:'2025-01-15',inquilino:'',notas:''});
});

const r2=n=>Math.round(n*100)/100;
function cuotas(cid,units,total,periodo,emision,venc,estadoFn){
  const sc=units.reduce((a,u)=>a+u[2],0); let rows=units.map(u=>r2(total*u[2]/sc)); const diff=r2(total-rows.reduce((a,b)=>a+b,0)); if(diff){ let bi=0; units.forEach((u,i)=>{ if(u[2]>units[bi][2]) bi=i; }); rows[bi]=r2(rows[bi]+diff); }
  units.forEach((u,i)=>{ const [estado,fc]=estadoFn(u[0]); add('recibos',{id:`demo-r-${cid}-${periodo}-${i+1}`,cid,uid:`demo-u${cid==='demo-c1'?1:2}-${i+1}`,periodo,concepto:'Cuota ordinaria '+periodo,tipo:'ordinaria',importe:rows[i],emision,vencimiento:venc,estado,fechaCobro:fc}); });
}
cuotas('demo-c1',u1,3600,'2026-T3','2026-07-01','2026-07-10',ref=>ref==='2º B'?['pendiente','']:ref==='1º B'?['devuelto','']:['cobrado','2026-07-07']);
cuotas('demo-c1',u1,3600,'2026-T4','2026-10-01','2026-10-10',ref=>ref==='2º B'?['pendiente','']:ref==='1º B'?['devuelto','']:['cobrado','2026-10-07']);
D.recibos.filter(r=>r.periodo==='2026-T4'&&r.cid==='demo-c1'&&r.estado!=='pendiente').forEach(r=>{ r.remesa='REM-20261003-DEMO'; });
cuotas('demo-c2',u2,750,'2026-10','2026-10-01','2026-10-10',()=>['cobrado','2026-10-06']);
cuotas('demo-c2',u2,750,'2026-11','2026-11-15','2026-11-25',()=>['pendiente','']);

add('proveedores',{id:'demo-p1',nombre:'Limpiezas Brillo S.L.',cif:'B87451236',servicio:'Limpieza de zonas comunes',telefono:'910000001',email:'info@brillo.example',iban:'',notas:''});
add('proveedores',{id:'demo-p2',nombre:'Ascensores Norte S.A.',cif:'A28145963',servicio:'Mantenimiento de ascensor',telefono:'910000002',email:'',iban:'',notas:''});
add('proveedores',{id:'demo-p3',nombre:'Mutua Hogar Seguros',cif:'V28000000',servicio:'Seguro multirriesgo',telefono:'',email:'',iban:'',notas:''});
add('proveedores',{id:'demo-p4',nombre:'Fontanería Ramos',cif:dni(),servicio:'Fontanería',telefono:'600000004',email:'',iban:'',notas:''});

let g=0; const gasto=o=>add('gastos',{id:'demo-g'+(++g),fondoReserva:false,notas:'',...o});
for(let m=1;m<=11;m++) gasto({cid:'demo-c1',fecha:`2026-${String(m).padStart(2,'0')}-05`,provId:'demo-p1',concepto:'Limpieza mensual',categoria:'Limpieza',importe:290,pagado:m<11});
['2026-01-15','2026-04-15','2026-07-15','2026-10-15'].forEach(f=>gasto({cid:'demo-c1',fecha:f,provId:'demo-p2',concepto:'Mantenimiento trimestral ascensor',categoria:'Ascensor',importe:410,pagado:true}));
gasto({cid:'demo-c1',fecha:'2026-02-01',provId:'demo-p3',concepto:'Póliza multirriesgo 2026',categoria:'Seguros',importe:1180,pagado:true});
gasto({cid:'demo-c1',fecha:'2026-11-06',provId:'demo-p4',concepto:'Reparación bajante garaje',categoria:'Reparaciones',importe:385,pagado:false});
gasto({cid:'demo-c2',fecha:'2026-10-05',provId:'demo-p1',concepto:'Limpieza mensual',categoria:'Limpieza',importe:180,pagado:true});
gasto({cid:'demo-c2',fecha:'2026-11-05',provId:'demo-p1',concepto:'Limpieza mensual',categoria:'Limpieza',importe:180,pagado:true});
gasto({cid:'demo-c2',fecha:'2026-03-01',provId:'demo-p3',concepto:'Póliza multirriesgo 2026',categoria:'Seguros',importe:760,pagado:true});

add('juntas',{id:'demo-j1',cid:'demo-c1',tipo:'ordinaria',fecha:'2026-03-12',hora1:'18:30',hora2:'19:00',lugar:'Portal de la finca, Calle Alameda 14',convocadaPor:'La Presidenta',orden:'Aprobación de las cuentas del ejercicio 2025\nAprobación del presupuesto 2026 y de las cuotas\nRenovación de cargos\nRuegos y preguntas',estado:'celebrada',asistentes:'Presentes: Bajo A, 1º A, 2º A, 3º A, 3º B\nRepresentados: Bajo B (delega en 1º A)',acuerdos:'1. Se aprueban por unanimidad las cuentas de 2025.\n2. Se aprueba el presupuesto de 14.400 € para 2026, con cuotas trimestrales según coeficiente.\n3. Se reelige presidenta a Dña. Carmen Ortega Vidal.\n4. Sin ruegos ni preguntas.'});
add('juntas',{id:'demo-j2',cid:'demo-c1',tipo:'extraordinaria',fecha:'2026-12-02',hora1:'19:00',hora2:'19:30',lugar:'Portal de la finca, Calle Alameda 14',convocadaPor:'La Presidenta',orden:'Instalación de puerta automática en el garaje: presupuestos y derrama\nReparación de la bajante del garaje\nRuegos y preguntas',estado:'convocada',asistentes:'',acuerdos:''});

add('incidencias',{id:'demo-i1',cid:'demo-c1',uid:'',fecha:'2026-11-03',titulo:'Filtración en el techo del garaje',descripcion:'Mancha de humedad bajo la bajante general. Avisado el fontanero.',provId:'demo-p4',prioridad:'alta',estado:'en curso'});
add('incidencias',{id:'demo-i2',cid:'demo-c1',uid:'',fecha:'2026-11-12',titulo:'Luz fundida en el rellano del 2º',descripcion:'',provId:'',prioridad:'baja',estado:'abierta'});
add('incidencias',{id:'demo-i3',cid:'demo-c2',uid:'demo-u2-5',fecha:'2026-11-14',titulo:'El portero automático no abre desde el ático',descripcion:'El vecino del ático no puede abrir el portal desde su telefonillo.',provId:'',prioridad:'media',estado:'abierta'});


// Despacho de ejemplo, honorarios y retenciones
const config={nombre:'Administraciones Ejemplo',nif:'12345678Z',colegiado:'0000',direccion:'Calle Ficticia 1, 28001 Madrid',telefono:'910000000',email:'despacho@ejemplo.es',serieFactura:'A',ivaPct:21,retencionPct:15,iban:'ES9121000418450200051332'};
add('proveedores',{id:'demo-p5',nombre:config.nombre,cif:config.nif,servicio:'Administración de fincas',telefono:config.telefono,email:config.email,iban:'',notas:'Tu despacho'});
let nf=0;
for (const [cid,base] of [['demo-c1',120],['demo-c2',85]]) for (const mes of ['09','10']) {
  nf++; const iva=Math.round(base*21)/100, ret=Math.round(base*15)/100;
  const numero=`A2026/${String(nf).padStart(3,'0')}`;
  gasto({cid,fecha:`2026-${mes}-30`,provId:'demo-p5',concepto:`Honorarios de administración, ${mes==='09'?'septiembre':'octubre'} 2026 (factura ${numero})`,categoria:'Administración',baseImponible:base,retencion:ret,importe:Math.round((base+iva)*100)/100,pagado:true});
  add('facturas',{id:'demo-f'+nf,cid,numero,fecha:`2026-${mes}-30`,concepto:`Honorarios de administración, ${mes==='09'?'septiembre':'octubre'} 2026`,base,ivaPct:21,iva,retPct:15,retencion:ret,total:Math.round((base+iva-ret)*100)/100,cobrada:mes==='09',fechaCobro:mes==='09'?'2026-10-05':'',gastoId:'demo-g'+g});
}
// Otros ingresos: alquiler de la portería (c1) y antena en la azotea con retención (c2)
for(let m=1;m<=11;m++) add('ingresos',{id:'demo-in'+m,cid:'demo-c1',fecha:`2026-${String(m).padStart(2,'0')}-03`,categoria:'Alquileres',concepto:`Alquiler piso portería, ${m}/2026`,importe:650,pagador:'Inquilino de la portería',pagadorNif:'',retencion:0,cobrado:m<11,notas:''});
add('ingresos',{id:'demo-in-ant',cid:'demo-c2',fecha:'2026-10-15',categoria:'Alquileres',concepto:'Arrendamiento azotea para antena, 2026',importe:2400,pagador:'Telecomunicaciones Ficticias S.A.',pagadorNif:'A00000000',retencion:456,cobrado:true,notas:'Retención del 19 %'});
// Extracto bancario de c1 (para probar la conciliación)
const mov=(id,fecha,importe,concepto,conciliado=null)=>add('movimientos',{id:'demo-m'+id,cid:'demo-c1',fecha,importe,concepto,documento:'',ref1:'',ref2:'',n:id,origen:'n43',conciliado});
mov(1,'2026-10-07',3204,'ABONO REMESA ADEUDOS REM-20261003-DEMO');
mov(2,'2026-10-12',-396,'DEVOLUCION RECIBO TOMAS IBANEZ REY',{tipo:'devolucion',ids:['demo-r-demo-c1-2026-T4-4'],label:'Devolución 1º B · 2026-T4'});
mov(3,'2026-11-04',650,'TRANSFERENCIA ALQUILER PORTERIA NOVIEMBRE');
mov(4,'2026-11-05',-290,'RECIBO LIMPIEZAS BRILLO SL');
mov(5,'2026-11-10',-385,'TRANSFERENCIA FONTANERIA RAMOS FACTURA 112');
mov(6,'2026-11-12',396,'TRANSF DE ELENA NAVARRO RUIZ CUOTA 2B');
mov(7,'2026-11-15',-12.1,'COMISION MANTENIMIENTO CUENTA');
// Respuesta del formulario de los vecinos (recogida de emails)
add('solicitudes',{id:'demo-s1',cid:'demo-c1',piso:'3º B',nombre:'Jorge Molina Santos',email:'jorge.molina@correo-ejemplo.es',telefono:'600000008',rol:'propietario',consentimiento:true,fecha:'2026-11-16T19:42',estado:'pendiente'});

// Correo: emails de vecinos, una comunicación enviada y una nota de llamada
add('mensajes',{id:'demo-ms1',direccion:'entrada',cid:'demo-c1',uid:'demo-u1-6',de:'elena@ejemplo.es',nombre:'Elena Navarro Ruiz',asunto:'Cuotas pendientes del 2º B',texto:'Buenos días:\n\nHe visto que tengo pendientes las cuotas de julio y octubre. Esta semana hago una transferencia por las dos. ¿Me podéis confirmar el número de cuenta?\n\nGracias,\nElena',fecha:'2026-11-14T09:12',para:'comunidades@ejemplo.es',messageId:'demo-1',adjuntos:[],estado:'nuevo',origen:'email'});
add('mensajes',{id:'demo-ms2',direccion:'entrada',cid:'demo-c1',uid:'demo-u1-3',de:'marta@ejemplo.es',nombre:'Marta Serrano López',asunto:'Ruido de la puerta del garaje',texto:'Hola, la puerta del garaje hace mucho ruido al cerrarse, sobre todo por la noche. ¿Se puede revisar antes de la junta?\n\nUn saludo.',fecha:'2026-11-16T22:40',para:'comunidades@ejemplo.es',messageId:'demo-2',adjuntos:[{nombre:'video_puerta.mp4',tipo:'video/mp4',bytes:2400000}],estado:'nuevo',origen:'email'});
add('mensajes',{id:'demo-ms3',direccion:'entrada',cid:null,uid:null,de:'nuevo.propietario@correo-ejemplo.es',nombre:'Daniel Ortiz',asunto:'Soy el nuevo propietario del 2º A',texto:'Buenas tardes, he comprado el 2º A de la calle Alameda 14 y firmamos la escritura la semana pasada. ¿Qué necesitáis para cambiar el titular y la domiciliación?',fecha:'2026-11-17T18:05',para:'comunidades@ejemplo.es',messageId:'demo-3',adjuntos:[],estado:'nuevo',origen:'email'});
add('mensajes',{id:'demo-ms4',direccion:'salida',cid:'demo-c1',uids:['demo-u1-1','demo-u1-2','demo-u1-3','demo-u1-4','demo-u1-5','demo-u1-6','demo-u1-7','demo-u1-8'],asunto:'Convocatoria Junta General extraordinaria · C.P. Calle Alameda 14',texto:'Convocatoria de la junta del 2 de diciembre.',fecha:'2026-11-10T10:00'});
add('mensajes',{id:'demo-ms5',direccion:'nota',canal:'llamada',cid:'demo-c1',uid:'demo-u1-4',asunto:'Llama por el recibo devuelto',texto:'Dice que cambió de banco. Enviará el nuevo IBAN y la orden de domiciliación firmada.',fecha:'2026-10-14T12:30'});

config.emailEntrada='comunidades@ejemplo.es';
D.config=config;
writeFileSync(new URL('../js/demo.js', import.meta.url), '// Datos de ejemplo ficticios. Generado con: node tools/gen_demo.mjs\nwindow.GC_DEMO = '+JSON.stringify(D)+';\n');
console.log(Object.fromEntries(Object.entries(D).filter(([k])=>k!=='config').map(([k,v])=>[k,v.length])));
