export function tagKey(tag) {
  return tag.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0301\u0308]/g, '').normalize('NFC');
}

export const tagError = 'Escribe de 2 a 4 etiquetas distintas, separadas por comas. Usa una sola palabra de hasta 32 caracteres por etiqueta.';

export function parseTags(value) {
  if (typeof value !== 'string') return null;
  const tags = value.split(',').map(tag => tag.trim().normalize('NFC'));
  if (tags.length < 2 || tags.length > 4) return null;
  if (tags.some(tag => !/^[\p{L}\p{N}][\p{L}\p{M}\p{N}]{0,31}$/u.test(tag))) return null;
  return new Set(tags.map(tagKey)).size === tags.length ? tags : null;
}
