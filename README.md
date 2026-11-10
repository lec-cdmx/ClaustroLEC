# Portal Digital Claustro LEC

Portal de la Licenciatura en Economía del Tecnológico de Monterrey. Reúne el directorio del claustro, oportunidades académicas, buenas prácticas y recursos de capacitación.

## Revisión local

Abre `index.html` en tu navegador y elige una sección del mapa. Puedes revisar el portal sin instalar dependencias.

## Publicación en GitHub Pages

El [portal](https://lec-cdmx.github.io/ClaustroLEC/) se publica desde la raíz (`/`) de la rama `main`. Los cambios enviados a `main` activan la actualización en GitHub Pages.

## Organización de archivos

- **Raíz.** Portada y cuatro páginas del portal.
- **`assets/`.** Estilos en `css/`, scripts en `js/`, el icono del portal en `icons/` y los retratos publicados en `img/directorio/`.
- **`fuentes-locales/directorio/`.** El Excel de referencia y las fotos originales. Esta carpeta está excluida de Git y se conserva en la copia local.

## Actualizar el contenido

- **Directorio.** Edita o duplica un perfil en `directorio.html`. Actualiza el nombre, puesto, campus, correo institucional, semblanza, palabras clave y unidades de formación impartidas. Guarda el retrato para publicar en `assets/img/directorio/` y añade enlaces académicos cuando hayas verificado a quién pertenecen. El buscador obtiene sus opciones de las fichas.
- **Oportunidades.** Edita o duplica una ficha en `oportunidades.html`. Incluye la fecha límite y el enlace oficial cuando correspondan. Si hay fecha, actualiza tanto el texto visible como el atributo `datetime` en formato `AAAA-MM-DD`.
- **Buenas prácticas y capacitación.** Edita o duplica una ficha en `buenas-practicas.html` o `capacitacion.html` y agrega un enlace al material cuando esté disponible.

Retira la etiqueta «Ejemplo» de cada ficha al sustituirla por contenido validado. Cuando reemplaces todos los datos ficticios de una sección, actualiza también su nota de edición.
