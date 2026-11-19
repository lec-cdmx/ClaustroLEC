import { ForumError, parseJson, readBytes, readJson } from './http.mjs';

export const MAX_IMAGE_BYTES = 768 * 1024;
export const MAX_IMAGES = 3;
export const MAX_SUBMISSION_BYTES = MAX_IMAGES * MAX_IMAGE_BYTES + 64000;

export function imageType(bytes) {
  if (bytes.length >= 45 && [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) return 'image/png';
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2)===255 && bytes.at(-1)===217) return 'image/jpeg';
  if (bytes.length >= 20 && new TextDecoder().decode(bytes.slice(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP'
      && new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(4,true)===bytes.length-8) return 'image/webp';
  return null;
}

export async function readSubmission(request) {
  const type = request.headers.get('Content-Type') || '';
  if (!/^multipart\/form-data(?:;|$)/i.test(type)) return { data: await readJson(request), images: [] };
  const bytes = await readBytes(request, MAX_SUBMISSION_BYTES);
  let form;
  try { form = await new Response(bytes, { headers: { 'Content-Type': type } }).formData(); }
  catch { throw new ForumError(400, 'No pudimos leer las imágenes adjuntas.'); }
  const metadata = form.get('data');
  if (typeof metadata !== 'string' || new TextEncoder().encode(metadata).length > 18000) throw new ForumError(400, 'Revisa los datos de la publicación.');
  const data = parseJson(metadata);
  const files = form.getAll('images');
  if (files.length > MAX_IMAGES) throw new ForumError(400, 'Puedes adjuntar hasta tres imágenes.');
  const descriptions = data.imageDescriptions ?? [];
  if (!Array.isArray(descriptions) || descriptions.some(value => typeof value !== 'string' || value.length > 300)) throw new ForumError(400, 'Revisa las descripciones de las imágenes.');
  const images = [];
  for (const [position, file] of files.entries()) {
    if (typeof file === 'string' || !file.size || file.size > MAX_IMAGE_BYTES) throw new ForumError(413, 'Cada imagen debe pesar como máximo 768 KB después del ajuste.');
    const image = new Uint8Array(await file.arrayBuffer());
    const mime = imageType(image);
    if (!mime || mime !== file.type) throw new ForumError(400, 'Usa imágenes JPG, PNG o WebP válidas.');
    images.push({ id: crypto.randomUUID(), bytes: image, mime, description: (descriptions[position] || '').trim(), position });
  }
  return { data, images };
}

export function imageInsert(DB, postId, image) {
  return DB.prepare('INSERT INTO post_images (id, post_id, mime, description, position, data) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(image.id, postId, image.mime, image.description, image.position, image.bytes.buffer);
}
