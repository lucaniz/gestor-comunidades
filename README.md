# Gestor de Comunidades

Software web para **administradores de fincas**: comunidades de propietarios, recibos por coeficiente, remesas SEPA, juntas, actas y certificados de deuda. Funciona en el navegador; no hay que instalar nada.

**Pruébalo:** https://lucaniz.github.io/gestor-comunidades/ → *Probar sin registrarte* → *Probar con datos de ejemplo*.

## Qué hace

| Área | Funciones |
|---|---|
| Panel del despacho | Todas las comunidades de un vistazo: saldo, pendiente de cobro, morosos, incidencias, próxima junta, honorarios. Avisos automáticos (sin junta ordinaria este año, coeficientes que no suman 100 %, falta IBAN o CIF). |
| Comunidades | Datos fiscales, IBAN, presupuesto, periodicidad de cuotas, fondo de reserva (mín. 10 %, art. 9.1.f LPH), identificador de acreedor SEPA calculado del CIF. |
| Propietarios | Pisos y locales con coeficiente, titular, contacto, inquilino, IBAN y mandato SEPA. Importación y exportación CSV. |
| Recibos | Generación por coeficiente (cuotas ordinarias y derramas) con reparto exacto al céntimo. Cobrados, pendientes, devueltos. |
| Remesa SEPA | Fichero **pain.008.001.02** (CORE) para el banco. Deja fuera, con el motivo, los pisos sin mandato o con IBAN incorrecto. Validado contra el XSD oficial en cada cambio del código. |
| Juntas | Convocatoria con la relación de morosos (art. 16.2 LPH), advertencia de privación de voto (art. 15.2) y hoja de delegación. Acta (art. 19). Aviso si una ordinaria se convoca con menos de 6 días. |
| Certificados | Certificado de deuda o de estar al corriente para compraventas (art. 9.1.e LPH). |
| Gastos | Facturas por comunidad y proveedor, pagos pendientes, cargos al fondo de reserva, informe para el modelo 347. |
| Incidencias | Averías con prioridad, piso afectado, proveedor asignado y estado. |
| Equipo | Varios usuarios por despacho con rol de administrador, editor o solo lectura. Historial de todos los cambios. |
| Copias | Copia de seguridad completa en JSON y restauración. |

## Dos formas de usarlo

**Modo prueba (sin cuenta).** Los datos se guardan solo en el navegador de quien lo usa. Sirve para probar; para trabajar de verdad, usa el modo con cuenta.

**Modo con cuenta (Supabase).** Cada administrador entra con su email (enlace mágico, sin contraseña), crea su **despacho** y solo ve sus datos. La separación la garantiza la propia base de datos (Row Level Security), no la aplicación.

## Poner en marcha el modo con cuenta (una vez, ~15 minutos)

1. Crea un proyecto gratuito en [supabase.com](https://supabase.com). Elige una región de la UE (Frankfurt, París o Irlanda).
2. **SQL Editor → New query**, pega el contenido de [`supabase/schema.sql`](supabase/schema.sql) y pulsa **Run**.
3. **Authentication → URL Configuration**:
   - *Site URL*: `https://lucaniz.github.io/gestor-comunidades/`
   - *Redirect URLs*: añade la misma dirección.
4. **Project Settings → API**: copia *Project URL* y la clave *anon public* en [`config.js`](config.js). La clave *anon* es pública por diseño. **Nunca** pongas la clave *service_role*.
5. Para uso diario, configura un servidor de correo propio en **Authentication → SMTP Settings**: el correo incluido en Supabase solo envía unos pocos emails por hora.

## Dar acceso a otro administrador de fincas

No hay que instalar nada ni copiar el repositorio:

1. Abre la dirección de la aplicación.
2. Escribe tu email y abre el enlace que llega al correo.
3. Pulsa **Crear despacho**. A partir de ahí trabaja con sus propias comunidades, invisibles para los demás despachos.

Para que alguien trabaje **en tu mismo despacho** (un empleado, un socio): tiene que entrar una vez con su email; después tú, desde **Ajustes → Equipo → Añadir persona**, le das el rol que corresponda.

## Pasar datos desde la versión de Claude

En la versión anterior: **Ajustes → Descargar copia**. En esta: **Ajustes → Restaurar copia** con ese archivo.

## Desarrollo

Es HTML, CSS y JavaScript sin compilación. Para verlo en local basta con abrir `index.html` en el navegador.

```
index.html            página
config.js             conexión a Supabase (vacío = modo prueba)
css/app.css           estilos
js/core.js            lógica pura: reparto, IBAN, SEPA, CSV (con tests)
js/store.js           almacenamiento: navegador o Supabase
js/app.js             interfaz
js/demo.js            datos de ejemplo ficticios
supabase/schema.sql   tablas, reglas de acceso, historial y funciones
tests/                tests de la lógica y validación SEPA
```

Tests: `node --test tests/*.test.mjs`. GitHub Actions los ejecuta en cada cambio y valida la remesa generada contra el esquema `pain.008.001.02`. Cada cambio en `main` se publica solo en GitHub Pages.

## Límites conocidos y siguientes pasos

- **Contabilidad:** el saldo es una estimación (saldo inicial + cobros − pagos). Faltan la liquidación anual por partidas y las cuentas para la junta.
- **Repartos:** un solo coeficiente por piso. Faltan los repartos por escalera, garaje, ascensor o locales exentos.
- **Banco:** falta importar el extracto (Norma 43) y las devoluciones de recibos.
- **Envíos:** no se envían todavía recibos, convocatorias ni actas por email.
- **Portal del propietario** y **facturación de honorarios**: pendientes.

## Aviso

Herramienta de apoyo. Revisa los documentos antes de enviarlos y prueba la primera remesa con tu banco con un importe pequeño. Como administrador eres encargado del tratamiento de los datos de cada comunidad (art. 28 RGPD).
