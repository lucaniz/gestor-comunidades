# Gestor de Comunidades

Software para **administradores de fincas**: comunidades de propietarios, presupuestos con repartos especiales, recibos y remesas SEPA, banco, cuentas anuales, juntas y actas, honorarios, impuestos y portal del propietario. Funciona en el navegador y se instala como aplicación en el móvil y en el ordenador.

- **Demostración con datos ficticios:** https://lucaniz.github.io/gestor-comunidades/?demo
- **Aplicación:** https://lucaniz.github.io/gestor-comunidades/

## Qué hace

| Área | Funciones |
|---|---|
| Panel | Todas las comunidades de un vistazo: saldo, pendiente de cobro, morosos, incidencias, próxima junta, honorarios. Avisos automáticos (sin junta ordinaria este año, coeficientes que no suman 100 %, falta IBAN o CIF, vecinos que han dejado sus datos). |
| Comunidades | Datos fiscales, IBAN, periodicidad de cuotas, fondo de reserva (mín. 10 %, art. 9.1.f LPH), identificador de acreedor SEPA calculado del CIF. |
| Propietarios | Pisos y locales, titular, inquilino, contacto, IBAN y mandato SEPA. Importación y exportación CSV. |
| Presupuesto y repartos | Partidas del presupuesto, cada una con su reparto: general (coeficiente de la escritura) o especiales (escalera, garaje, ascensor sin bajos…), con exentos. Tabla de coeficientes editable y cuota de cada piso desglosada. Documento de presupuesto para la junta. |
| Recibos | Cuotas según el presupuesto por partidas, derramas y otros cargos con el reparto elegido, al céntimo. Cobrados, pendientes, devueltos. |
| Remesa SEPA | Fichero **pain.008.001.02** (CORE) para el banco. Deja fuera, con el motivo, los pisos sin mandato o con IBAN incorrecto. Validado contra el XSD oficial en cada cambio del código. |
| Banco | Importa el extracto en **Norma 43** o CSV y las **devoluciones SEPA** (pain.002, con el motivo). Propone con qué remesa, recibo, factura o ingreso cuadra cada movimiento y concilia automáticamente las coincidencias claras. |
| Gastos e ingresos | Facturas por comunidad, proveedor y partida, cargos al fondo de reserva, retenciones a profesionales. Otros ingresos: alquiler de la portería o la azotea, intereses, subvenciones. |
| Cuentas anuales | Liquidación del ejercicio: tesorería, gastos por partida frente al presupuesto con desviación, deudas a 31/12, fondo de reserva. Documento para la junta y estado de cuentas por propietario. |
| Juntas | Convocatoria con la relación de morosos (art. 16.2 LPH), advertencia de privación de voto (art. 15.2) y hoja de delegación. Acta (art. 19). Aviso si una ordinaria se convoca con menos de 6 días. |
| Certificados | Certificado de deuda o de estar al corriente para compraventas (art. 9.1.e LPH). |
| Honorarios | Facturas del despacho a cada comunidad con IVA y retención, numeración automática; registra el gasto en la comunidad. IVA repercutido y retenciones del trimestre. |
| Impuestos | Ayuda para los modelos 111/190 (retenciones a profesionales), 184 (rentas de la comunidad, reparto por comunero) y 347. |
| Comunicaciones | Convocatorias, actas, recordatorios de deuda y avisos a todos los propietarios, solo a los morosos o a uno, desde tu programa de correo. |
| Correo e historial | Los emails que los vecinos envían al buzón de la comunidad llegan a la pestaña **Correo** y al **historial de su piso**, junto con lo que les envías, notas de llamadas y visitas, incidencias y recibos devueltos. Guía: [docs/correo-entrante.md](docs/correo-entrante.md). |
| Recogida de emails | Enlace y **cartel con QR** para el portal: cada vecino deja su piso, email, teléfono y su consentimiento para recibir las comunicaciones por email. Tú revisas y aceptas cada respuesta. |
| Portal del propietario | El propietario entra con el email registrado en su piso: ve sus recibos, la próxima junta y los acuerdos, y comunica incidencias. |
| Incidencias y proveedores | Averías con prioridad, piso, proveedor y estado. Proveedores compartidos entre comunidades. |
| Equipo | Varios usuarios por despacho (administrador, editor, solo lectura). Historial de todos los cambios en la base de datos. |
| Copias | Copia de seguridad completa en JSON y restauración. |

## Instalar en el móvil o en el ordenador

- **Android / Chrome / Edge:** abre la aplicación y pulsa **Instalar** (en Ajustes, en la barra lateral o en el menú del navegador).
- **iPhone / iPad:** ábrela en Safari → **Compartir** → **Añadir a pantalla de inicio**.

Queda con su icono, se abre en su propia ventana y las mejoras llegan solas.

## Programa de escritorio (Windows, Mac, Linux)

En [Releases](https://github.com/lucaniz/gestor-comunidades/releases) están los instaladores: `.msi` / `-setup.exe` para Windows, `.dmg` para Mac y `.deb` / `.AppImage` para Linux. Es la misma aplicación en su propia ventana; guarda los archivos con el diálogo «Guardar como» del sistema y abre los documentos en el navegador para imprimirlos.

- Sin cuenta, los datos se guardan **en ese ordenador**: no hace falta servidor. Haz copias de seguridad desde Ajustes.
- Con cuenta (`config.js` rellenado antes de compilar), trabaja con el servidor del despacho igual que la web.
- Los instaladores **no están firmados**: la primera vez Windows avisa («Más información» → «Ejecutar de todas formas») y macOS pide permiso en Ajustes del Sistema → Privacidad y seguridad → «Abrir igualmente».

Para generar una versión nueva: sube una etiqueta (`git tag v0.2.0 && git push origin v0.2.0`). GitHub Actions compila los instaladores y los publica en Releases. Para compilar en local: `npm install && npx tauri icon icons/icon-512.png && npm run escritorio`.

## Formas de usarlo

- **Demostración** (`?demo`): datos ficticios de todos los módulos, separados de cualquier otro dato.
- **Modo prueba:** sin cuenta, los datos se quedan solo en ese navegador.
- **Modo con cuenta (Supabase):** cada administrador entra con su email y un código, crea su **despacho** y solo ve sus datos. La separación la garantiza la base de datos (Row Level Security). Es el modo para trabajar de verdad, y el que necesitan el portal del propietario y la recogida de emails.

## Poner en marcha el modo con cuenta (una vez, ~15 minutos)

1. Crea un proyecto gratuito en [supabase.com](https://supabase.com). Elige una región de la UE (Frankfurt, París o Irlanda).
2. **SQL Editor → New query**: pega [`supabase/schema.sql`](supabase/schema.sql) y pulsa **Run**. Cuando actualices la aplicación, vuelve a ejecutarlo: no borra nada.
3. **Authentication → URL Configuration**: *Site URL* y *Redirect URLs* = `https://lucaniz.github.io/gestor-comunidades/`.
4. **Authentication → Email Templates**: en *Magic Link* y en *Confirm signup* añade la línea `Tu código de acceso: {{ .Token }}`. En la aplicación instalada se entra escribiendo ese código.
5. **Project Settings → API**: copia *Project URL* y la clave *anon public* en [`config.js`](config.js). La clave *anon* es pública por diseño. **Nunca** pongas la clave *service_role*.
6. Para el día a día, configura un servidor de correo propio en **Authentication → SMTP Settings**: el correo incluido en Supabase solo envía unos pocos emails por hora.

## Dar acceso a otros administradores

No hay que instalar nada ni copiar el repositorio. Cada administrador:

1. Abre la aplicación (o la instala).
2. Escribe su email e introduce el código que recibe.
3. Pulsa **Crear despacho**. Desde ese momento trabaja con sus propias comunidades, invisibles para los demás.

Para que alguien trabaje **en tu mismo despacho** (un empleado, un socio): tiene que entrar una vez con su email; después tú lo añades en **Ajustes → Equipo**.

Los **propietarios** entran igual, con el email que figure en su piso, y ven directamente su portal.

## Pasar datos desde la versión de Claude

En la versión anterior: **Ajustes → Descargar copia**. En esta: **Ajustes → Restaurar copia** con ese archivo.

## Ficheros de ejemplo

En [`ejemplos/`](ejemplos/) hay un extracto Norma 43, un fichero de devoluciones SEPA y la plantilla CSV de pisos, para probar las importaciones en la demostración.

## Desarrollo

HTML, CSS y JavaScript sin compilación. Para verlo en local basta con abrir `index.html` (añade `?demo` para la demostración).

```
index.html, manifest.webmanifest, sw.js   página y aplicación instalable
src-tauri/            programa de escritorio (Tauri)
config.js             conexión a Supabase (vacío = modo prueba)
css/app.css           estilos
js/core.js            lógica pura con tests: repartos, IBAN, SEPA, Norma 43, devoluciones, CSV
js/store.js           almacenamiento: navegador o Supabase
js/app.js             interfaz principal
js/finanzas.js        presupuesto, banco, cuentas, honorarios, impuestos
js/portal.js          comunicaciones, recogida de emails, portal del propietario, demostración
js/correo.js          bandeja de correo, historial de cada piso, ajustes del buzón
js/demo.js            datos ficticios (se generan con `npm run demo`)
supabase/schema.sql   tablas, reglas de acceso, historial y funciones del portal
supabase/functions/   función que recibe los emails de los vecinos
tests/                tests de la lógica y validación SEPA
```

`npm install && npm test` ejecuta los tests. GitHub Actions los pasa en cada cambio, valida la remesa contra el esquema `pain.008.001.02` y publica `main` en GitHub Pages.

## Límites conocidos

- Los emails se envían desde tu programa de correo; no hay envío automático desde el servidor. Los recibidos llegan a la aplicación si se configura el buzón (ver la guía).
- El saldo y las cuentas se calculan con cobros y pagos registrados (criterio de caja). Para la contabilidad oficial por partida doble, usa tu programa o tu asesor.
- Los modelos fiscales son una ayuda para prepararlos; revísalos siempre antes de presentarlos.

## Aviso

Herramienta de apoyo. Revisa los documentos antes de enviarlos y prueba la primera remesa con tu banco con un importe pequeño. Como administrador eres encargado del tratamiento de los datos de cada comunidad (art. 28 RGPD).
