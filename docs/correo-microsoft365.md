# Avisos del portal desde marco.mendez@tec.mx

La dirección está prevista como remitente, pero el envío real está desactivado. La cuenta institucional debe autorizarse para uso automático antes de activar los avisos. No se ha enviado ningún correo real de prueba.

## Solicitud propuesta a TI

Solicitamos habilitar notificaciones transaccionales del Portal del Claustro LEC desde `marco.mendez@tec.mx`: confirmación de suscripción y aviso cuando haya nuevas respuestas en una conversación.

Para un buzón de Microsoft 365, el portal utiliza Microsoft Graph desde un servicio de Cloudflare Workers, mediante una aplicación de Microsoft Entra con autenticación de aplicación. Necesitamos:

- Aplicación registrada, identificador del tenant e identificador de cliente.
- Credencial de aplicación, almacenada como secreto del servicio; no contraseña del buzón.
- Autorización institucional de envío mediante `Mail.Send`, restringida por TI exclusivamente al buzón autorizado, según el mecanismo de Exchange que use la institución. No se requiere leer mensajes ni contactos.
- Confirmación de la política institucional para enviar avisos automáticos y, si procede, límites de volumen.

El remitente será Marco Méndez. Los destinatarios deberán confirmar su correo y podrán cancelar todos los avisos desde cualquier mensaje. El correo del participante no se publica salvo que lo elija expresamente al contribuir.

## Configuración del servicio, después de la autorización

Crear los secretos `MS_TENANT_ID`, `MS_CLIENT_ID` y `MS_CLIENT_SECRET` con Wrangler o desde el panel de Cloudflare. No agregarlos al repositorio ni enviarlos en correos o conversaciones.

Configurar estas variables:

```text
MAIL_PROVIDER=microsoft
MAIL_ENABLED=true
EMAIL_FROM=marco.mendez@tec.mx
PUBLIC_PORTAL_URL=https://claustrolec.pages.dev
PUBLIC_API_URL=https://claustrolec-foro.marco-mendez.workers.dev
```

Solo activar `MAIL_ENABLED` después de tener la autorización y configuración completas. El portal ofrece las casillas y botones de avisos cuando el servicio anuncia que están disponibles. Antes muestra que los avisos aún no están activos.

## Comprobación con destinatarios autorizados

1. Solicitar avisos en una conversación propia o marcar la casilla al publicar.
2. Comprobar que llegue el correo de confirmación y pulsar «Confirmar avisos» en la página del enlace. Abrir el enlace por sí solo no activa la suscripción, para evitar que lo hagan los escáneres del correo.
3. Hacer una respuesta desde otro correo de prueba autorizado y comprobar la llegada del aviso con el enlace a la respuesta.
4. Cancelar avisos desde el mensaje y comprobar que no lleguen nuevos avisos.

Microsoft devuelve `202 Accepted` al aceptar un envío; eso no garantiza la entrega en bandeja de entrada. Si falta un mensaje, revisar el seguimiento de mensajes de Exchange y la carpeta de correo no deseado, además del buzón de salida del portal.

## Funcionamiento

- Suscripciones por conversación, activadas por confirmación y sin conexión con la casilla de mostrar públicamente el correo.
- No se activan retroactivamente para publicaciones antiguas: se solicitan con «Recibir avisos» una vez habilitado el servicio.
- Se avisa de respuestas nuevas, incluidas las respuestas a comentarios. No se envía aviso al correo que firma su propia respuesta.
- Mensajes pendientes en `email_outbox`, con hasta cinco intentos y reintentos cada cinco minutos. Los fallos de correo no impiden publicar.
- Los avisos son de mejor esfuerzo: ante una interrupción entre la aceptación del proveedor y el registro del resultado puede repetirse un mensaje. Los envíos ya registrados como completados no se repiten.
- La cancelación detiene todos los avisos del portal para ese correo; una nueva suscripción requiere confirmarlo otra vez.
- Los tokens de confirmación y cancelación y los correos de la cola permanecen en tablas privadas, nunca en la API pública.

## Referencias oficiales

- [Microsoft Graph: sendMail y permisos](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0).
- [Microsoft Entra: credenciales de aplicación y consentimiento administrativo](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-client-creds-grant-flow).
