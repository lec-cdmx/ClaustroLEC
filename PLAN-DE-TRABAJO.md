# Plan de trabajo del Portal Claustro LEC

Actualizado: 19 de noviembre de 2026.

## Etapa actual: rediseño y dos nuevos espacios

- Organigrama de la Escuela de Ciencias Sociales y Gobierno, Región CDMX, a partir de `Organigrama.pdf` y `Organigrama.png`. Conservar jerarquías, contactos y relaciones; tarjetas con colores y enlaces de correo.
- Programación docente a partir de `Programación 202613 - 2026_11_11 ECSG.xlsx`. Consultar por nómina exacta en formato LXXXXXXXX; sin listado inicial de docentes, accesos ni contraseñas en esta etapa.
- Mostrar UF, clave, tipo, CRN, horario, periodos, idioma, créditos, porcentaje de participación, docentes del mismo grupo, fechas, días y salón.
- Adaptar portada y navegación para incorporar ambas secciones, conservando directorio, oportunidades, capacitación y foro.

## Etapas posteriores (pendientes; no implementar todavía)

1. Ampliar documentación de Tec21 e inteligencia artificial.
2. Curar la oferta de capacitación en coordinación con CEDDIE.
3. Incorporar las buenas prácticas del departamento ya aprobadas y difundidas.
4. Incorporar numeralia útil: estudiantes por campus, líneas disciplinares, egresados y proporción de profesores de tiempo completo y cátedra.
5. Notificaciones voluntarias por correo para respuestas en Comunidad: confirmar identidad de correo, conectar servicio de envío y habilitar suscripción/cancelación de avisos.

## Decisiones confirmadas

- Por ahora basta conocer la nómina para consultar su programación; no se implementará autenticación.
- Oportunidades: retirar por completo las convocatorias cerradas y las fichas de ediciones pasadas; no conservarlas como archivo de referencia. Usar la fecha de cierre de postulaciones, aunque el evento todavía sea futuro.
- Los correos del organigrama se toman de los archivos proporcionados.
- Usar referencias claras a semestres en lugar de nombres de etapas: exploración corresponde a los primeros dos o tres semestres; enfoque y especialización, a los semestres posteriores. En el portal se describen las funciones con esas referencias temporales.
- Decanaturas y nodos de profesorado en blanco con detalles neutros. Mantener el énfasis en los contactos de Economía y direcciones divisionales, sin tonos rojos. La etiqueta de Arturo en CCM debe decir «También Director Regional».

## Estado de la implementación

- Portada y navegación adaptadas a seis secciones.
- Organigrama con 30 contactos únicos (Arturo aparece en sus dos funciones), tarjetas por función y enlaces de correo. Se priorizan los contactos de Economía y las direcciones divisionales. Se incorporan las direcciones de departamento de Economía por campus y sus nodos de profesorado; Derecho y Relaciones Internacionales siguen visibles.
- Programación importada y consulta por nómina implementada: 908 filas, 213 grupos y 136 docentes del periodo 202613 (corte de la fuente: 11 de noviembre de 2026).
- Los cambios se preparan y revisan localmente antes de publicarse. El servicio de Comunidad se activó en Cloudflare el 19 de noviembre de 2026.
- Ajustes de presentación del 19 de noviembre: tarjetas compactas, «Periodos» sin Tec21, CRN en el cuadro de datos, encabezado «Equipo docente» y resumen de sesiones equivalentes con detalle original desplegable. La sección de campus se titula «División ECSG por campus» e incluye descripciones breves de funciones sin enlaces de referencia visibles.
- Comunidad integra el foro existente: categorías Comunidad, Agenda, Discusión y Buenas prácticas; comentarios, respuestas anidadas, Me gusta por navegador y una discusión destacada elegida por el departamento. Publicaciones oficiales protegidas con la sesión de moderación; participaciones docentes sujetas a aprobación. Adelanto del feed en portada.
- Migraciones remotas 0003 y 0004 aplicadas el 19 de noviembre de 2026, con respaldo local previo en `fuentes-locales/respaldos/`. Worker actualizado; API pública versión 2 con publicaciones y reacciones habilitadas. Verificado en el portal público que «Compartir con el claustro» abre el formulario. Los datos de demostración permanecen locales. Los avisos por correo quedan para la siguiente etapa.
- Oportunidades: retiradas del HTML ocho fichas cerradas o de ediciones anteriores; quedan doce entradas con plazos vigentes o recepción continua al 19 de noviembre de 2026.
