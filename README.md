# Portal Digital Claustro LEC

Portal de la Licenciatura en Economía del Tecnológico de Monterrey. Reúne el directorio del claustro, oportunidades académicas, buenas prácticas y recursos de capacitación.

## Revisión local

Para revisar el portal con los filtros y el cruce de temas, ejecuta `python -m http.server 4173 --bind 127.0.0.1` desde la raíz y abre `http://127.0.0.1:4173`.

## Publicación en GitHub Pages

El [portal](https://lec-cdmx.github.io/ClaustroLEC/) se publica desde la raíz (`/`) de la rama `main`. Los cambios enviados a `main` activan la actualización en GitHub Pages.

## Organización de archivos

- **Raíz.** Portada y cuatro páginas del portal.
- **`assets/`.** Estilos en `css/`, scripts en `js/`, iconos en `icons/`, imágenes publicadas en `img/` y planes de estudio en PDF en `docs/`.
- **`fuentes-locales/`.** Archivos de trabajo del directorio e imágenes originales, excluidos de Git.

## Actualizar el contenido

- **Directorio.** Edita o duplica un perfil en `directorio.html`. Actualiza la semblanza y los temas académicos en `faculty-keywords`. Agrupa las UF por plan y por tipo, registra sus claves verificadas y actualiza el conteo de cada plan. Las claves con sufijo B corresponden a bloques, las que terminan en C a concentraciones y las que terminan en número a materias. Guarda los retratos en `assets/img/directorio/`.
- **Perfiles extendidos.** Registra los trabajos en `assets/data/publicaciones.json` bajo el mismo identificador del encabezado del docente. Conserva el título original y redacta el resumen en el idioma de la fuente. Usa el año de la publicación o del manuscrito y deja `year` en `null` si la fuente omite la fecha. Si existe una versión de trabajo anterior, agrega su enlace en `workingPaper` dentro de la ficha de la publicación. Usa `fullText` para el acceso público al documento.
- **Oportunidades.** Actualiza el seminario regional en la sección de iniciativas internas. Para el radar externo, edita o duplica una ficha en `oportunidades.html`. Usa `data-type` para clasificarla y registra la modalidad según la fuente oficial. Agrega hasta tres temas en `opportunity-topics`, con los mismos nombres del directorio cuando haya afinidad. Si hay fecha, actualiza el texto visible y `datetime` en formato `AAAA-MM-DD`. Distingue la fecha límite de postulación de las fechas del encuentro.
- **Capacitación.** Edita o duplica una ficha en `capacitacion.html` y agrega un enlace al material cuando esté disponible.

Retira la etiqueta «Ejemplo» de cada ficha al sustituirla por contenido validado. Cuando reemplaces todos los datos ficticios de una sección, actualiza también su nota de edición.

## Foro de Buenas prácticas

La interfaz está en GitHub Pages y las contribuciones se guardan en Cloudflare D1 a través de un Worker. Los envíos y respuestas entran a la cola de **Moderación**. El correo sirve para que moderación contacte a la persona sobre su envío. La consulta pública solo devuelve contribuciones aprobadas y muestra el correo si la persona eligió compartirlo en ese envío. Los ejemplos ficticios están en `assets/js/forum-examples.js`.

Para configurar el servicio, crea la base `claustrolec-foro`, indica su identificador en `server/forum/wrangler.jsonc` y ejecuta desde `server/forum` los siguientes comandos:

```sh
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
npx wrangler secret put MODERATOR_PASSWORD
```

Elige una contraseña de al menos 20 caracteres y guárdala como secreto. Escribe la URL HTTPS del Worker en `data-forum-api` de `buenas-practicas.html`. El origen permitido se configura en `FORUM_ORIGIN`.

Para probar en local, agrega `MODERATOR_PASSWORD` en `server/forum/.dev.vars`, aplica la migración con `npx wrangler d1 migrations apply DB --local` y ejecuta `npx wrangler dev --var FORUM_ORIGIN:http://127.0.0.1:4173`. Desde la raíz, sirve el portal con `python -m http.server 4173 --bind 127.0.0.1` y abre `http://127.0.0.1:4173/buenas-practicas.html`.
