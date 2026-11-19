export class ForumError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function readBytes(request, limit) {
  if (!request.body) throw new ForumError(400, 'La solicitud no contiene datos.');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new ForumError(413, 'El envío supera el tamaño permitido.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export function parseJson(text) {
  try {
    const value = JSON.parse(text);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch { /* Return a consistent validation message. */ }
  throw new ForumError(400, 'El envío no tiene un formato válido.');
}

export async function readJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) {
    throw new ForumError(400, 'La solicitud debe incluir los datos en JSON.');
  }
  return parseJson(new TextDecoder().decode(await readBytes(request, 18000)));
}

export function field(data, key, max, min = 1) {
  const value = typeof data[key] === 'string' ? data[key].trim() : '';
  if (value.length < min || value.length > max) throw new ForumError(400, 'Revisa los campos y los límites de caracteres.');
  return value;
}
