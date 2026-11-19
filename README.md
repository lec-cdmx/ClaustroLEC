# Portal Digital Claustro LEC

Portal de la Licenciatura en Economía del Tecnológico de Monterrey. Reúne programación docente, organigrama de la ECSG, directorio del claustro, oportunidades académicas, buenas prácticas y recursos de capacitación. El plan de evolución está en [PLAN-DE-TRABAJO.md](PLAN-DE-TRABAJO.md).

## Revisión local

Para revisar el portal con los filtros y el cruce de temas, ejecuta `python -m http.server 4173 --bind 127.0.0.1` desde la raíz y abre `http://127.0.0.1:4173`.

## Publicación en GitHub Pages

El [portal](https://lec-cdmx.github.io/ClaustroLEC/) se publica desde la raíz (`/`) de la rama `main`. Los cambios enviados a `main` activan la actualización en GitHub Pages.

## Publicación en Cloudflare Pages

El [portal en Cloudflare Pages](https://claustrolec.pages.dev/) se actualiza con los cambios que llegan a `main` en `lec-cdmx/ClaustroLEC`. El proyecto `claustrolec` usa la raíz del repositorio, **None** como framework y `dist` como directorio de salida. El comando de compilación copia los archivos públicos del portal.

```sh
mkdir -p dist && cp -- *.html dist/ && cp -R -- assets dist/
```

## Organización de archivos

- **Raíz.** Portada y seis páginas del portal.
- **`assets/`.** Estilos en `css/`, scripts en `js/`, iconos en `icons/`, imágenes publicadas en `img/` y planes de estudio en PDF en `docs/`.
- **`fuentes-locales/`.** Archivos de trabajo del directorio e imágenes originales, excluidos de Git.

## Actualizar el contenido

- **Programación.** La consulta en `programacion.html` requiere una nómina exacta `LXXXXXXXX` y no presenta un listado inicial. Se acepta `l` minúscula y se eliminan espacios al inicio y al final. Los datos están en `assets/data/programacion.json`; se cargan al enviar una consulta válida. Esta versión es estática y no tiene autenticación: los datos del JSON son accesibles para quien conozca su URL. La búsqueda por nómina es una forma de consulta, no un control de acceso.
- **Actualizar programación.** Instala `openpyxl` (`python -m pip install openpyxl`) y ejecuta `python tools/importar_programacion.py "Programación 202613 - 2026_11_11 ECSG.xlsx" --fecha-corte 2026-11-11`. Para una fuente posterior, cambia el nombre y la fecha. El importador lee la hoja `Sesiones y Porcentajes`, valida columnas, nóminas y consistencia por periodo + CRN; conserva sesiones y porcentajes por docente sin sumarlos. No modifica el Excel. Si hay errores, no reemplaza los datos anteriores. Después actualiza el periodo y corte visibles en `programacion.html` y la versión de la URL del JSON en `assets/js/programacion.js`. La fuente actual contiene 908 filas, 213 CRN y 136 nóminas del periodo 202613; los créditos y porcentajes en cero se conservan. Los archivos originales quedan locales y no se incluyen en Git ni en el paquete público de Cloudflare.
- **Organigrama.** Edita `assets/data/organigrama.json` y ejecuta `python tools/generar_organigrama.py` para regenerar el contenido de `organigrama.html`, que funciona sin JavaScript. Economía ocupa el espacio principal: Arturo encabeza la dirección regional y también la de CCM; David Lamb de Valdés encabeza CSF y Ángel Olvera Lozano, CEM. Cada dirección de campus tiene sus nodos de profesorado de tiempo completo y cátedra, y su coordinación académica. Derecho y Relaciones Internacionales permanecen visibles en un bloque secundario. Las divisiones dependen de la Decanatura Regional; la Dirección Nacional de LEC se vincula con las direcciones de LEC de los tres campus. Se conservan licencia e interinato de la fuente. La guía orientativa de puestos enlaza las referencias del Tec para departamento, entrada y programa; las demás descripciones son síntesis generales para ayudar a localizar contactos, no perfiles oficiales de puesto.
- **Resumen de sesiones.** `assets/js/sesiones.mjs` une días con las mismas fechas, horarios, salón y participación, después une horas contiguas y rangos de fechas contiguos con el mismo patrón. No une brechas ni diferencias de salón o porcentaje. Los registros originales permanecen intactos y pueden abrirse desde «Ver detalle original» en cada ficha resumida.
- **Directorio.** Edita o duplica un perfil en `directorio.html`. Actualiza la semblanza y los temas académicos en `faculty-keywords`. Agrupa las UF por plan y por tipo, registra sus claves verificadas y actualiza el conteo de cada plan. Las claves con sufijo B corresponden a bloques, las que terminan en C a concentraciones y las que terminan en número a materias. Guarda los retratos en `assets/img/directorio/`.
- **Perfiles extendidos.** Registra los trabajos en `assets/data/publicaciones.json` bajo el mismo identificador del encabezado del docente. Conserva el título original y redacta el resumen en el idioma de la fuente. Usa el año de la publicación o del manuscrito y deja `year` en `null` si la fuente omite la fecha. Si existe una versión de trabajo anterior, agrega su enlace en `workingPaper` dentro de la ficha de la publicación. Usa `fullText` para el acceso público al documento.
- **Oportunidades.** Actualiza el seminario regional en la sección de iniciativas internas. Para el radar externo, edita o duplica una ficha en `oportunidades.html`. Usa `data-type` para clasificarla y registra la modalidad según la fuente oficial. Agrega hasta tres temas en `opportunity-topics`, con los mismos nombres del directorio cuando haya afinidad. Si hay fecha, actualiza el texto visible y `datetime` en formato `AAAA-MM-DD`. Distingue la fecha límite de postulación de las fechas del encuentro.
- **Capacitación.** Edita o duplica una ficha en `capacitacion.html` y agrega un enlace al material cuando esté disponible.

Retira la etiqueta «Ejemplo» de cada ficha al sustituirla por contenido validado. Cuando reemplaces todos los datos ficticios de una sección, actualiza también su nota de edición.

## Verificar la importación

Ejecuta `python -m unittest discover -s tests -v`. Las pruebas verifican agrupación por periodo y CRN, sesiones con porcentajes repetidos, ceros, datos faltantes y rechazo de inconsistencias. Si el Excel fuente está disponible, también comparan todos sus registros con el JSON generado.

Ejecuta `node --test tests/sesiones.test.mjs` para comprobar el resumen de horarios. El control recorre todos los grupos y docentes del JSON y compara por fecha la cobertura exacta de horas, salón y porcentaje antes y después de resumir.

## Comunidad y Buenas prácticas

El feed se abre desde **Comunidad** y conserva la dirección `buenas-practicas.html` para mantener los enlaces anteriores. Integra Comunidad, Agenda, Discusión y Buenas prácticas, con filtros de categoría y etiqueta, orden por fecha o número de comentarios y respuestas anidadas. La portada muestra hasta tres publicaciones recientes, dando prioridad a la discusión destacada. Los ejemplos estáticos están separados en una sección desplegable y no se pueden comentar ni reaccionar; los hilos antiguos vinculados a ejemplos conservan sus respuestas.

Las contribuciones se guardan en Cloudflare D1 a través del Worker existente. Las participaciones del profesorado y sus respuestas siguen entrando a moderación. En **Gestión del departamento**, la contraseña de moderación permite aprobar o rechazar participaciones y publicar con la identidad oficial «Departamento de Economía · Región CDMX». Esta identidad se asigna en el servidor, no desde los datos enviados por el visitante. Se puede destacar una discusión a la vez y retirarla; la renovación semanal es una decisión editorial manual.

Los Me gusta se guardan por publicación y navegador, con un identificador aleatorio en almacenamiento local. Repetir la misma acción no incrementa el contador y se puede retirar el Me gusta. Esto no identifica ni cuenta personas únicas; borrar el almacenamiento o usar otro navegador crea otra identidad. Si el navegador bloquea ese almacenamiento, la lectura y las contribuciones siguen funcionando y los Me gusta se deshabilitan.

La consulta pública solo devuelve publicaciones aprobadas con su cadena de respuestas aprobada. El correo es privado salvo consentimiento explícito en cada contribución. No hay cuentas de profesores ni verificación de su identidad; se mantiene el modelo de participación moderada del foro. **Esta etapa no envía notificaciones por correo.** La siguiente requiere conectar un proveedor de envío, confirmar los correos de los participantes, añadir suscripciones voluntarias y permitir cancelar los avisos.

### Activar en el servicio publicado

Antes de publicar la nueva interfaz, aplica la migración `0004_community_feed.sql` y despliega el Worker actualizado. La migración conserva las publicaciones anteriores y las clasifica como Buenas prácticas. El nuevo `REACTION_LIMIT` de `wrangler.jsonc` se incluye en el despliegue. No vuelvas a crear la base ni cambies su identificador si ya existe.

Para la configuración inicial, crea la base `claustrolec-foro` e indica su identificador en `server/forum/wrangler.jsonc`. Para actualizar un servicio existente, conserva ese identificador. Ejecuta desde `server/forum`:

```sh
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
```

Solo en la configuración inicial, guarda una contraseña de al menos 20 caracteres con `npx wrangler secret put MODERATOR_PASSWORD`. Conserva el secreto existente al actualizar. La URL HTTPS del Worker se indica en `data-forum-api` de `buenas-practicas.html` y en `data-community-api` de `index.html`. Configura los orígenes permitidos en `FORUM_ORIGIN`, separados por comas. Una interfaz nueva conectada a la API antigua muestra las publicaciones en modo de consulta hasta que se actualiza el servicio.

Para probar en local, agrega `MODERATOR_PASSWORD` en `server/forum/.dev.vars`, aplica la migración con `npx wrangler d1 migrations apply DB --local` y ejecuta `npx wrangler dev --var FORUM_ORIGIN:http://127.0.0.1:4173`. Desde la raíz, sirve el portal con `python -m http.server 4173 --bind 127.0.0.1` y abre `http://127.0.0.1:4173/buenas-practicas.html`.

Como alternativa sin dependencias de Wrangler, con Node 24 o posterior define una contraseña local en la variable de entorno `MODERATOR_PASSWORD` y ejecuta `node tools/forum-local.mjs --demo`. Usa el mismo Worker con un adaptador de SQLite y límites locales; la base de demostración está en `fuentes-locales/comunidad-preview.sqlite`, excluida de Git. Los datos ficticios se agregan solo si esa base está vacía. El servicio escucha únicamente en `127.0.0.1:8787`, no conecta a D1 remoto ni envía correos. La validación definitiva del entorno Cloudflare debe hacerse con Wrangler antes del despliegue.

Ejecuta `node --test tests/forum.test.mjs` para verificar migraciones, conservación de publicaciones anteriores, permisos de publicación oficial, discusión destacada, moderación, respuestas anidadas, privacidad de correo y persistencia e idempotencia de Me gusta con SQL real en SQLite.
