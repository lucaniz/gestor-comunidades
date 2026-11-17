# Recibir los emails de los vecinos en la ficha de cada piso

Cuando un vecino escribe al buzón de la comunidad, el email aparece en la pestaña **Correo** y en el **historial de su piso**. La aplicación lo reconoce por la dirección del remitente, que debe coincidir con el email del propietario o del inquilino guardado en el piso.

```
Vecino ──► dirección pública (p. ej. info@tudominio.es)
             │  reenvío de una copia
             ▼
        Postmark (correo entrante) ──► función «correo-entrante» de Supabase ──► historial del piso
```

- El buzón original **no cambia**: sigue recibiendo todo como siempre. Solo se reenvía una copia.
- Por defecto **solo se guardan los emails de propietarios e inquilinos registrados**. Lo demás (clientes, publicidad…) se descarta sin guardarse. Puedes cambiarlo en *Ajustes → Buzón de correo*.
- De los adjuntos se guarda solo el nombre. Los archivos se quedan en el buzón original.

Hace falta tener el **modo con cuenta** funcionando (ver el README).

---

## 1. Instalar la función en Supabase (una vez por instalación)

Con la línea de comandos de Supabase, desde la carpeta del repositorio:

```bash
npx supabase login
npx supabase functions deploy correo-entrante --no-verify-jwt --project-ref TU_PROYECTO
```

`--no-verify-jwt` es necesario porque el servicio de correo no envía un token de Supabase. La seguridad la da la clave secreta que va en la URL (paso 2).

También se puede hacer desde el panel: **Edge Functions → Deploy a new function → Via editor**. Nómbrala `correo-entrante`, pega `index.ts` y `normalizar.mjs` de `supabase/functions/correo-entrante/` y desactiva **Verify JWT**.

Vuelve a ejecutar `supabase/schema.sql` en el SQL Editor si instalaste la base de datos antes de esta función.

## 2. Crear la clave del buzón en la aplicación

En la aplicación: **Ajustes → Buzón de correo → Crear clave del buzón**. Copia la **URL para el servicio de correo entrante**. Trátala como una contraseña.

## 3. Crear el receptor en Postmark

1. Crea una cuenta en [postmarkapp.com](https://postmarkapp.com). Tiene un plan gratuito con un número limitado de emails al mes; comprueba sus precios actuales.
2. Dentro del *Server*, abre el stream **Default Inbound Stream → Settings**.
3. En **Webhook**, pega la URL del paso 2 y guarda.
4. Copia la **dirección de entrada** que muestra Postmark (algo como `a1b2c3…@inbound.postmarkapp.com`).

Para probar: envía un email a esa dirección desde el email de un propietario dado de alta en un piso. Debe aparecer en **Correo** en unos segundos.

## 4. Elegir la dirección que usan los vecinos

Cualquiera de estas opciones vale, y se puede cambiar después sin perder nada:

| Opción | Qué hacer |
|---|---|
| Usar la de Postmark | Nada más: dásela a los vecinos tal cual. |
| Un Gmail nuevo solo para la comunidad | Gmail → Configuración → **Reenvío y correo POP/IMAP** → *Añadir una dirección de reenvío* → la de Postmark. |
| Una dirección del dominio del despacho, nueva o existente (p. ej. `info@`) | Quien administra el correo del dominio entra en su panel y añade un **reenvío de una copia** hacia la dirección de Postmark (ver abajo). |

Después, en **Ajustes → Buzón de correo → Editar**, escribe la dirección que van a usar los vecinos. Se añadirá al final de tus comunicaciones.

### Reenvío en los proveedores más comunes

Lo hace **la persona que administra ese correo**, desde su propio panel:

- **Google Workspace / Gmail:** Configuración → *Reenvío y correo POP/IMAP* → *Añadir una dirección de reenvío* → *Conservar la copia en la bandeja de entrada*. Para reenviar solo los emails de vecinos, crea en su lugar un **filtro** con sus direcciones y la acción *Reenviar a*.
- **Microsoft 365 / Outlook:** Configuración → Correo → *Reenvío* → activar y *Conservar una copia de los mensajes reenviados*. Si no aparece, el administrador de la organización tiene bloqueado el reenvío externo y debe permitirlo.
- **IONOS, Dinahosting, Hostinger, cPanel y similares:** en la cuenta de correo, la opción se llama *Reenvío*, *Redirección* o *Forwarder*. Añade la dirección de Postmark y marca *conservar copia* o *guardar también en el buzón*.

**Gmail pide confirmar la dirección de reenvío** enviando un código a Postmark. Para recibirlo en la aplicación, activa temporalmente en *Ajustes → Buzón de correo* la opción de **guardar también los emails de remitentes desconocidos**. Copia el código desde **Correo → Sin identificar** y vuelve a desactivar la opción.

## Privacidad

Los emails de los vecinos son datos personales de la comunidad. Guárdalos solo para gestionarla y bórralos cuando ya no hagan falta, desde el historial del piso o desde *Correo*. Si cambias de proveedor o filtras la URL, pulsa **Nueva clave** en Ajustes: la URL anterior deja de funcionar al momento.
