"use strict";
/* ================= utilidades ================= */
const $=(s,el=document)=>el.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const EUR=new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',useGrouping:'always'});
const eur=n=>EUR.format(+n||0);
const PCT=new Intl.NumberFormat('es-ES',{maximumFractionDigits:4});
const {num,r2,sum,pad,today,addDays,daysBetween,fd,fdLong,ibanClean,ibanValid,ibanFmt,creditorId,buildPain008,coefOf,splitByCoef,cuotaPresupuesto,parseNorma43,parsePain002,MOTIVOS_DEVOLUCION,e2eRecibo,norm,parecido,parseCSV,toCSV}=GC;
const cap=s=>String(s).charAt(0).toUpperCase()+String(s).slice(1);
const byRef=(a,b)=>String(a.ref||'').localeCompare(String(b.ref||''),'es',{numeric:true});
function lsGet(k){ try{ return localStorage.getItem('gc_'+k); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem('gc_'+k,v); }catch(e){} }

/* ================= estado, sesión y almacenamiento ================= */
const COLS=['comunidades','unidades','recibos','gastos','proveedores','juntas','incidencias'];
const S={config:{},loaded:{},mode:'cargando',slow:false,error:'',user:null,despacho:null,despachos:[],equipo:null}; COLS.forEach(c=>S[c]=[]);
const ui={view:'panel',cid:lsGet('cid')||'all',recEstado:'abiertos',recPeriodo:'',gasAnio:String(new Date().getFullYear()),incEstado:'abiertas',q:''};
let store=null, sb=null;
const CFG=window.GC_CONFIG||{};
const cloudConfigured=()=>!!(CFG.supabaseUrl&&CFG.supabaseAnonKey);

// La demostración se guarda aparte y se renueva sola cuando cambian los datos de ejemplo.
function demoKey(){ return 'gc_demo_'+JSON.stringify(window.GC_DEMO||{}).length.toString(36); }
async function boot(){
  route();
  const params=new URLSearchParams(location.search);
  if(params.get('alta')&&window.bootAlta) return bootAlta(params.get('alta'));
  try{
    if(window.GC_DEMO_MODE){ S.mode='local'; S.demo=true; store=GCStore.local(COLS,demoKey()); }
    else if(cloudConfigured()&&lsGet('modo')!=='local'){
      if(!window.supabase){ S.mode='error'; S.error='No se ha podido cargar la librería de Supabase. Comprueba la conexión a internet.'; return render(); }
      sb=window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseAnonKey);
      const {data:{session}}=await sb.auth.getSession();
      if(/access_token|error_description/.test(location.hash)) history.replaceState(null,'',location.pathname+location.search);
      if(!session){ S.mode='login'; sb.auth.onAuthStateChange(ev=>{ if(ev==='SIGNED_IN') location.reload(); }); return render(); }
      S.user=session.user;
      sb.auth.onAuthStateChange(ev=>{ if(ev==='SIGNED_OUT') location.reload(); });
      const {data,error}=await sb.from('miembros').select('rol,despacho_id,despachos(nombre)').eq('user_id',S.user.id);
      if(error) throw GCStore.mapErr(error);
      S.despachos=data.map(m=>({id:m.despacho_id,nombre:(m.despachos||{}).nombre||'Despacho',rol:m.rol})).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
      if(!S.despachos.length){ if(window.bootPortal&&await bootPortal()) return; S.mode='nuevoDespacho'; return render(); }
      S.despacho=S.despachos.find(d=>d.id===lsGet('despacho'))||S.despachos[0];
      S.mode='cloud'; store=GCStore.supabase(sb,S.despacho.id,COLS);
    } else { S.mode='local'; store=GCStore.local(COLS); }
  }catch(e){ S.mode='error'; S.error=errMsg(e); return render(); }
  const errCb=e=>{ S.error=errMsg(e); render(); };
  COLS.forEach(col=>store.watch(col,(rows,meta)=>{ S[col]=rows; if(!meta||!meta.fromCache) S.loaded[col]=true; schedule(); },errCb));
  store.watchDoc('config','despacho',d=>{ S.config=d||{}; schedule(); },errCb);
  setTimeout(()=>{ if(!allLoaded()){ S.slow=true; render(); } },10000);
  render();
  if(S.demo) setTimeout(async()=>{ if(!S.comunidades.length){ let n=0; try{ for(const c of COLS) for(const {id,...o} of ((window.GC_DEMO||{})[c]||[])){ await store.set(c,id,o); n++; } if(window.GC_DEMO.config&&!S.config.nombre) await store.set('config','despacho',window.GC_DEMO.config); }catch(e){ console.warn(e); } if(n) toast('Demostración con datos ficticios'); } },50);
}
const allLoaded=()=>COLS.every(c=>S.loaded[c]);
let _raf=0; function schedule(){ if(_raf) return; _raf=requestAnimationFrame(()=>{_raf=0; render();}); }
function errMsg(e){ const c=e&&e.code;
  if(c==='invalid_argument') return (e&&e.message)||'No se ha podido guardar: no tienes permiso o el dato no es válido.';
  if(c==='quota_exceeded') return (e&&e.message)||'No queda espacio para guardar más datos.';
  if(c==='unavailable') return 'No se puede contactar con el servidor. Comprueba la conexión e inténtalo de nuevo.';
  return (e&&e.message)||String(e||'Error desconocido'); }
async function retry(fn){ try{ return await fn(); }catch(e){ if(e&&e.code==='unavailable'){ await new Promise(r=>setTimeout(r,400+Math.random()*600)); return fn(); } throw e; } }

/* ---------- pantallas de acceso (versión con servidor) ---------- */
function vLogin(){
  return `<div class="auth card"><h1>Gestor de Comunidades</h1>
  <p class="sub" style="margin:0">Entra con tu email: te enviamos un código de acceso. No hay contraseñas.</p>
  <form id="loginForm" class="stack" style="gap:10px"><label class="sub" for="lg_email" style="display:flex;flex-direction:column;gap:4px;font-weight:600">Email<input id="lg_email" type="email" required autocomplete="email" placeholder="tu@despacho.es"></label>
  <button class="btn pri" type="submit">Enviarme el código de acceso</button></form><p id="lg_msg" class="sub" role="status" style="margin:0"></p>
  <form id="codeForm" class="stack" style="gap:10px" hidden><label class="sub" for="lg_code" style="display:flex;flex-direction:column;gap:4px;font-weight:600">Código de 6 dígitos del email<input id="lg_code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,8}" maxlength="8" required></label>
  <button class="btn pri" type="submit">Entrar</button></form>
  <hr style="border:0;border-top:1px solid var(--line);width:100%">
  <p class="sub" style="margin:0">¿Solo quieres echar un vistazo? <button class="btn link" data-act="modoLocal">Probar sin registrarte</button>. Los datos se guardan únicamente en este navegador.</p></div>`;
}
function vNuevoDespacho(){
  return `<div class="auth card"><h1>Crea tu despacho</h1>
  <p class="sub" style="margin:0">Has entrado como <b>${esc(S.user&&S.user.email)}</b>. Un despacho agrupa tus comunidades; solo tú y las personas que invites lo veréis.</p>
  <form id="despachoForm" class="stack" style="gap:10px"><label class="sub" for="nd_nombre" style="display:flex;flex-direction:column;gap:4px;font-weight:600">Nombre del despacho<input id="nd_nombre" type="text" required placeholder="Ej.: Administraciones García"></label>
  <button class="btn pri" type="submit">Crear despacho</button></form><p id="nd_msg" class="sub" role="status" style="margin:0"></p>
  <p class="sub" style="margin:0">Si un compañero te ha invitado a su despacho, pídele que te añada con este email desde Ajustes → Equipo y vuelve a entrar. Si eres <b>propietario</b>, pide a tu administrador que registre este email en tu piso para ver tus recibos aquí.</p>
  <p style="margin:0"><button class="btn link" data-act="logout">Salir</button></p></div>`;
}
document.addEventListener('submit',async e=>{
  if(e.target.id==='loginForm'){ e.preventDefault(); const email=$('#lg_email').value.trim(), msg=$('#lg_msg'), btn=e.target.querySelector('button'); btn.disabled=true; msg.textContent='Enviando…';
    const {error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});
    btn.disabled=false; if(error){ msg.textContent='No se ha podido enviar: '+error.message; return; }
    msg.textContent=`Te hemos enviado un email a ${email}. Escribe aquí el código (o abre el enlace desde este mismo navegador).`; const cf=$('#codeForm'); cf.hidden=false; cf.dataset.email=email; $('#lg_code').focus(); }
  if(e.target.id==='codeForm'){ e.preventDefault(); const msg=$('#lg_msg'), btn=e.target.querySelector('button'); btn.disabled=true; msg.textContent='Comprobando…';
    const {error}=await sb.auth.verifyOtp({email:e.target.dataset.email,token:$('#lg_code').value.trim(),type:'email'});
    btn.disabled=false; if(error){ msg.textContent='Código incorrecto o caducado. Pide otro.'; return; } location.reload(); }
  if(e.target.id==='despachoForm'){ e.preventDefault(); const nombre=$('#nd_nombre').value.trim(), msg=$('#nd_msg'), btn=e.target.querySelector('button'); btn.disabled=true; msg.textContent='Creando…';
    const {data,error}=await sb.rpc('crear_despacho',{p_nombre:nombre});
    if(error){ btn.disabled=false; msg.textContent='No se ha podido crear: '+error.message; return; }
    lsSet('despacho',data); location.reload(); }
});
async function loadEquipo(){
  if(S.mode!=='cloud') return; S.equipo='cargando';
  const {data,error}=await sb.rpc('miembros_despacho',{p_despacho:S.despacho.id});
  S.equipo=error?{error:error.message}:data; render();
}

/* ================= datos derivados ================= */
const find=(col,id)=>S[col].find(x=>x.id===id);
const com=id=>find('comunidades',id);
const comName=id=>(com(id)||{}).nombre||'(comunidad borrada)';
const sortedComs=()=>[...S.comunidades].sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre),'es',{numeric:true}));
const inCid=x=>ui.cid==='all'||x.cid===ui.cid;
const unitsOf=cid=>S.unidades.filter(u=>u.cid===cid).sort(byRef);
const PPY={mensual:12,trimestral:4,semestral:2,anual:1};
// Presupuesto anual: suma de partidas si la comunidad las tiene; si no, el importe global.
const presupuestoDe=k=>(k&&Array.isArray(k.partidas)&&k.partidas.length)?sum(k.partidas.map(p=>p.importe)):num(k&&k.presupuestoAnual);
let D=null;
function derive(){
  const t=today(), y=t.slice(0,4); const c={}, debt={}, overdue={};
  for(const k of S.comunidades) c[k.id]={cobrado:0,pendiente:0,vencido:0,gastosPag:0,gastosAnio:0,morosos:new Set(),inc:0,prox:null,ordinaria:false,units:0,coef:0,saldo:0,ingresosCob:0,fondoMin:r2(presupuestoDe(k)*num(k.fondoReservaPct)/100)};
  for(const u of S.unidades){ const x=c[u.cid]; if(x){ x.units++; x.coef+=num(u.coef); } }
  for(const r of S.recibos){ const x=c[r.cid]; if(!x) continue; const k=com(r.cid);
    if(r.estado==='cobrado'){ if(!k.saldoFecha||!r.fechaCobro||r.fechaCobro>=k.saldoFecha) x.cobrado+=num(r.importe); }
    else { x.pendiente+=num(r.importe); debt[r.uid]=(debt[r.uid]||0)+num(r.importe); if(r.vencimiento&&r.vencimiento<t){ x.vencido+=num(r.importe); x.morosos.add(r.uid); overdue[r.uid]=(overdue[r.uid]||0)+num(r.importe);} } }
  for(const g of S.gastos){ const x=c[g.cid]; if(!x) continue; const k=com(g.cid);
    if(g.pagado&&(!k.saldoFecha||!g.fecha||g.fecha>=k.saldoFecha)) x.gastosPag+=num(g.importe);
    if(String(g.fecha).startsWith(y)) x.gastosAnio+=num(g.importe); }
  for(const i of (S.ingresos||[])){ const x=c[i.cid]; if(!x) continue; const k=com(i.cid);
    if(i.cobrado!==false&&(!k.saldoFecha||!i.fecha||i.fecha>=k.saldoFecha)) x.ingresosCob+=num(i.importe); }
  for(const i of S.incidencias){ const x=c[i.cid]; if(x&&i.estado!=='cerrada') x.inc++; }
  for(const j of S.juntas){ const x=c[j.cid]; if(!x) continue;
    if(j.tipo==='ordinaria'&&String(j.fecha).startsWith(y)) x.ordinaria=true;
    if(j.estado==='convocada'&&j.fecha>=t&&(!x.prox||j.fecha<x.prox.fecha)) x.prox=j; }
  for(const k of S.comunidades){ const x=c[k.id]; x.saldo=r2(num(k.saldoInicial)+x.cobrado+x.ingresosCob-x.gastosPag); x.coef=r2(x.coef*10000)/10000; }
  return {c,debt,overdue,t,y};
}
function avisos(k){ const x=D.c[k.id], a=[];
  if(x.morosos.size) a.push(['bad',`${x.morosos.size} ${x.morosos.size===1?'moroso':'morosos'}`]);
  if(x.units&&Math.abs(x.coef-100)>0.001) a.push(['warn',`Coeficientes suman ${PCT.format(x.coef)} %`]);
  if(!x.units) a.push(['warn','Sin unidades']);
  if(!ibanValid(k.iban)) a.push(['warn','Falta IBAN válido']);
  if(!k.cif) a.push(['warn','Falta CIF']);
  if(!x.ordinaria) a.push(['warn',`Sin junta ordinaria ${D.y}`]);
  return a; }
const chips=a=>a.length?`<span class="chips">${a.map(([l,t])=>`<span class="pill ${l}">${esc(t)}</span>`).join('')}</span>`:'<span class="pill ok">Al día</span>';
const estPill=e=>({cobrado:'<span class="pill ok">Cobrado</span>',pendiente:'<span class="pill warn">Pendiente</span>',devuelto:'<span class="pill bad">Devuelto</span>'}[e]||`<span class="pill mut">${esc(e)}</span>`);
const incPill=e=>({abierta:'<span class="pill warn">Abierta</span>','en curso':'<span class="pill">En curso</span>',cerrada:'<span class="pill ok">Cerrada</span>'}[e]||esc(e));
const unitLabel=u=>u?`${u.ref}${u.propietario?' · '+u.propietario:''}`:'—';

/* ================= esquemas de formularios ================= */
const CATS=['Limpieza','Mantenimiento','Ascensor','Suministros','Seguros','Reparaciones','Administración','Bancarios','Impuestos y tasas','Obras','Otros'];
const SCHEMA={
  comunidades:[
    {k:'nombre',l:'Nombre',req:1,hint:'Ej.: C.P. Calle Alameda 14'},{k:'cif',l:'CIF',hint:'Las comunidades empiezan por H'},
    {k:'direccion',l:'Dirección'},{k:'cp',l:'Código postal'},{k:'ciudad',l:'Municipio',def:'Madrid'},{k:'presidente',l:'Presidente/a'},
    {k:'iban',l:'IBAN de la comunidad',t:'iban'},{k:'bic',l:'BIC (opcional)'},
    {k:'sepaSufijo',l:'Sufijo SEPA del acreedor',def:'000',hint:'Lo da el banco; normalmente 000'},
    {k:'periodicidad',l:'Periodicidad de cuotas',t:'select',o:['mensual','trimestral','semestral','anual'],def:'trimestral'},
    {k:'presupuestoAnual',l:'Presupuesto ordinario anual (€)',t:'number'},{k:'fondoReservaPct',l:'Fondo de reserva (% del presupuesto)',t:'number',def:10,hint:'Mínimo legal: 10 % (art. 9.1.f LPH)'},
    {k:'saldoInicial',l:'Saldo bancario inicial (€)',t:'number',def:0},{k:'saldoFecha',l:'Fecha de ese saldo',t:'date',hint:'Solo se suman cobros y pagos desde esta fecha'},
    {k:'honorariosMes',l:'Tus honorarios (€/mes)',t:'number'},{k:'notas',l:'Notas',t:'textarea'}],
  unidades:[
    {k:'cid',l:'Comunidad',t:'cid',req:1},{k:'ref',l:'Piso / local',req:1,hint:'Ej.: 2º B, Local 1, Garaje 7'},
    {k:'tipo',l:'Tipo',t:'select',o:['vivienda','local','garaje','trastero','oficina'],def:'vivienda'},{k:'coef',l:'Coeficiente de participación (%)',t:'number',req:1},
    {k:'propietario',l:'Propietario/a',req:1},{k:'nif',l:'NIF'},{k:'email',l:'Email',t:'email'},{k:'telefono',l:'Teléfono'},
    {k:'direccionNotif',l:'Dirección para notificaciones',full:1,hint:'Si no vive en la finca (art. 9.1.h LPH)'},
    {k:'iban',l:'IBAN para domiciliar',t:'iban'},{k:'domiciliado',l:'Recibos domiciliados',t:'check',def:true},
    {k:'mandatoRef',l:'Referencia del mandato SEPA'},{k:'mandatoFecha',l:'Fecha de firma del mandato',t:'date'},
    {k:'inquilino',l:'Inquilino (si lo hay)'},{k:'notas',l:'Notas',t:'textarea'}],
  recibos:[
    {k:'cid',l:'Comunidad',t:'cid',req:1},{k:'uid',l:'Piso / propietario',t:'unit',req:1},
    {k:'periodo',l:'Periodo',req:1,hint:'Ej.: 2026-T4 o 2026-11'},{k:'tipo',l:'Tipo',t:'select',o:['ordinaria','derrama','otro'],def:'ordinaria'},
    {k:'concepto',l:'Concepto',req:1,full:1},{k:'importe',l:'Importe (€)',t:'number',req:1},
    {k:'estado',l:'Estado',t:'select',o:['pendiente','cobrado','devuelto'],def:'pendiente'},
    {k:'emision',l:'Fecha de emisión',t:'date',def:'@today'},{k:'vencimiento',l:'Vencimiento',t:'date'},{k:'fechaCobro',l:'Fecha de cobro',t:'date'}],
  gastos:[
    {k:'cid',l:'Comunidad',t:'cid',req:1},{k:'fecha',l:'Fecha',t:'date',def:'@today',req:1},
    {k:'provId',l:'Proveedor',t:'prov'},{k:'categoria',l:'Categoría',t:'select',o:CATS,def:'Mantenimiento'},
    {k:'concepto',l:'Concepto',req:1,full:1},{k:'importe',l:'Importe (€, IVA incluido)',t:'number',req:1},
    {k:'pagado',l:'Pagado',t:'check',def:true},{k:'fondoReserva',l:'Con cargo al fondo de reserva',t:'check'},{k:'notas',l:'Notas',t:'textarea'}],
  proveedores:[
    {k:'nombre',l:'Nombre / razón social',req:1},{k:'cif',l:'NIF / CIF'},{k:'servicio',l:'Servicio',full:1},
    {k:'telefono',l:'Teléfono'},{k:'email',l:'Email',t:'email'},{k:'iban',l:'IBAN',t:'iban'},{k:'notas',l:'Notas',t:'textarea'}],
  juntas:[
    {k:'cid',l:'Comunidad',t:'cid',req:1},{k:'tipo',l:'Tipo de junta',t:'select',o:['ordinaria','extraordinaria'],def:'ordinaria'},
    {k:'fecha',l:'Fecha',t:'date',req:1},{k:'lugar',l:'Lugar',def:'Portal de la finca'},
    {k:'hora1',l:'Hora 1ª convocatoria',t:'time',def:'18:30'},{k:'hora2',l:'Hora 2ª convocatoria',t:'time',def:'19:00'},
    {k:'convocadaPor',l:'Convoca',def:'El Presidente'},{k:'estado',l:'Estado',t:'select',o:['convocada','celebrada'],def:'convocada'},
    {k:'orden',l:'Orden del día (un punto por línea)',t:'textarea',rows:5,req:1},
    {k:'asistentes',l:'Asistentes y representados (para el acta)',t:'textarea',rows:3},
    {k:'acuerdos',l:'Acuerdos adoptados (para el acta)',t:'textarea',rows:6}],
  incidencias:[
    {k:'cid',l:'Comunidad',t:'cid',req:1},{k:'fecha',l:'Fecha',t:'date',def:'@today'},
    {k:'titulo',l:'Incidencia',req:1,full:1},{k:'descripcion',l:'Descripción',t:'textarea'},
    {k:'uid',l:'Piso afectado',t:'unit',opt:1},{k:'provId',l:'Proveedor asignado',t:'prov'},
    {k:'prioridad',l:'Prioridad',t:'select',o:['baja','media','alta'],def:'media'},{k:'estado',l:'Estado',t:'select',o:['abierta','en curso','cerrada'],def:'abierta'}],
  despacho:[
    {k:'nombre',l:'Nombre del administrador o despacho',req:1},{k:'nif',l:'NIF'},{k:'colegiado',l:'Nº de colegiado (si lo tienes)'},
    {k:'direccion',l:'Dirección',full:1},{k:'telefono',l:'Teléfono'},{k:'email',l:'Email',t:'email'}]
};
const NOUN={comunidades:'comunidad',unidades:'piso o local',recibos:'recibo',gastos:'gasto',proveedores:'proveedor',juntas:'junta',incidencias:'incidencia'};

function comOpts(v,withAll){ return (withAll?'<option value="all">Todas las comunidades</option>':'<option value="">— Elige comunidad —</option>')+sortedComs().map(c=>`<option value="${esc(c.id)}" ${c.id===v?'selected':''}>${esc(c.nombre)}</option>`).join(''); }
function unitOpts(cid,v,optional){ const us=S.unidades.filter(u=>u.cid===cid).sort(byRef); return (optional||!us.length?`<option value="">${us.length?'— Ninguno —':'— Elige primero la comunidad —'}</option>`:'')+us.map(u=>`<option value="${esc(u.id)}" ${u.id===v?'selected':''}>${esc(unitLabel(u))}</option>`).join(''); }
function provOpts(v){ return '<option value="">— Sin proveedor —</option>'+[...S.proveedores].sort((a,b)=>String(a.nombre).localeCompare(b.nombre,'es')).map(p=>`<option value="${esc(p.id)}" ${p.id===v?'selected':''}>${esc(p.nombre)}</option>`).join(''); }
// Tipos de campo adicionales que registran otros módulos: FIELD_TYPES[tipo]=(f,v,data,id)=>html; con .dep=true se recalculan al cambiar de comunidad.
const FIELD_TYPES={};
// Contadores en el menú lateral que añaden otros módulos: NAV_BADGES[vista]=()=>número
const NAV_BADGES={};
// Ajustes antes de guardar un formulario (cálculos derivados): BEFORE_SAVE[colección]=(datos, original)=>void
const BEFORE_SAVE={};
function fieldHtml(f,v,data){
  const id='f_'+f.k, full=(f.full||f.t==='textarea')?' full':'';
  if(f.t==='check') return `<label class="chk${full}"><input type="checkbox" id="${id}" ${v?'checked':''}> ${esc(f.l)}</label>`;
  let inp;
  switch(f.t){
    case 'textarea': inp=`<textarea id="${id}" rows="${f.rows||3}">${esc(v)}</textarea>`; break;
    case 'select': inp=`<select id="${id}">${f.o.map(o=>`<option value="${esc(o)}" ${String(v)===String(o)?'selected':''}>${esc(cap(o))}</option>`).join('')}</select>`; break;
    case 'cid': inp=`<select id="${id}">${comOpts(v)}</select>`; break;
    case 'unit': inp=`<select id="${id}">${unitOpts(data.cid,v,f.opt)}</select>`; break;
    case 'prov': inp=`<select id="${id}">${provOpts(v)}</select>`; break;
    case 'number': inp=`<input id="${id}" type="text" inputmode="decimal" autocomplete="off" value="${v===undefined||v===null||v===''?'':esc(String(v).replace('.',','))}">`; break;
    case 'date': case 'time': case 'email': inp=`<input id="${id}" type="${f.t}" value="${esc(v)}">`; break;
    case 'iban': inp=`<input id="${id}" type="text" spellcheck="false" autocomplete="off" value="${esc(v?ibanFmt(v):'')}">`; break;
    default: inp=FIELD_TYPES[f.t]?FIELD_TYPES[f.t](f,v,data,id):`<input id="${id}" type="text" value="${esc(v)}">`;
  }
  return `<label class="${full.trim()}" for="${id}">${esc(f.l)}${f.req?' *':''}${inp}${f.hint?`<small>${esc(f.hint)}</small>`:''}</label>`;
}
function readForm(schema,root){ const o={};
  for(const f of schema){ const el=root.querySelector('#f_'+f.k); if(!el) continue;
    if(f.t==='check') o[f.k]=el.checked; else if(f.t==='number') o[f.k]=el.value.trim()===''?null:num(el.value);
    else if(f.t==='iban') o[f.k]=ibanClean(el.value); else o[f.k]=el.value.trim(); }
  return o; }
function validate(schema,o){
  for(const f of schema){ const v=o[f.k];
    if(f.req&&(v===''||v===null||v===undefined)) return `Falta: ${f.l}`;
    if(f.t==='iban'&&v&&!ibanValid(v)) return `${f.l}: el IBAN no es válido, revisa los dígitos.`;
    if(f.t==='email'&&v&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return `${f.l}: el email no es válido.`; }
  return ''; }

/* ================= modal, avisos, descargas ================= */
function toast(msg){ const t=document.createElement('div'); t.className='toast'; t.setAttribute('role','status'); t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),3200); }
function modal(title,html,buttons,opts={}){
  const ov=document.createElement('div'); ov.className='ov';
  ov.innerHTML=`<div class="dlg${opts.wide?' wide':''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="dlg-h"><h2>${esc(title)}</h2><button class="x" type="button" aria-label="Cerrar">×</button></div><div class="dlg-b">${html}</div><div class="dlg-f"><p class="err" role="alert"></p><div class="btns"></div></div></div>`;
  const body=ov.querySelector('.dlg-b'), errEl=ov.querySelector('.err');
  const setErr=(m,info)=>{ errEl.textContent=m||''; errEl.classList.toggle('info',!!info); };
  const onKey=e=>{ if(e.key==='Escape') close(); };
  const close=()=>{ ov.remove(); document.removeEventListener('keydown',onKey); if(opts.onClose) opts.onClose(); };
  document.addEventListener('keydown',onKey);
  ov.querySelector('.x').onclick=close;
  for(const b of (buttons||[{l:'Cerrar'}])){ const el=document.createElement('button'); el.type='button'; el.className='btn'+(b.pri?' pri':'')+(b.danger?' danger':''); el.textContent=b.l;
    el.onclick=async()=>{ if(!b.fn){ close(); return; } el.disabled=true; setErr('');
      try{ const r=await b.fn(body,setErr,el); if(r!==false) close(); }catch(e){ setErr(errMsg(e)); } finally{ el.disabled=false; } };
    ov.querySelector('.btns').appendChild(el); }
  document.body.appendChild(ov);
  const first=body.querySelector('input:not([type=checkbox]),select,textarea'); (first||ov.querySelector('.btns button:last-child')).focus();
  return {el:ov,body,close,setErr};
}
function confirmBox(msg,okLabel,danger){ return new Promise(res=>{ let done=false;
  modal('Confirmar',`<p style="margin:0">${msg}</p>`,[{l:'Cancelar',fn:()=>{done=true;res(false);}},{l:okLabel||'Confirmar',pri:!danger,danger,fn:()=>{done=true;res(true);}}],{onClose:()=>{ if(!done) res(false); }}); }); }
function saveFile(filename,data){
  const type=/\.csv$/.test(filename)?'text/csv;charset=utf-8':/\.json$/.test(filename)?'application/json':/\.xml$/.test(filename)?'application/xml':/\.html?$/.test(filename)?'text/html;charset=utf-8':'application/octet-stream';
  const blob=data instanceof Blob?data:new Blob([data],{type});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000); return true;
}
// Abre un documento imprimible en una pestaña nueva; si el navegador bloquea la ventana, lo descarga.
function openDoc(html,filename){
  const w=window.open('','_blank');
  if(w){ w.document.open(); w.document.write(html); w.document.close(); }
  else { saveFile(filename,html); toast('El navegador ha bloqueado la ventana: se ha descargado el documento.'); }
}
function slug(s){ return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,40)||'archivo'; }

/* ================= documentos imprimibles ================= */
function docPage(title,body){ return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page{size:A4;margin:22mm 20mm}body{font:11.5pt/1.5 Georgia,"Times New Roman",serif;color:#111;max-width:170mm;margin:24px auto;padding:0 12px}
h1{font-size:14pt;text-align:center;margin:18px 0 6px;letter-spacing:.02em}h2{font-size:12pt;margin:18px 0 6px}.hd{text-align:center;font-size:10.5pt;color:#333}
table{width:100%;border-collapse:collapse;margin:8px 0;font-size:10.5pt}td,th{border:1px solid #999;padding:4px 6px;text-align:left}td.r,th.r{text-align:right}
.firmas{display:flex;justify-content:space-between;gap:30px;margin-top:50px}.firmas div{flex:1;border-top:1px solid #333;padding-top:4px;text-align:center;font-size:10pt}
.nota{font-size:9.5pt;color:#444}.corte{border-top:1px dashed #666;margin-top:30px;padding-top:12px}ol li{margin:3px 0}
@media print{.noprint{display:none}}</style></head><body><p class="noprint nota"><button onclick="window.print()" style="font:inherit;padding:6px 14px;cursor:pointer">Imprimir o guardar en PDF</button></p>${body}</body></html>`; }
function comHead(k){ return `<p class="hd"><b>COMUNIDAD DE PROPIETARIOS ${esc(String(k.nombre||'').replace(/^C\.?\s?P\.?\s*/i,'').toUpperCase())}</b><br>${esc(k.direccion||'')}${k.cp?', '+esc(k.cp):''} ${esc(k.ciudad||'')}${k.cif?' · CIF '+esc(k.cif):''}</p>`; }
const adminName=()=>S.config.nombre||'El Administrador';
function ordenList(j){ return '<ol>'+String(j.orden||'').split('\n').map(s=>s.replace(/^\s*\d+[.)-]?\s*/,'').trim()).filter(Boolean).map(s=>`<li>${esc(s)}</li>`).join('')+'</ol>'; }
function morososTable(cid,refDate){
  const t=refDate||today(); const rows=[];
  for(const u of unitsOf(cid)){ const deuda=sum(S.recibos.filter(r=>r.uid===u.id&&r.estado!=='cobrado'&&r.vencimiento&&r.vencimiento<t).map(r=>r.importe)); if(deuda>0) rows.push([u,deuda]); }
  return rows; }
function docConvocatoria(j){
  const k=com(j.cid)||{}; const mor=morososTable(j.cid);
  const body=`${comHead(k)}<h1>CONVOCATORIA DE JUNTA GENERAL ${j.tipo==='extraordinaria'?'EXTRAORDINARIA':'ORDINARIA'}</h1>
<p>Por orden de ${esc((j.convocadaPor||'el Presidente').replace(/^E/,'e').replace(/^L/,'l'))}${k.presidente?', '+esc(k.presidente)+',':''} se convoca a los propietarios a la Junta General ${esc(j.tipo)} que se celebrará en <b>${esc(j.lugar||'___')}</b> el <b>${esc(fdLong(j.fecha))}</b>, a las <b>${esc(j.hora1||'__:__')}</b> horas en primera convocatoria y, de no reunirse el quórum necesario, a las <b>${esc(j.hora2||'__:__')}</b> horas en segunda convocatoria, con arreglo al siguiente</p>
<h2>ORDEN DEL DÍA</h2>${ordenList(j)}
<h2>Propietarios que no están al corriente de pago</h2>
${mor.length?`<table><tr><th>Piso / local</th><th>Propietario/a</th><th class="r">Deuda vencida</th></tr>${mor.map(([u,d])=>`<tr><td>${esc(u.ref)}</td><td>${esc(u.propietario)}</td><td class="r">${eur(d)}</td></tr>`).join('')}</table>`:'<p>A la fecha de esta convocatoria todos los propietarios están al corriente de pago.</p>'}
<p class="nota">Se advierte que, conforme al artículo 15.2 de la Ley de Propiedad Horizontal, los propietarios que a la fecha de la Junta no se encuentren al corriente en el pago de las deudas vencidas con la Comunidad, y no las hubiesen impugnado judicialmente o consignado judicial o notarialmente, podrán participar en sus deliberaciones pero no tendrán derecho de voto. Esta relación se incluye en cumplimiento del artículo 16.2 de la misma Ley.</p>
<p>${esc(k.ciudad||'')}, a ${esc(fdLong(today()))}</p>
<div class="firmas"><div>El/La Presidente/a<br>${esc(k.presidente||'')}</div><div>El Secretario-Administrador<br>${esc(adminName())}</div></div>
<div class="corte"><h2>DELEGACIÓN DE VOTO</h2><p>D./Dña. ________________________________________, propietario/a del piso/local ________ de esta Comunidad, delega su representación y voto en D./Dña. ________________________________________ para la Junta General ${esc(j.tipo)} del ${esc(fd(j.fecha))}.</p><p>Firma: ____________________ &nbsp;&nbsp; Fecha: ____________</p></div>`;
  return docPage('Convocatoria '+(k.nombre||''),body); }
function docActa(j){
  const k=com(j.cid)||{};
  const body=`${comHead(k)}<h1>ACTA DE LA JUNTA GENERAL ${j.tipo==='extraordinaria'?'EXTRAORDINARIA':'ORDINARIA'}</h1>
<p>En ${esc(j.lugar||'___')}, siendo las ${esc(j.hora2||j.hora1||'__:__')} horas del ${esc(fdLong(j.fecha))}, se reúnen en ___ convocatoria los propietarios que se relacionan a continuación, en Junta General ${esc(j.tipo)} convocada por ${esc((j.convocadaPor||'el Presidente').replace(/^E/,'e').replace(/^L/,'l'))}${k.presidente?' ('+esc(k.presidente)+')':''}.</p>
<h2>Asistentes, presentes o representados</h2><p>${esc(j.asistentes||'________________________________').replace(/\n/g,'<br>')}</p>
<p>Preside la reunión ${esc(k.presidente||'el/la Presidente/a')} y actúa como Secretario-Administrador ${esc(adminName())}.</p>
<h2>Orden del día</h2>${ordenList(j)}
<h2>Acuerdos</h2><p>${esc(j.acuerdos||'________________________________').replace(/\n/g,'<br>')}</p>
<p>Y no habiendo más asuntos que tratar, se levanta la sesión, de lo que como Secretario doy fe con el Visto Bueno del Presidente/a.</p>
<div class="firmas"><div>VºBº El/La Presidente/a<br>${esc(k.presidente||'')}</div><div>El Secretario-Administrador<br>${esc(adminName())}</div></div>
<p class="nota">Art. 19 LPH: el acta debe cerrarse con las firmas del Presidente y del Secretario antes de la siguiente reunión, y los acuerdos se notifican a los propietarios ausentes.</p>`;
  return docPage('Acta '+(k.nombre||''),body); }
function docCertificado(u){
  const k=com(u.cid)||{}; const t=today();
  const rs=S.recibos.filter(r=>r.uid===u.id&&r.estado!=='cobrado').sort((a,b)=>String(a.periodo).localeCompare(b.periodo));
  const total=sum(rs.map(r=>r.importe));
  const body=`${comHead(k)}<h1>CERTIFICADO DE DEUDA CON LA COMUNIDAD</h1>
<p>${esc(adminName())}${S.config.nif?', con NIF '+esc(S.config.nif):''}, Secretario-Administrador de la Comunidad de Propietarios ${esc(k.nombre||'')}${k.cif?', con CIF '+esc(k.cif):''},</p>
<p><b>CERTIFICA:</b> que, según los datos de la contabilidad de la Comunidad, el inmueble <b>${esc(u.ref)}</b> (${esc(u.tipo||'')}), cuyo titular es ${esc(u.propietario||'')}${u.nif?', con NIF '+esc(u.nif):''}, con un coeficiente de participación del ${esc(PCT.format(num(u.coef)))} %,</p>
${total>0?`<p>mantiene a fecha ${esc(fd(t))} las siguientes deudas con la Comunidad:</p><table><tr><th>Periodo</th><th>Concepto</th><th>Vencimiento</th><th>Estado</th><th class="r">Importe</th></tr>${rs.map(r=>`<tr><td>${esc(r.periodo)}</td><td>${esc(r.concepto)}</td><td>${esc(fd(r.vencimiento))}</td><td>${esc(r.estado)}</td><td class="r">${eur(r.importe)}</td></tr>`).join('')}<tr><td colspan="4"><b>TOTAL</b></td><td class="r"><b>${eur(total)}</b></td></tr></table>`:`<p>se encuentra <b>al corriente de pago</b> de las cuotas y demás gastos de la Comunidad a fecha ${esc(fd(t))}.</p>`}
<p>Y para que conste a los efectos del artículo 9.1.e) de la Ley 49/1960 de Propiedad Horizontal, expido el presente certificado con el Visto Bueno del Presidente/a, en ${esc(k.ciudad||'___')}, a ${esc(fdLong(t))}.</p>
<div class="firmas"><div>VºBº El/La Presidente/a<br>${esc(k.presidente||'')}</div><div>El Secretario-Administrador<br>${esc(adminName())}</div></div>`;
  return docPage('Certificado de deuda '+u.ref,body); }

/* ================= vistas ================= */
const VIEWS=[['panel','Panel'],['comunidades','Comunidades'],['propietarios','Propietarios'],['recibos','Recibos y cobros'],['gastos','Gastos'],['juntas','Juntas y actas'],['incidencias','Incidencias'],['proveedores','Proveedores'],['ajustes','Ajustes']];
function tile(l,v,s,cls){ return `<div class="tile ${cls||''}"><span class="l">${esc(l)}</span><span class="v">${v}</span>${s?`<span class="s">${s}</span>`:''}</div>`; }
function needCom(what){ return `<div class="card empty">Elige una comunidad arriba para ${what}.</div>`; }
function head(title,desc,acts){ return `<div class="vh"><div><h1>${esc(title)}</h1>${desc?`<p>${desc}</p>`:''}</div><div class="acts">${acts||''}</div></div>`; }

function vPanel(){
  if(!S.comunidades.length) return `${head('Bienvenido')}<div class="card"><h2>Da de alta tu primera comunidad</h2><p class="sub" style="margin:0">Después añade los pisos con su coeficiente y podrás emitir recibos, remesas SEPA, convocatorias y certificados.</p><div class="acts"><button class="btn pri" data-act="new" data-col="comunidades">Nueva comunidad</button><button class="btn" data-act="loadDemo">Probar con datos de ejemplo</button><a class="btn" href="#ajustes">Restaurar una copia de seguridad</a></div></div>`;
  if(ui.cid!=='all'&&com(ui.cid)) return vPanelCom(com(ui.cid));
  const cs=sortedComs(), xs=cs.map(k=>D.c[k.id]);
  const pend=sum(xs.map(x=>x.vencido)), mor=xs.reduce((a,x)=>a+x.morosos.size,0), inc=xs.reduce((a,x)=>a+x.inc,0);
  const prox=xs.map(x=>x.prox).filter(Boolean).sort((a,b)=>a.fecha.localeCompare(b.fecha))[0];
  return `${head('Panel del despacho','Todas tus comunidades de un vistazo. Pulsa una comunidad para ver su detalle.')}
  <div class="tiles">
    ${tile('Comunidades',cs.length,`${S.unidades.length} pisos y locales`)}
    ${tile('Deuda vencida',eur(pend),`${mor} ${mor===1?'propietario moroso':'propietarios morosos'}`,pend>0?'bad':'')}
    ${tile('Incidencias abiertas',inc,'',inc?'warn':'')}
    ${tile('Próxima junta',prox?esc(fd(prox.fecha)):'—',prox?esc(comName(prox.cid)):'Ninguna convocada')}
    ${tile('Honorarios',eur(sum(cs.map(k=>k.honorariosMes)))+'<small style="font-size:13px"> /mes</small>',eur(sum(cs.map(k=>k.honorariosMes))*12)+' al año')}
  </div>
  <div class="tw"><table class="tbl"><thead><tr><th>Comunidad</th><th class="r">Pisos</th><th class="r">Saldo estimado</th><th class="r">Pendiente de cobro</th><th class="r">Incid.</th><th>Próxima junta</th><th>Avisos</th></tr></thead><tbody>
  ${cs.map(k=>{const x=D.c[k.id]; return `<tr><td><button class="btn link" data-act="selCom" data-id="${esc(k.id)}">${esc(k.nombre)}</button><div class="sub">${esc(k.direccion||'')}</div></td><td class="r">${x.units}</td><td class="r">${eur(x.saldo)}</td><td class="r">${eur(x.pendiente)}</td><td class="r">${x.inc||''}</td><td class="nw">${x.prox?esc(fd(x.prox.fecha))+' <span class="sub">'+esc(x.prox.tipo)+'</span>':'<span class="sub">—</span>'}</td><td>${chips(avisos(k))}</td></tr>`;}).join('')}
  </tbody></table></div>`;
}
function vPanelCom(k){
  const x=D.c[k.id]; const us=unitsOf(k.id);
  const mor=us.filter(u=>D.debt[u.id]>0).map(u=>[u,D.debt[u.id],D.overdue[u.id]||0]).sort((a,b)=>b[1]-a[1]);
  const juntas=S.juntas.filter(j=>j.cid===k.id).sort((a,b)=>String(b.fecha).localeCompare(a.fecha)).slice(0,4);
  const incs=S.incidencias.filter(i=>i.cid===k.id&&i.estado!=='cerrada').sort((a,b)=>String(b.fecha).localeCompare(a.fecha));
  const cuota=presupuestoDe(k)/(PPY[k.periodicidad]||4);
  return `${head(k.nombre,esc([k.direccion,k.cp,k.ciudad].filter(Boolean).join(', '))+(k.presidente?' · Presidencia: '+esc(k.presidente):''),`<button class="btn" data-act="edit" data-col="comunidades" data-id="${esc(k.id)}">Editar comunidad</button><button class="btn pri" data-act="genRecibos">Generar recibos</button>`)}
  ${avisos(k).length?`<div class="notice">${chips(avisos(k))}</div>`:''}
  <div class="tiles">
    ${tile('Saldo estimado',eur(x.saldo),k.saldoFecha?'desde '+esc(fd(k.saldoFecha)):'saldo inicial + cobros − pagos')}
    ${tile('Pendiente de cobro',eur(x.pendiente),eur(x.vencido)+' ya vencido',x.vencido>0?'bad':'')}
    ${tile('Fondo de reserva mínimo',eur(x.fondoMin),esc(PCT.format(num(k.fondoReservaPct)))+' % de '+eur(presupuestoDe(k)))}
    ${tile('Gastos '+D.y,eur(x.gastosAnio),'presupuesto '+eur(presupuestoDe(k)))}
    ${tile('Cuota '+(k.periodicidad||'trimestral'),eur(cuota),'a repartir por coeficiente')}
  </div>
  <div class="cols">
    <div class="card"><div class="vh"><h2>Recibos pendientes por propietario</h2><a class="btn sm" href="#recibos">Ver recibos</a></div>
      ${mor.length?`<div class="tw"><table class="tbl"><thead><tr><th>Piso</th><th>Propietario/a</th><th class="r">Pendiente</th><th class="r">Vencido</th><th></th></tr></thead><tbody>${mor.map(([u,d,o])=>`<tr><td class="nw">${esc(u.ref)}</td><td>${esc(u.propietario)}${u.domiciliado?'':' <span class="pill mut">sin domiciliar</span>'}</td><td class="r">${eur(d)}</td><td class="r">${o>0?`<span class="pill bad">${eur(o)}</span>`:'—'}</td><td class="ra"><button class="btn sm" data-act="certificado" data-id="${esc(u.id)}">Certificado</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="sub" style="margin:0">Todos los propietarios están al corriente.</p>'}
    </div>
    <div class="stack">
      <div class="card"><div class="vh"><h2>Juntas</h2><button class="btn sm" data-act="new" data-col="juntas">Nueva junta</button></div>
        <div class="list">${juntas.length?juntas.map(j=>`<div class="it"><span>${esc(fd(j.fecha))} · ${esc(cap(j.tipo))} <span class="pill ${j.estado==='celebrada'?'mut':''}">${esc(j.estado)}</span></span><span class="acts"><button class="btn sm" data-act="convocatoria" data-id="${esc(j.id)}">Convocatoria</button><button class="btn sm" data-act="acta" data-id="${esc(j.id)}">Acta</button></span></div>`).join(''):'<p class="sub" style="margin:0">Sin juntas registradas.</p>'}</div></div>
      <div class="card"><div class="vh"><h2>Incidencias abiertas</h2><button class="btn sm" data-act="new" data-col="incidencias">Nueva</button></div>
        <div class="list">${incs.length?incs.map(i=>`<div class="it"><span>${esc(i.titulo)}<div class="sub">${esc(fd(i.fecha))}${i.provId&&find('proveedores',i.provId)?' · '+esc(find('proveedores',i.provId).nombre):''}</div></span>${incPill(i.estado)}</div>`).join(''):'<p class="sub" style="margin:0">Ninguna.</p>'}</div></div>
    </div>
  </div>`;
}
function vComunidades(){
  const cs=sortedComs();
  return `${head('Comunidades',`${cs.length} comunidades administradas. El identificador de acreedor SEPA se calcula a partir del CIF.`,`<button class="btn pri" data-act="new" data-col="comunidades">Nueva comunidad</button>`)}
  <div class="tw"><table class="tbl"><thead><tr><th>Comunidad</th><th>CIF</th><th>IBAN</th><th>ID acreedor SEPA</th><th class="r">Presupuesto</th><th>Cuotas</th><th class="r">Honorarios</th><th></th></tr></thead><tbody>
  ${cs.length?cs.map(k=>`<tr><td><button class="btn link" data-act="selCom" data-id="${esc(k.id)}">${esc(k.nombre)}</button><div class="sub">${esc(k.presidente?'Presidencia: '+k.presidente:'')}</div></td><td class="nw">${esc(k.cif||'—')}</td><td class="nw">${k.iban?(ibanValid(k.iban)?esc(ibanFmt(k.iban)):'<span class="pill bad">IBAN no válido</span>'):'<span class="sub">—</span>'}</td><td class="nw">${esc(creditorId(k.cif,k.sepaSufijo)||'—')}</td><td class="r">${eur(presupuestoDe(k))}</td><td>${esc(cap(k.periodicidad||'trimestral'))}</td><td class="r">${eur(k.honorariosMes)}</td><td class="ra"><button class="btn sm" data-act="edit" data-col="comunidades" data-id="${esc(k.id)}">Editar</button> <button class="btn sm danger" data-act="delCom" data-id="${esc(k.id)}">Borrar</button></td></tr>`).join(''):'<tr><td colspan="8" class="empty">Todavía no hay comunidades.</td></tr>'}
  </tbody></table></div>`;
}
function vPropietarios(){
  const us=S.unidades.filter(inCid).sort((a,b)=>a.cid===b.cid?byRef(a,b):comName(a.cid).localeCompare(comName(b.cid),'es'));
  const all=ui.cid==='all'; const x=!all&&D.c[ui.cid];
  return `${head('Propietarios',all?'Pisos y locales de todas las comunidades.':`${us.length} pisos y locales. Coeficientes: <span class="pill ${x&&Math.abs(x.coef-100)<0.001?'ok':'warn'}">${esc(PCT.format(x?x.coef:0))} %</span>`,`<input class="search" id="q" type="search" placeholder="Buscar nombre, piso, NIF…" aria-label="Buscar" value="${esc(ui.q)}"><button class="btn" data-act="importUnits">Importar CSV</button><button class="btn" data-act="csvUnits">Exportar CSV</button><button class="btn pri" data-act="new" data-col="unidades">Añadir piso</button>`)}
  <div class="tw"><table class="tbl" id="qt"><thead><tr>${all?'<th>Comunidad</th>':''}<th>Piso</th><th class="r">Coef. %</th><th>Propietario/a</th><th>Contacto</th><th>Cobro</th><th class="r">Deuda</th><th></th></tr></thead><tbody>
  ${us.length?us.map(u=>{ const sepaOk=u.domiciliado&&ibanValid(u.iban)&&u.mandatoRef&&u.mandatoFecha;
    return `<tr data-s="${esc([u.ref,u.propietario,u.nif,u.email,u.telefono,u.inquilino,comName(u.cid)].join(' ').toLowerCase())}">${all?`<td class="sub">${esc(comName(u.cid))}</td>`:''}<td class="nw"><b>${esc(u.ref)}</b> <span class="sub">${esc(u.tipo||'')}</span></td><td class="r">${esc(PCT.format(num(u.coef)))}</td><td>${esc(u.propietario)}<div class="sub">${esc(u.nif||'')}${u.inquilino?' · Inquilino: '+esc(u.inquilino):''}</div></td><td class="sub">${esc(u.email||'')}${u.email&&u.telefono?'<br>':''}${esc(u.telefono||'')}</td><td>${u.domiciliado?(sepaOk?'<span class="pill ok">Domiciliado</span>':'<span class="pill warn">Mandato incompleto</span>'):'<span class="pill mut">Transferencia</span>'}</td><td class="r">${D.debt[u.id]>0?`<span class="pill ${D.overdue[u.id]>0?'bad':'warn'}">${eur(D.debt[u.id])}</span>`:'—'}</td><td class="ra"><button class="btn sm" data-act="certificado" data-id="${esc(u.id)}">Certificado</button> <button class="btn sm" data-act="edit" data-col="unidades" data-id="${esc(u.id)}">Editar</button> <button class="btn sm danger" data-act="del" data-col="unidades" data-id="${esc(u.id)}">Borrar</button></td></tr>`;}).join(''):`<tr><td colspan="8" class="empty">${all?'No hay pisos dados de alta.':'Esta comunidad no tiene pisos. Añádelos uno a uno o impórtalos desde un CSV.'}</td></tr>`}
  </tbody></table></div>`;
}
function vRecibos(){
  let rs=S.recibos.filter(inCid);
  const periodos=[...new Set(rs.map(r=>r.periodo))].sort().reverse();
  if(ui.recPeriodo&&!periodos.includes(ui.recPeriodo)) ui.recPeriodo='';
  if(ui.recPeriodo) rs=rs.filter(r=>r.periodo===ui.recPeriodo);
  if(ui.recEstado==='abiertos') rs=rs.filter(r=>r.estado!=='cobrado'); else if(ui.recEstado!=='todos') rs=rs.filter(r=>r.estado===ui.recEstado);
  rs.sort((a,b)=>String(b.periodo).localeCompare(a.periodo)||comName(a.cid).localeCompare(comName(b.cid),'es')||byRef(find('unidades',a.uid)||{},find('unidades',b.uid)||{}));
  const all=ui.cid==='all'; const t=today();
  return `${head('Recibos y cobros','Genera las cuotas por coeficiente, crea la remesa SEPA para el banco y marca cobros y devoluciones.',`<button class="btn" data-act="csvRecibos">Exportar CSV</button><button class="btn" data-act="new" data-col="recibos">Recibo suelto</button><button class="btn" data-act="remesa">Remesa SEPA</button><button class="btn pri" data-act="genRecibos">Generar recibos</button>`)}
  <div class="filters"><label class="sub" for="fEst">Estado</label><select id="fEst" data-filter="recEstado">${[['abiertos','Pendientes y devueltos'],['pendiente','Pendientes'],['devuelto','Devueltos'],['cobrado','Cobrados'],['todos','Todos']].map(([v,l])=>`<option value="${v}" ${ui.recEstado===v?'selected':''}>${l}</option>`).join('')}</select>
  <label class="sub" for="fPer">Periodo</label><select id="fPer" data-filter="recPeriodo"><option value="">Todos</option>${periodos.map(p=>`<option ${ui.recPeriodo===p?'selected':''}>${esc(p)}</option>`).join('')}</select>
  <input class="search" id="q" type="search" placeholder="Buscar propietario o piso…" aria-label="Buscar" value="${esc(ui.q)}"></div>
  <div class="tw"><table class="tbl" id="qt"><thead><tr><th>Periodo</th>${all?'<th>Comunidad</th>':''}<th>Piso / propietario</th><th>Concepto</th><th class="r">Importe</th><th>Vence</th><th>Estado</th><th></th></tr></thead><tbody>
  ${rs.length?rs.map(r=>{const u=find('unidades',r.uid); const venc=r.estado!=='cobrado'&&r.vencimiento&&r.vencimiento<t;
    return `<tr data-s="${esc([r.periodo,r.concepto,u&&u.ref,u&&u.propietario,comName(r.cid)].join(' ').toLowerCase())}"><td class="nw">${esc(r.periodo)}</td>${all?`<td class="sub">${esc(comName(r.cid))}</td>`:''}<td>${esc(unitLabel(u))}</td><td>${esc(r.concepto)}${r.tipo==='derrama'?' <span class="pill">derrama</span>':''}</td><td class="r">${eur(r.importe)}</td><td class="nw ${venc?'':'sub'}">${venc?`<span class="pill bad">${esc(fd(r.vencimiento))}</span>`:esc(fd(r.vencimiento))}</td><td>${estPill(r.estado)}${r.estado==='cobrado'&&r.fechaCobro?`<div class="sub">${esc(fd(r.fechaCobro))}</div>`:''}</td><td class="ra">${r.estado!=='cobrado'?`<button class="btn sm" data-act="recEstado" data-id="${esc(r.id)}" data-v="cobrado">Cobrado</button> `:''}${r.estado==='cobrado'?`<button class="btn sm" data-act="recEstado" data-id="${esc(r.id)}" data-v="devuelto">Devuelto</button> `:''}<button class="btn sm" data-act="edit" data-col="recibos" data-id="${esc(r.id)}">Editar</button> <button class="btn sm danger" data-act="del" data-col="recibos" data-id="${esc(r.id)}" aria-label="Borrar recibo">×</button></td></tr>`;}).join(''):`<tr><td colspan="8" class="empty">No hay recibos con estos filtros.</td></tr>`}
  </tbody>${rs.length?`<tfoot><tr><td colspan="${all?4:3}">${rs.length} recibos</td><td class="r">${eur(sum(rs.map(r=>r.importe)))}</td><td colspan="3"></td></tr></tfoot>`:''}</table></div>`;
}
function vGastos(){
  let gs=S.gastos.filter(inCid); const anios=[...new Set(gs.map(g=>String(g.fecha).slice(0,4)).concat([String(new Date().getFullYear())]))].sort().reverse();
  if(ui.gasAnio) gs=gs.filter(g=>String(g.fecha).startsWith(ui.gasAnio));
  gs.sort((a,b)=>String(b.fecha).localeCompare(a.fecha));
  const byCat={}; gs.forEach(g=>byCat[g.categoria||'Otros']=(byCat[g.categoria||'Otros']||0)+num(g.importe));
  const all=ui.cid==='all'; const pendPago=sum(gs.filter(g=>!g.pagado).map(g=>g.importe));
  return `${head('Gastos','Facturas de proveedores por comunidad. El informe 347 lista los proveedores que superan 3.005,06 € al año.',`<button class="btn" data-act="m347">Informe 347</button><button class="btn" data-act="csvGastos">Exportar CSV</button><button class="btn pri" data-act="new" data-col="gastos">Añadir gasto</button>`)}
  <div class="filters"><label class="sub" for="fAn">Año</label><select id="fAn" data-filter="gasAnio"><option value="">Todos</option>${anios.map(a=>`<option ${ui.gasAnio===a?'selected':''}>${a}</option>`).join('')}</select>
  <input class="search" id="q" type="search" placeholder="Buscar concepto o proveedor…" aria-label="Buscar" value="${esc(ui.q)}"></div>
  <div class="tiles">${tile('Total',eur(sum(gs.map(g=>g.importe))),gs.length+' facturas')}${tile('Pendiente de pagar',eur(pendPago),'',pendPago>0?'warn':'')}${Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([c,v])=>tile(c,eur(v))).join('')}</div>
  <div class="tw"><table class="tbl" id="qt"><thead><tr><th>Fecha</th>${all?'<th>Comunidad</th>':''}<th>Proveedor</th><th>Concepto</th><th>Categoría</th><th class="r">Importe</th><th>Pago</th><th></th></tr></thead><tbody>
  ${gs.length?gs.map(g=>{const p=find('proveedores',g.provId); return `<tr data-s="${esc([g.concepto,g.categoria,p&&p.nombre,comName(g.cid)].join(' ').toLowerCase())}"><td class="nw">${esc(fd(g.fecha))}</td>${all?`<td class="sub">${esc(comName(g.cid))}</td>`:''}<td>${esc(p?p.nombre:'—')}</td><td>${esc(g.concepto)}${g.fondoReserva?' <span class="pill">fondo de reserva</span>':''}</td><td class="sub">${esc(g.categoria||'')}</td><td class="r">${eur(g.importe)}</td><td><button class="btn sm" data-act="gasPagado" data-id="${esc(g.id)}" aria-label="Cambiar estado de pago">${g.pagado?'<span class="pill ok">Pagado</span>':'<span class="pill warn">Pendiente</span>'}</button></td><td class="ra"><button class="btn sm" data-act="edit" data-col="gastos" data-id="${esc(g.id)}">Editar</button> <button class="btn sm danger" data-act="del" data-col="gastos" data-id="${esc(g.id)}" aria-label="Borrar gasto">×</button></td></tr>`;}).join(''):`<tr><td colspan="8" class="empty">No hay gastos en este periodo.</td></tr>`}
  </tbody></table></div>`;
}
function vJuntas(){
  const js=S.juntas.filter(inCid).sort((a,b)=>String(b.fecha).localeCompare(a.fecha)); const t=today(); const all=ui.cid==='all';
  return `${head('Juntas y actas','La convocatoria incluye automáticamente la relación de morosos (art. 16.2 LPH) y una hoja de delegación de voto.',`<button class="btn pri" data-act="new" data-col="juntas">Nueva junta</button>`)}
  <div class="tw"><table class="tbl"><thead><tr><th>Fecha</th>${all?'<th>Comunidad</th>':''}<th>Tipo</th><th>Orden del día</th><th>Estado</th><th></th></tr></thead><tbody>
  ${js.length?js.map(j=>{ const dias=j.fecha?daysBetween(t,j.fecha):null; const aviso=j.estado==='convocada'&&j.tipo==='ordinaria'&&dias!==null&&dias>=0&&dias<6;
    return `<tr><td class="nw">${esc(fd(j.fecha))}<div class="sub">${esc(j.hora1||'')}${j.hora2?' / '+esc(j.hora2):''}</div></td>${all?`<td class="sub">${esc(comName(j.cid))}</td>`:''}<td>${esc(cap(j.tipo))}</td><td class="sub">${esc(String(j.orden||'').split('\n').filter(Boolean).length)} puntos · ${esc(String(j.orden||'').split('\n')[0]||'')}</td><td>${j.estado==='celebrada'?'<span class="pill mut">Celebrada</span>':'<span class="pill">Convocada</span>'}${aviso?' <span class="pill warn">Menos de 6 días de antelación</span>':''}</td><td class="ra"><button class="btn sm" data-act="convocatoria" data-id="${esc(j.id)}">Convocatoria</button> <button class="btn sm" data-act="acta" data-id="${esc(j.id)}">Acta</button> <button class="btn sm" data-act="edit" data-col="juntas" data-id="${esc(j.id)}">Editar</button> <button class="btn sm danger" data-act="del" data-col="juntas" data-id="${esc(j.id)}" aria-label="Borrar junta">×</button></td></tr>`;}).join(''):`<tr><td colspan="6" class="empty">No hay juntas registradas.</td></tr>`}
  </tbody></table></div>`;
}
function vIncidencias(){
  let is=S.incidencias.filter(inCid); if(ui.incEstado==='abiertas') is=is.filter(i=>i.estado!=='cerrada'); else if(ui.incEstado!=='todas') is=is.filter(i=>i.estado===ui.incEstado);
  const pr={alta:0,media:1,baja:2}; is.sort((a,b)=>(pr[a.prioridad]-pr[b.prioridad])||String(b.fecha).localeCompare(a.fecha)); const all=ui.cid==='all';
  return `${head('Incidencias','Averías y avisos de los vecinos. Pulsa el estado para avanzarlo: abierta → en curso → cerrada.',`<button class="btn pri" data-act="new" data-col="incidencias">Nueva incidencia</button>`)}
  <div class="filters"><label class="sub" for="fInc">Mostrar</label><select id="fInc" data-filter="incEstado">${[['abiertas','Abiertas y en curso'],['cerrada','Cerradas'],['todas','Todas']].map(([v,l])=>`<option value="${v}" ${ui.incEstado===v?'selected':''}>${l}</option>`).join('')}</select></div>
  <div class="tw"><table class="tbl"><thead><tr><th>Fecha</th>${all?'<th>Comunidad</th>':''}<th>Incidencia</th><th>Proveedor</th><th>Prioridad</th><th>Estado</th><th></th></tr></thead><tbody>
  ${is.length?is.map(i=>{const p=find('proveedores',i.provId), u=find('unidades',i.uid); return `<tr class="prio-${esc(i.prioridad)}"><td class="nw">${esc(fd(i.fecha))}</td>${all?`<td class="sub">${esc(comName(i.cid))}</td>`:''}<td><b>${esc(i.titulo)}</b>${u?` <span class="sub">· ${esc(u.ref)}</span>`:''}${i.descripcion?`<div class="sub">${esc(i.descripcion)}</div>`:''}</td><td>${esc(p?p.nombre:'—')}${p&&p.telefono?`<div class="sub">${esc(p.telefono)}</div>`:''}</td><td>${esc(cap(i.prioridad||''))}</td><td><button class="btn sm" data-act="incEstado" data-id="${esc(i.id)}" aria-label="Avanzar estado">${incPill(i.estado)}</button></td><td class="ra"><button class="btn sm" data-act="edit" data-col="incidencias" data-id="${esc(i.id)}">Editar</button> <button class="btn sm danger" data-act="del" data-col="incidencias" data-id="${esc(i.id)}" aria-label="Borrar incidencia">×</button></td></tr>`;}).join(''):`<tr><td colspan="7" class="empty">No hay incidencias con este filtro.</td></tr>`}
  </tbody></table></div>`;
}
function vProveedores(){
  const ps=[...S.proveedores].sort((a,b)=>String(a.nombre).localeCompare(b.nombre,'es')); const y=D.y;
  return `${head('Proveedores','Compartidos entre todas tus comunidades.',`<button class="btn pri" data-act="new" data-col="proveedores">Nuevo proveedor</button>`)}
  <div class="tw"><table class="tbl"><thead><tr><th>Proveedor</th><th>Servicio</th><th>Contacto</th><th class="r">Facturado ${y}</th><th></th></tr></thead><tbody>
  ${ps.length?ps.map(p=>`<tr><td><b>${esc(p.nombre)}</b><div class="sub">${esc(p.cif||'')}</div></td><td>${esc(p.servicio||'')}</td><td class="sub">${esc(p.telefono||'')}${p.telefono&&p.email?'<br>':''}${esc(p.email||'')}</td><td class="r">${eur(sum(S.gastos.filter(g=>g.provId===p.id&&String(g.fecha).startsWith(y)&&inCid(g)).map(g=>g.importe)))}</td><td class="ra"><button class="btn sm" data-act="edit" data-col="proveedores" data-id="${esc(p.id)}">Editar</button> <button class="btn sm danger" data-act="del" data-col="proveedores" data-id="${esc(p.id)}">Borrar</button></td></tr>`).join(''):'<tr><td colspan="5" class="empty">No hay proveedores.</td></tr>'}
  </tbody></table></div>`;
}
function vInstalar(){
  const st=window.GCInstall?GCInstall.estado():'manual';
  const txt={instalada:'<p style="margin:0"><span class="pill ok">Instalada</span> Estás usando la aplicación instalada.</p>',
    boton:'<p class="sub" style="margin:0">Instálala en este dispositivo: tendrás su icono y se abrirá en su propia ventana, como cualquier aplicación.</p><div class="acts"><button class="btn pri" data-act="instalar">Instalar la aplicación</button></div>',
    ios:'<p class="sub" style="margin:0">En iPhone o iPad: abre esta página en Safari, pulsa <b>Compartir</b> (el cuadrado con la flecha) y elige <b>Añadir a pantalla de inicio</b>.</p>',
    manual:'<p class="sub" style="margin:0">En Android, Chrome o Edge: menú del navegador → <b>Instalar aplicación</b> (o "Añadir a pantalla de inicio"). En iPhone: Safari → Compartir → <b>Añadir a pantalla de inicio</b>.</p>'}[st];
  return `<div class="card"><h2>Aplicación en el móvil y el ordenador</h2>${txt}</div>`;
}
function vAjustes(){
  const c=S.config; const demo=COLS.reduce((a,col)=>a+S[col].filter(x=>x.demo).length,0); const cloud=S.mode==='cloud';
  if(cloud&&S.equipo===null) setTimeout(loadEquipo,0);
  const eq=S.equipo; const admin=cloud&&S.despacho.rol==='admin';
  const equipo=!cloud?'':`<div class="card"><div class="vh"><h2>Equipo del despacho</h2>${admin?'<button class="btn sm" data-act="invitar">Añadir persona</button>':''}</div>
    ${!eq||eq==='cargando'?'<p class="sub" style="margin:0">Cargando…</p>':eq.error?`<p class="notice">${esc(eq.error)}</p>`:`<div class="list">${eq.map(m=>`<div class="it"><span>${esc(m.email)}${m.user_id===S.user.id?' <span class="sub">(tú)</span>':''}</span><span class="acts"><span class="pill ${m.rol==='admin'?'':'mut'}">${esc({admin:'Administrador',editor:'Editor',lectura:'Solo lectura'}[m.rol]||m.rol)}</span>${admin&&m.user_id!==S.user.id?`<button class="btn sm danger" data-act="quitar" data-id="${esc(m.user_id)}" data-email="${esc(m.email)}">Quitar</button>`:''}</span></div>`).join('')}</div>`}
    <p class="sub" style="margin:0">Administrador: gestiona el equipo. Editor: trabaja con todos los datos. Solo lectura: consulta sin modificar.</p></div>`;
  const sesion=cloud?`<div class="card"><h2>Tu sesión</h2><dl class="kv"><dt>Usuario</dt><dd>${esc(S.user.email)}</dd><dt>Despacho</dt><dd>${S.despachos.length>1?`<select id="desSel" aria-label="Cambiar de despacho">${S.despachos.map(d=>`<option value="${esc(d.id)}" ${d.id===S.despacho.id?'selected':''}>${esc(d.nombre)}</option>`).join('')}</select>`:esc(S.despacho.nombre)}</dd></dl><div class="acts"><button class="btn" data-act="nuevoDespacho">Crear otro despacho</button><button class="btn" data-act="logout">Cerrar sesión</button></div></div>`:'';
  const donde=cloud?'En el servidor del despacho. Cada despacho solo ve sus propios datos, y dentro de él cada persona según su rol. Los cambios quedan registrados en un historial.'
    :'En este navegador, sin cuenta. Nadie más los ve, pero si borras los datos del navegador o cambias de ordenador se pierden: descarga copias de seguridad.';
  return `${head('Ajustes')}
  <div class="cols"><div class="stack">
    <div class="card"><div class="vh"><h2>Datos del despacho</h2><button class="btn sm" data-act="despacho">Editar</button></div>
      ${c.nombre?`<dl class="kv"><dt>Nombre</dt><dd>${esc(c.nombre)}</dd><dt>NIF</dt><dd>${esc(c.nif||'—')}</dd><dt>Colegiado</dt><dd>${esc(c.colegiado||'—')}</dd><dt>Dirección</dt><dd>${esc(c.direccion||'—')}</dd><dt>Contacto</dt><dd>${esc([c.telefono,c.email].filter(Boolean).join(' · ')||'—')}</dd></dl>`:'<p class="sub" style="margin:0">Aún no has indicado los datos del despacho. Aparecen en convocatorias, actas y certificados como Secretario-Administrador.</p>'}</div>
    ${equipo}
    <div class="card"><h2>Copia de seguridad</h2><p class="sub" style="margin:0">Descarga todos los datos en un archivo JSON y guárdalo aparte. Con ese archivo puedes restaurarlos aquí o en otra instalación.</p><div class="acts"><button class="btn pri" data-act="backup">Descargar copia</button><button class="btn" data-act="restore">Restaurar copia</button></div></div>
    <div class="card"><h2>Datos de ejemplo</h2>${demo?`<p class="sub" style="margin:0">Hay ${demo} registros de ejemplo (dos comunidades ficticias). Bórralos antes de empezar con tus comunidades reales.</p><div class="acts"><button class="btn danger" data-act="delDemo">Borrar datos de ejemplo</button></div>`:`<p class="sub" style="margin:0">Carga dos comunidades ficticias con pisos, recibos, gastos y juntas para probar todas las funciones.</p><div class="acts"><button class="btn" data-act="loadDemo">Cargar datos de ejemplo</button></div>`}</div>
  </div><div class="stack">
    ${vInstalar()}
    ${sesion}
    <div class="card"><h2>Dónde se guardan los datos</h2><p style="margin:0">${donde}</p>
      ${S.mode==='local'&&cloudConfigured()?'<div class="acts"><button class="btn pri" data-act="modoCloud">Entrar con mi cuenta</button></div>':''}
      <p class="sub" style="margin:0">Vas a guardar datos personales de propietarios (nombre, NIF, IBAN). Como administrador eres encargado del tratamiento de cada comunidad: firma con ellas el contrato de encargo (art. 28 RGPD).</p></div>
    <div class="card"><h2>Cómo se calcula</h2><dl class="kv"><dt>Saldo</dt><dd>Saldo inicial + recibos cobrados − gastos pagados desde la fecha del saldo</dd><dt>Moroso</dt><dd>Recibo pendiente o devuelto con el vencimiento ya pasado</dd><dt>Reparto</dt><dd>Importe × coeficiente ÷ suma de coeficientes; los céntimos sobrantes van al piso con mayor coeficiente</dd><dt>Remesa</dt><dd>Fichero SEPA pain.008.001.02, esquema CORE, secuencia RCUR</dd></dl></div>
  </div></div>`;
}
const VIEW_FN={panel:vPanel,comunidades:vComunidades,propietarios:vPropietarios,recibos:vRecibos,gastos:vGastos,juntas:vJuntas,incidencias:vIncidencias,proveedores:vProveedores,ajustes:vAjustes};

function render(){
  const gate={login:vLogin,nuevoDespacho:vNuevoDespacho,portal:()=>vPortal(),alta:()=>vAlta(),error:()=>`<div class="auth card"><h1>No se ha podido cargar</h1><p class="notice">${esc(S.error)}</p><div class="acts"><button class="btn pri" onclick="location.reload()">Reintentar</button>${sb?'<button class="btn" data-act="logout">Cerrar sesión</button>':''}${cloudConfigured()?'<button class="btn" data-act="modoLocal">Probar sin cuenta</button>':''}</div></div>`}[S.mode];
  document.body.classList.toggle('gated',!!gate||S.mode==='cargando');
  if(gate){ $('#nav').innerHTML=''; $('#mode').innerHTML=''; $('#view').innerHTML=gate(); const f=$('#view input'); if(f) f.focus(); return; }
  if(ui.cid!=='all'&&allLoaded()&&!com(ui.cid)){ ui.cid='all'; lsSet('cid','all'); }
  D=derive();
  const morTot=Object.values(D.c).reduce((a,x)=>a+(ui.cid==='all'||D.c[ui.cid]===x?x.morosos.size:0),0);
  const incTot=Object.entries(D.c).reduce((a,[id,x])=>a+(ui.cid==='all'||ui.cid===id?x.inc:0),0);
  const badge={recibos:morTot?`<span class="n bad" title="Morosos">${morTot}</span>`:'',incidencias:incTot?`<span class="n">${incTot}</span>`:''};
  for(const [k,f] of Object.entries(NAV_BADGES)){ const n=f(); if(n) badge[k]=`<span class="n">${n}</span>`; }
  $('#nav').innerHTML=VIEWS.map(([k,l])=>`<a href="#${k}" class="${k===ui.view?'on':''}" ${k===ui.view?'aria-current="page"':''}><span>${l}</span>${badge[k]||''}</a>`).join('');
  $('#csel').innerHTML=comOpts(ui.cid,true);
  $('#mode').innerHTML=S.error?`<span class="pill bad">${esc(S.error)}</span>`
    :S.mode==='cloud'?(!allLoaded()?`<span class="pill mut">${S.slow?'Sin respuesta del servidor todavía':'Cargando…'}</span>`:`<span class="pill ok" title="${esc(S.user.email)}">${esc(S.despacho.nombre)}${S.despacho.rol==='lectura'?' · solo lectura':''}</span>`)
    :S.demo?'<span class="pill">Demostración</span>':S.mode==='local'?`<a class="pill warn" href="#ajustes" title="Los datos se guardan solo en este navegador">Modo prueba: datos en este navegador</a>`:'';
  $('#despachoFoot').innerHTML=esc(S.config.nombre||(S.despacho&&S.despacho.nombre)||'')+(window.GCInstall&&GCInstall.estado()==='boton'?'<button class="btn sm" data-act="instalar" style="margin-top:8px">Instalar la aplicación</button>':'');
  const sy=$('.main').scrollTop;
  if(S.mode==='cargando'||(S.mode==='cloud'&&!allLoaded()&&!S.comunidades.length)){ $('#view').innerHTML=`<p class="sub">${S.slow?'No se puede contactar con el servidor todavía. Comprueba la conexión; la página seguirá intentándolo.':'Cargando datos…'}</p>`; return; }
  const demo=S.demo?`<div class="notice info"><b>Versión de demostración</b> con comunidades ficticias. Puedes tocar todo: los cambios se quedan solo en este navegador. <button class="btn link" data-act="resetDemo">Restablecer</button> · <button class="btn link" data-act="salirDemo">Usar con mis datos</button></div>`:S.comunidades.some(k=>k.demo)&&ui.view!=='ajustes'?`<div class="notice info">Estás viendo <b>datos de ejemplo</b> con dos comunidades ficticias. Cuando quieras empezar con las tuyas, bórralos en <a href="#ajustes">Ajustes</a>.</div>`:'';
  $('#view').innerHTML=demo+(VIEW_FN[ui.view]||vPanel)();
  $('.main').scrollTop=sy;
  applySearch();
}
function applySearch(){ const t=$('#qt'); if(!t) return; const q=ui.q.trim().toLowerCase(); t.querySelectorAll('tbody tr[data-s]').forEach(tr=>{ tr.hidden=!!q&&!tr.dataset.s.includes(q); }); }
function route(){ const h=location.hash.replace('#',''); ui.view=VIEW_FN[h]?h:'panel'; ui.q=''; }
window.addEventListener('hashchange',()=>{ route(); render(); $('.main').scrollTop=0; });
$('#csel').addEventListener('change',e=>{ ui.cid=e.target.value; lsSet('cid',ui.cid); render(); });
document.addEventListener('change',e=>{ if(e.target.id==='desSel'){ lsSet('despacho',e.target.value); lsSet('cid','all'); location.reload(); return; } const f=e.target.dataset&&e.target.dataset.filter; if(f){ ui[f]=e.target.value; render(); } });
document.addEventListener('input',e=>{ if(e.target.id==='q'){ ui.q=e.target.value; applySearch(); } });

/* ================= acciones ================= */
function defaults(schema){ const o={}; for(const f of schema){ if(f.def!==undefined) o[f.k]=f.def==='@today'?today():f.def; } return o; }
function editForm(col,item,presets){
  const schema=SCHEMA[col]; const isNew=!item;
  const data={...defaults(schema),...(isNew&&ui.cid!=='all'?{cid:ui.cid}:{}),...(presets||{}),...(item||{})};
  const m=modal((isNew?'Nuevo ':'Editar ')+NOUN[col],`<div class="fg">${schema.map(f=>fieldHtml(f,data[f.k],data)).join('')}</div>`,[{l:'Cancelar'},{l:isNew?'Crear':'Guardar cambios',pri:1,fn:async(b,setErr)=>{
    const o=readForm(schema,b); if(BEFORE_SAVE[col]) BEFORE_SAVE[col](o,item); const err=validate(schema,o); if(err){ setErr(err); return false; }
    if(isNew){ o.creado=new Date().toISOString(); await retry(()=>store.add(col,o)); toast(cap(NOUN[col])+' creado'); }
    else { await retry(()=>store.update(col,item.id,o)); toast('Cambios guardados'); }
  }}]);
  const cidSel=m.body.querySelector('#f_cid');
  if(cidSel) cidSel.addEventListener('change',()=>{ const cur={...readForm(schema,m.body),cid:cidSel.value};
    for(const f of schema){ const el=m.body.querySelector('#f_'+f.k); if(!el||el===cidSel) continue;
      if(f.t==='unit') el.innerHTML=unitOpts(cidSel.value,'',f.opt);
      else if(FIELD_TYPES[f.t]&&FIELD_TYPES[f.t].dep){ const tmp=document.createElement('div'); tmp.innerHTML=FIELD_TYPES[f.t](f,'',cur,'f_'+f.k); el.replaceWith(tmp.firstElementChild); } } });
}
const ACTS={
  new:d=>editForm(d.col,null),
  edit:d=>{ const it=find(d.col,d.id); if(it) editForm(d.col,it); },
  despacho:()=>{ const schema=SCHEMA.despacho; const data={...S.config};
    modal('Datos del despacho',`<div class="fg">${schema.map(f=>fieldHtml(f,data[f.k],data)).join('')}</div>`,[{l:'Cancelar'},{l:'Guardar',pri:1,fn:async(b,setErr)=>{ const o=readForm(schema,b); const e=validate(schema,o); if(e){ setErr(e); return false; } await retry(()=>store.set('config','despacho',{...S.config,...o})); toast('Datos del despacho guardados'); }}]); },
  del:async d=>{ const it=find(d.col,d.id); if(!it) return; if(!await confirmBox(`¿Borrar este ${NOUN[d.col]}? No se puede deshacer.`,'Borrar',true)) return; try{ await retry(()=>store.del(d.col,d.id)); toast('Borrado'); }catch(e){ toast(errMsg(e)); } },
  delCom:async d=>{ const k=com(d.id); if(!k) return; const rel=COLS.filter(c=>c!=='comunidades'&&c!=='proveedores').map(c=>[c,S[c].filter(x=>x.cid===k.id)]); const n=rel.reduce((a,[,v])=>a+v.length,0);
    if(!await confirmBox(`¿Borrar <b>${esc(k.nombre)}</b>${n?` y sus ${n} registros (pisos, recibos, gastos, juntas e incidencias)`:''}? Descarga antes una copia de seguridad si tienes dudas.`,'Borrar comunidad',true)) return;
    try{ for(const [c,v] of rel) for(const x of v) await retry(()=>store.del(c,x.id)); await retry(()=>store.del('comunidades',k.id)); toast('Comunidad borrada'); }catch(e){ toast(errMsg(e)); } },
  selCom:d=>{ ui.cid=d.id; lsSet('cid',d.id); if(ui.view!=='panel') location.hash='#panel'; else render(); },
  recEstado:async d=>{ const r=find('recibos',d.id); if(!r) return; const o={estado:d.v}; if(d.v==='cobrado') o.fechaCobro=today(); try{ await retry(()=>store.update('recibos',r.id,o)); }catch(e){ toast(errMsg(e)); } },
  gasPagado:async d=>{ const g=find('gastos',d.id); if(g) try{ await retry(()=>store.update('gastos',g.id,{pagado:!g.pagado})); }catch(e){ toast(errMsg(e)); } },
  incEstado:async d=>{ const i=find('incidencias',d.id); if(!i) return; const nx={abierta:'en curso','en curso':'cerrada',cerrada:'abierta'}[i.estado]||'abierta'; try{ await retry(()=>store.update('incidencias',i.id,{estado:nx})); }catch(e){ toast(errMsg(e)); } },
  certificado:d=>{ const u=find('unidades',d.id); if(!u) return; openDoc(docCertificado(u),`certificado_deuda_${slug(comName(u.cid))}_${slug(u.ref)}.html`); },
  convocatoria:d=>{ const j=find('juntas',d.id); if(!j) return; openDoc(docConvocatoria(j),`convocatoria_${slug(comName(j.cid))}_${j.fecha||''}.html`); },
  acta:d=>{ const j=find('juntas',d.id); if(!j) return; openDoc(docActa(j),`acta_${slug(comName(j.cid))}_${j.fecha||''}.html`); },
  genRecibos:()=>genRecibos(),
  remesa:()=>remesa(),
  m347:()=>m347(),
  importUnits:()=>importUnits(),
  csvUnits:()=>{ const us=S.unidades.filter(inCid).sort(byRef); const c=toCSV(['comunidad','ref','tipo','coef','propietario','nif','email','telefono','iban','domiciliado','mandatoRef','mandatoFecha','inquilino','deuda'],us.map(u=>[comName(u.cid),u.ref,u.tipo,num(u.coef),u.propietario,u.nif,u.email,u.telefono,u.iban,u.domiciliado?'si':'no',u.mandatoRef,u.mandatoFecha,u.inquilino,r2(D.debt[u.id]||0)])); saveFile(`propietarios_${slug(ui.cid==='all'?'todas':comName(ui.cid))}.csv`,c); },
  csvRecibos:()=>{ const rs=S.recibos.filter(inCid).sort((a,b)=>String(a.periodo).localeCompare(b.periodo)); const c=toCSV(['comunidad','periodo','piso','propietario','concepto','tipo','importe','emision','vencimiento','estado','fechaCobro'],rs.map(r=>{const u=find('unidades',r.uid)||{}; return [comName(r.cid),r.periodo,u.ref,u.propietario,r.concepto,r.tipo,num(r.importe),r.emision,r.vencimiento,r.estado,r.fechaCobro];})); saveFile(`recibos_${slug(ui.cid==='all'?'todas':comName(ui.cid))}.csv`,c); },
  csvGastos:()=>{ const gs=S.gastos.filter(inCid).filter(g=>!ui.gasAnio||String(g.fecha).startsWith(ui.gasAnio)).sort((a,b)=>String(a.fecha).localeCompare(b.fecha)); const c=toCSV(['comunidad','fecha','proveedor','nif proveedor','concepto','categoria','importe','pagado','fondo reserva'],gs.map(g=>{const p=find('proveedores',g.provId)||{}; return [comName(g.cid),g.fecha,p.nombre,p.cif,g.concepto,g.categoria,num(g.importe),g.pagado?'si':'no',g.fondoReserva?'si':'no'];})); saveFile(`gastos_${slug(ui.cid==='all'?'todas':comName(ui.cid))}_${ui.gasAnio||'todos'}.csv`,c); },
  backup:()=>{ const data={}; COLS.forEach(c=>data[c]=S[c]); const j=JSON.stringify({app:'gestor-comunidades',version:1,exportado:new Date().toISOString(),config:S.config,data},null,1); saveFile(`copia_gestor_comunidades_${today()}.json`,j); },
  restore:()=>restore(),
  instalar:async()=>{ if(window.GCInstall) await GCInstall.instalar(); },
  loadDemo:async()=>{ const demo=window.GC_DEMO; if(!demo) return; const items=COLS.flatMap(c=>(demo[c]||[]).map(x=>[c,x])); let i=0;
    toast('Cargando datos de ejemplo…'); try{ for(const [c,{id,...o}] of items){ i++; await retry(()=>store.set(c,id,o)); } if(demo.config&&!S.config.nombre) await retry(()=>store.set('config','despacho',{...demo.config,demo:true})); toast(`${i} registros de ejemplo cargados`); }catch(e){ toast(errMsg(e)); } },
  modoLocal:()=>{ lsSet('modo','local'); location.hash=''; location.reload(); },
  modoCloud:()=>{ lsSet('modo',''); location.reload(); },
  logout:async()=>{ if(sb) await sb.auth.signOut(); lsSet('despacho',''); location.reload(); },
  nuevoDespacho:()=>{ modal('Crear otro despacho','<div class="fg"><label class="full" for="f_nd">Nombre del despacho *<input id="f_nd" type="text"></label></div><p class="sub" style="margin:0">Tendrá sus propias comunidades y su propio equipo, separado del actual.</p>',[{l:'Cancelar'},{l:'Crear',pri:1,fn:async(b,setErr)=>{ const n=$('#f_nd',b).value.trim(); if(!n) return setErr('Indica un nombre.'),false; const {data,error}=await sb.rpc('crear_despacho',{p_nombre:n}); if(error) return setErr(error.message),false; lsSet('despacho',data); location.reload(); }}]); },
  invitar:()=>{ modal('Añadir persona al despacho','<div class="fg"><label for="f_ie">Email *<input id="f_ie" type="email"></label><label for="f_ir">Rol<select id="f_ir"><option value="editor">Editor</option><option value="lectura">Solo lectura</option><option value="admin">Administrador</option></select></label></div><p class="sub" style="margin:0">La persona tiene que haber entrado al menos una vez en la aplicación con ese email (puede hacerlo y salir sin crear despacho).</p>',[{l:'Cancelar'},{l:'Añadir',pri:1,fn:async(b,setErr)=>{ const email=$('#f_ie',b).value.trim(); if(!email) return setErr('Indica el email.'),false; const {error}=await sb.rpc('invitar_miembro',{p_despacho:S.despacho.id,p_email:email,p_rol:$('#f_ir',b).value}); if(error) return setErr(error.message),false; toast('Persona añadida'); loadEquipo(); }}]); },
  quitar:async d=>{ if(!await confirmBox(`¿Quitar a ${esc(d.email)} del despacho? Dejará de ver sus datos.`,'Quitar',true)) return; const {error}=await sb.rpc('quitar_miembro',{p_despacho:S.despacho.id,p_user:d.id}); if(error) toast(error.message); else { toast('Persona quitada'); loadEquipo(); } },
  delDemo:async()=>{ const items=COLS.flatMap(c=>S[c].filter(x=>x.demo).map(x=>[c,x.id])); if(!await confirmBox(`¿Borrar los ${items.length} registros de ejemplo? Tus datos reales no se tocan.`,'Borrar ejemplo',true)) return;
    try{ for(const [c,id] of items) await retry(()=>store.del(c,id)); ui.cid='all'; lsSet('cid','all'); toast('Datos de ejemplo borrados'); }catch(e){ toast(errMsg(e)); } }
};
document.addEventListener('click',e=>{ const b=e.target.closest('[data-act]'); if(!b) return; const fn=ACTS[b.dataset.act]; if(fn){ e.preventDefault(); fn(b.dataset,b); } });

function suggestPeriod(per){ const d=new Date(), y=d.getFullYear(), m=d.getMonth()+1;
  return per==='mensual'?`${y}-${pad(m)}`:per==='semestral'?`${y}-S${m<=6?1:2}`:per==='anual'?`${y}`:`${y}-T${Math.ceil(m/3)}`; }
function genRecibos(){
  const html=`<div class="fg">
    <label for="g_cid">Comunidad *<select id="g_cid">${comOpts(ui.cid!=='all'?ui.cid:'')}</select></label>
    <label for="g_tipo">Tipo<select id="g_tipo"><option value="ordinaria">Cuota ordinaria</option><option value="derrama">Derrama</option></select></label>
    <label for="g_per">Periodo *<input id="g_per" type="text"><small>Ej.: 2026-T4, 2026-11</small></label>
    <label for="g_tot">Importe total a repartir (€) *<input id="g_tot" type="text" inputmode="decimal"><small id="g_hint"></small></label>
    <label class="full" for="g_con">Concepto que verá el propietario *<input id="g_con" type="text"></label>
    <label for="g_emi">Fecha de emisión<input id="g_emi" type="date" value="${today()}"></label>
    <label for="g_ven">Vencimiento<input id="g_ven" type="date" value="${addDays(today(),10)}"></label>
  </div><div id="g_prev"></div>`;
  let rows=[];
  const m=modal('Generar recibos por coeficiente',html,[{l:'Cancelar'},{l:'Crear recibos',pri:1,fn:async(b,setErr,btn)=>{
    const cid=$('#g_cid',b).value, per=$('#g_per',b).value.trim(), con=$('#g_con',b).value.trim();
    if(!cid) return setErr('Elige la comunidad.'),false; if(!per||!con) return setErr('Indica el periodo y el concepto.'),false; if(!rows.length) return setErr('No hay importe o pisos con coeficiente para repartir.'),false;
    const dup=S.recibos.filter(r=>r.cid===cid&&r.periodo===per&&r.concepto===con).length;
    if(dup&&!b.dataset.dupOk){ b.dataset.dupOk='1'; setErr(`Ya existen ${dup} recibos con este periodo y concepto. Pulsa otra vez "Crear recibos" para crearlos igualmente.`); return false; }
    const tipo=$('#g_tipo',b).value, emi=$('#g_emi',b).value, ven=$('#g_ven',b).value; let i=0;
    for(const r of rows){ i++; setErr(`Creando ${i} de ${rows.length}…`,true); await retry(()=>store.add('recibos',{cid,uid:r.u.id,periodo:per,concepto:con,tipo,importe:r.imp,emision:emi,vencimiento:ven,estado:'pendiente',fechaCobro:'',creado:new Date().toISOString()})); }
    toast(`${rows.length} recibos creados`); ui.recPeriodo=per; ui.recEstado='abiertos'; if(ui.cid!==cid){ ui.cid=cid; lsSet('cid',cid); } if(ui.view!=='recibos') location.hash='#recibos'; else render();
  }}],{wide:1});
  const b=m.body; const touched={};
  const preview=()=>{ const cid=$('#g_cid',b).value, tot=num($('#g_tot',b).value); const us=cid?unitsOf(cid):[]; rows=splitByCoef(us,tot); delete b.dataset.dupOk;
    const sc=us.reduce((a,u)=>a+num(u.coef),0);
    $('#g_prev',b).innerHTML=!cid?'':!us.length?'<p class="notice">Esta comunidad no tiene pisos dados de alta.</p>':`${Math.abs(sc-100)>0.001?`<p class="notice">Los coeficientes suman ${esc(PCT.format(sc))} %, no 100 %. Se reparte en proporción a lo que suman.</p>`:''}<div class="prev"><table class="tbl"><thead><tr><th>Piso</th><th>Propietario/a</th><th class="r">Coef. %</th><th class="r">Importe</th></tr></thead><tbody>${us.map(u=>{const r=rows.find(x=>x.u===u); return `<tr><td>${esc(u.ref)}</td><td>${esc(u.propietario)}</td><td class="r">${esc(PCT.format(num(u.coef)))}</td><td class="r">${r?eur(r.imp):'—'}</td></tr>`;}).join('')}</tbody><tfoot><tr><td colspan="3">${rows.length} recibos</td><td class="r">${eur(sum(rows.map(r=>r.imp)))}</td></tr></tfoot></table></div>`; };
  const fill=()=>{ const k=com($('#g_cid',b).value); const tipo=$('#g_tipo',b).value;
    if(k){ const per=suggestPeriod(k.periodicidad); if(!touched.per) $('#g_per',b).value=per; const p=$('#g_per',b).value;
      if(!touched.con) $('#g_con',b).value=(tipo==='derrama'?'Derrama ':'Cuota ordinaria ')+p;
      const cuota=r2(presupuestoDe(k)/(PPY[k.periodicidad]||4));
      if(!touched.tot) $('#g_tot',b).value=tipo==='ordinaria'&&cuota?String(cuota).replace('.',','):'';
      $('#g_hint',b).textContent=tipo==='ordinaria'?`Presupuesto ${eur(presupuestoDe(k))} ÷ ${PPY[k.periodicidad]||4} (${k.periodicidad||'trimestral'})`:'Importe total aprobado en junta'; }
    preview(); };
  $('#g_cid',b).addEventListener('change',fill); $('#g_tipo',b).addEventListener('change',()=>{ touched.tot=false; touched.con=false; fill(); });
  $('#g_per',b).addEventListener('input',()=>{ touched.per=true; if(!touched.con){ const t=$('#g_tipo',b).value; $('#g_con',b).value=(t==='derrama'?'Derrama ':'Cuota ordinaria ')+$('#g_per',b).value; } delete b.dataset.dupOk; });
  $('#g_con',b).addEventListener('input',()=>{ touched.con=true; delete b.dataset.dupOk; });
  $('#g_tot',b).addEventListener('input',()=>{ touched.tot=true; preview(); });
  fill();
}
function remesa(){
  const html=`<div class="fg">
    <label for="s_cid">Comunidad *<select id="s_cid">${comOpts(ui.cid!=='all'?ui.cid:'')}</select></label>
    <label for="s_per">Recibos<select id="s_per"></select></label>
    <label for="s_fec">Fecha de cargo en cuenta *<input id="s_fec" type="date" value="${addDays(today(),5)}"><small>Envía el fichero al banco al menos 2 días hábiles antes</small></label>
    <label class="chk" for="s_mark"><input type="checkbox" id="s_mark" checked> Marcar como cobrados al generar (después podrás marcar las devoluciones)</label>
  </div><div id="s_prev"></div>`;
  let ok=[];
  const m=modal('Remesa SEPA de adeudos directos',html,[{l:'Cancelar'},{l:'Descargar remesa',pri:1,fn:async(b,setErr)=>{
    const k=com($('#s_cid',b).value), fecha=$('#s_fec',b).value;
    if(!k) return setErr('Elige la comunidad.'),false;
    if(!ibanValid(k.iban)) return setErr('La comunidad no tiene un IBAN válido. Edítala en Comunidades.'),false;
    if(!k.cif) return setErr('La comunidad no tiene CIF: hace falta para el identificador de acreedor.'),false;
    if(!fecha||fecha<today()) return setErr('La fecha de cargo no puede ser anterior a hoy.'),false;
    if(!ok.length) return setErr('No hay recibos que se puedan domiciliar.'),false;
    const now=new Date(); const stamp=`${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const msgId=`REM-${stamp}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
    const xml=buildPain008({msgId,creDtTm:now.toISOString().slice(0,19),cdtrNm:k.nombre,cdtrIban:k.iban,cdtrBic:(k.bic||'').trim(),cdtrId:creditorId(k.cif,k.sepaSufijo),fecha,
      items:ok.map(({r,u})=>({e2e:e2eRecibo(r.id),importe:num(r.importe),mandato:u.mandatoRef,mandatoFecha:u.mandatoFecha,nombre:u.propietario,iban:u.iban,concepto:`${k.nombre} ${u.ref} ${r.concepto}`}))});
    const name=`remesa_${slug(k.nombre)}_${fecha}`; let saved;
    saved=saveFile(name+'.xml',xml);
    if(!saved) return setErr('No se ha descargado la remesa.'),false;
    if($('#s_mark',b).checked){ let i=0; for(const {r} of ok){ i++; setErr(`Marcando ${i} de ${ok.length}…`,true); await retry(()=>store.update('recibos',r.id,{estado:'cobrado',fechaCobro:fecha,remesa:msgId,e2e:e2eRecibo(r.id)})); } }
    else { for(const {r} of ok) await retry(()=>store.update('recibos',r.id,{remesa:msgId,e2e:e2eRecibo(r.id)})); }
    toast(`Remesa de ${ok.length} recibos (${eur(sum(ok.map(x=>x.r.importe)))}) generada`);
  }}],{wide:1});
  const b=m.body;
  const fillPer=()=>{ const cid=$('#s_cid',b).value; const ps=[...new Set(S.recibos.filter(r=>r.cid===cid&&r.estado!=='cobrado').map(r=>r.periodo))].sort().reverse(); $('#s_per',b).innerHTML='<option value="">Todos los pendientes y devueltos</option>'+ps.map(p=>`<option>${esc(p)}</option>`).join(''); };
  const preview=()=>{ const cid=$('#s_cid',b).value, per=$('#s_per',b).value; const k=com(cid); ok=[]; const no=[];
    if(!k){ $('#s_prev',b).innerHTML=''; return; }
    for(const r of S.recibos.filter(r=>r.cid===cid&&r.estado!=='cobrado'&&(!per||r.periodo===per))){ const u=find('unidades',r.uid);
      const why=!u?'Piso no encontrado':!u.domiciliado?'No domiciliado':!ibanValid(u.iban)?'IBAN no válido':!u.mandatoRef?'Falta la referencia del mandato':!u.mandatoFecha?'Falta la fecha de firma del mandato':'';
      (why?no:ok).push({r,u,why}); }
    const sortF=(a,b)=>byRef(a.u||{},b.u||{});
    ok.sort(sortF); no.sort(sortF);
    const cuenta=ibanValid(k.iban)?`<p class="sub" style="margin:0">Acreedor: ${esc(k.nombre)} · ${esc(creditorId(k.cif,k.sepaSufijo)||'sin CIF')} · Cuenta ${esc(ibanFmt(k.iban))}</p>`:'<p class="notice">La comunidad no tiene un IBAN válido.</p>';
    $('#s_prev',b).innerHTML=`${cuenta}<div class="prev"><table class="tbl"><thead><tr><th>Piso / propietario</th><th>Periodo</th><th class="r">Importe</th><th>Situación</th></tr></thead><tbody>${ok.map(({r,u})=>`<tr><td>${esc(unitLabel(u))}</td><td>${esc(r.periodo)}</td><td class="r">${eur(r.importe)}</td><td>${r.estado==='devuelto'?'<span class="pill warn">Se vuelve a pasar</span>':'<span class="pill ok">Incluido</span>'}</td></tr>`).join('')}${no.map(({r,u,why})=>`<tr><td>${esc(unitLabel(u))}</td><td>${esc(r.periodo)}</td><td class="r">${eur(r.importe)}</td><td><span class="pill mut">Fuera: ${esc(why)}</span></td></tr>`).join('')}${!ok.length&&!no.length?'<tr><td colspan="4" class="empty">No hay recibos pendientes.</td></tr>':''}</tbody><tfoot><tr><td colspan="2">${ok.length} recibos en la remesa</td><td class="r">${eur(sum(ok.map(x=>x.r.importe)))}</td><td></td></tr></tfoot></table></div>`; };
  $('#s_cid',b).addEventListener('change',()=>{ fillPer(); preview(); }); $('#s_per',b).addEventListener('change',preview);
  fillPer(); preview();
}
function m347(){
  const years=[...new Set(S.gastos.map(g=>String(g.fecha).slice(0,4)))].sort().reverse(); if(!years.length) years.push(String(new Date().getFullYear()));
  const html=`<div class="filters"><label class="sub" for="m_y">Año</label><select id="m_y">${years.map(y=>`<option ${y===(ui.gasAnio||years[0])?'selected':''}>${y}</option>`).join('')}</select><span class="sub">${ui.cid==='all'?'Todas las comunidades':esc(comName(ui.cid))}</span></div><div id="m_t"></div><p class="sub" style="margin:0">Suma de facturas por comunidad y proveedor. Revisa con tu asesor qué operaciones deben declararse en el modelo 347.</p>`;
  let rows=[];
  const calc=y=>{ const acc={}; for(const g of S.gastos.filter(inCid).filter(g=>String(g.fecha).startsWith(y))){ const key=g.cid+'|'+(g.provId||'—'); acc[key]=(acc[key]||0)+num(g.importe); }
    return Object.entries(acc).map(([k,v])=>{ const [cid,pid]=k.split('|'); return {cid,p:find('proveedores',pid),v:r2(v)}; }).filter(x=>x.v>3005.06).sort((a,b)=>b.v-a.v); };
  const m=modal('Informe para el modelo 347',html,[{l:'Cerrar'},{l:'Exportar CSV',pri:1,fn:()=>{ const c=toCSV(['comunidad','cif comunidad','proveedor','nif proveedor','importe anual'],rows.map(x=>[comName(x.cid),(com(x.cid)||{}).cif,x.p?x.p.nombre:'(sin proveedor)',x.p?x.p.cif:'',x.v])); saveFile(`modelo347_${$('#m_y',m.body).value}.csv`,c); return false; }}],{wide:1});
  const draw=()=>{ rows=calc($('#m_y',m.body).value); $('#m_t',m.body).innerHTML=`<div class="prev"><table class="tbl"><thead><tr><th>Comunidad</th><th>Proveedor</th><th>NIF</th><th class="r">Total anual</th></tr></thead><tbody>${rows.length?rows.map(x=>`<tr><td>${esc(comName(x.cid))}</td><td>${esc(x.p?x.p.nombre:'(sin proveedor)')}</td><td>${esc(x.p?x.p.cif:'')}</td><td class="r">${eur(x.v)}</td></tr>`).join(''):'<tr><td colspan="4" class="empty">Ningún proveedor supera 3.005,06 € este año.</td></tr>'}</tbody></table></div>`; };
  $('#m_y',m.body).addEventListener('change',draw); draw();
}
const UNIT_HEAD=['ref','tipo','coef','propietario','nif','email','telefono','iban','domiciliado','mandatoRef','mandatoFecha','inquilino'];
function importUnits(){
  const html=`<div class="fg"><label for="i_cid">Comunidad *<select id="i_cid">${comOpts(ui.cid!=='all'?ui.cid:'')}</select></label><label for="i_file">Archivo CSV *<input id="i_file" type="file" accept=".csv,text/csv,.txt"></label></div>
  <p class="sub" style="margin:0">Columnas (separadas por ; o ,): ${UNIT_HEAD.join(', ')}. Solo son obligatorias <b>ref</b>, <b>coef</b> y <b>propietario</b>. Las fechas en formato AAAA-MM-DD o DD/MM/AAAA. <button class="btn link" type="button" id="i_tpl">Descargar plantilla</button></p><div id="i_prev"></div>`;
  let parsed=[];
  const m=modal('Importar pisos desde CSV',html,[{l:'Cancelar'},{l:'Importar',pri:1,fn:async(b,setErr)=>{ const cid=$('#i_cid',b).value; if(!cid) return setErr('Elige la comunidad.'),false; if(!parsed.length) return setErr('Elige un archivo CSV con datos.'),false;
    let i=0; for(const u of parsed){ i++; setErr(`Importando ${i} de ${parsed.length}…`,true); await retry(()=>store.add('unidades',{...u,cid,creado:new Date().toISOString()})); } toast(`${parsed.length} pisos importados`); if(ui.cid!==cid){ ui.cid=cid; lsSet('cid',cid); } location.hash='#propietarios'; render(); }}],{wide:1});
  const b=m.body;
  $('#i_tpl',b).addEventListener('click',()=>{ const c=toCSV(UNIT_HEAD,[['1º A','vivienda',12.5,'Nombre Apellido Apellido','12345678Z','correo@ejemplo.es','600000000','ES9121000418450200051332','si','REF-001','2025-01-15','']]); saveFile('plantilla_pisos.csv',c); });
  $('#i_file',b).addEventListener('change',async e=>{ const f=e.target.files[0]; if(!f) return; const rows=parseCSV(await f.text()); if(rows.length<2){ m.setErr('El archivo no tiene filas de datos.'); return; }
    const norm=s=>s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z]/g,'');
    const alias={ref:['ref','piso','unidad','vivienda','puerta'],tipo:['tipo'],coef:['coef','coeficiente','cuota','participacion'],propietario:['propietario','nombre','titular','propietaria'],nif:['nif','dni','nie','cif'],email:['email','correo','mail'],telefono:['telefono','tel','movil'],iban:['iban','cuenta'],domiciliado:['domiciliado','domiciliacion'],mandatoRef:['mandatoref','mandato','referenciamandato'],mandatoFecha:['mandatofecha','fechamandato'],inquilino:['inquilino']};
    const h=rows[0].map(norm); const idx={}; for(const [k,al] of Object.entries(alias)){ const i=h.findIndex(x=>al.includes(x)); if(i>=0) idx[k]=i; }
    if(idx.ref===undefined||idx.coef===undefined||idx.propietario===undefined){ m.setErr('No encuentro las columnas ref, coef y propietario en la primera fila.'); parsed=[]; return; }
    const dt=s=>{ s=String(s||'').trim(); const mm=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return mm?`${mm[3]}-${pad(mm[2])}-${pad(mm[1])}`:s; };
    parsed=rows.slice(1).map(r=>{ const g=k=>idx[k]!==undefined?String(r[idx[k]]??'').trim():''; return {ref:g('ref'),tipo:g('tipo')||'vivienda',coef:num(g('coef')),propietario:g('propietario'),nif:g('nif'),email:g('email'),telefono:g('telefono'),iban:ibanClean(g('iban')),domiciliado:idx.domiciliado===undefined?!!g('iban'):/^(s|si|sí|1|true|x|yes)$/i.test(g('domiciliado')),mandatoRef:g('mandatoRef'),mandatoFecha:dt(g('mandatoFecha')),inquilino:g('inquilino'),direccionNotif:'',notas:''}; }).filter(u=>u.ref&&u.propietario);
    const bad=parsed.filter(u=>u.iban&&!ibanValid(u.iban)).length; const sc=parsed.reduce((a,u)=>a+u.coef,0);
    m.setErr(bad?`${bad} IBAN no válidos: se importarán y podrás corregirlos después.`:'',true);
    $('#i_prev',b).innerHTML=`<p style="margin:0">${parsed.length} pisos listos para importar · coeficientes suman ${esc(PCT.format(sc))} %</p><div class="prev"><table class="tbl"><thead><tr><th>Piso</th><th class="r">Coef.</th><th>Propietario/a</th><th>IBAN</th></tr></thead><tbody>${parsed.map(u=>`<tr><td>${esc(u.ref)}</td><td class="r">${esc(PCT.format(u.coef))}</td><td>${esc(u.propietario)}</td><td>${u.iban?(ibanValid(u.iban)?esc(ibanFmt(u.iban)):'<span class="pill bad">no válido</span>'):'—'}</td></tr>`).join('')}</tbody></table></div>`; });
}
function restore(){
  let data=null;
  const m=modal('Restaurar copia de seguridad',`<label class="sub" for="r_file" style="display:flex;flex-direction:column;gap:4px;font-weight:600">Archivo de copia (.json)<input id="r_file" type="file" accept=".json,application/json"></label><div id="r_prev"></div><p class="sub" style="margin:0">Los registros con el mismo identificador se sobrescriben; el resto se añade. No se borra nada.</p>`,
    [{l:'Cancelar'},{l:'Restaurar',pri:1,fn:async(b,setErr)=>{ if(!data) return setErr('Elige un archivo de copia.'),false; let n=0; const tot=COLS.reduce((a,c)=>a+(data.data[c]||[]).length,0);
      if(data.config&&Object.keys(data.config).length) await retry(()=>store.set('config','despacho',data.config));
      for(const c of COLS) for(const it of (data.data[c]||[])){ const {id,...o}=it; if(!id) continue; n++; setErr(`Restaurando ${n} de ${tot}…`,true); await retry(()=>store.set(c,id,o)); }
      toast(`${n} registros restaurados`); }}]);
  $('#r_file',m.body).addEventListener('change',async e=>{ const f=e.target.files[0]; if(!f) return; try{ const j=JSON.parse(await f.text()); if(j.app!=='gestor-comunidades'||!j.data) throw new Error(); data=j; $('#r_prev',m.body).innerHTML=`<p style="margin:0">Copia del ${esc(fd(String(j.exportado||'').slice(0,10)))}: ${COLS.map(c=>`${(j.data[c]||[]).length} ${c}`).join(', ')}.</p>`; m.setErr(''); }catch(err){ data=null; m.setErr('Este archivo no es una copia del Gestor de Comunidades.'); } });
}
