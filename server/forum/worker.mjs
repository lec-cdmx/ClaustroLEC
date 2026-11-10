import { examples } from '../../assets/js/forum-examples.js';

const roles = new Set(['Directivo', 'Profesor investigador', 'Profesor de tiempo completo', 'Profesor de cátedra']);
const exampleIds = new Set(examples.map(post => post.id));
const publicFields = 'id, parent_id, name, role, campus, title, body, created_at';
const encoder = new TextEncoder();

class ForumError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '') || !request.body) {
    throw new ForumError(400, 'La solicitud debe incluir los datos en JSON.');
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 18_000) {
      await reader.cancel();
      throw new ForumError(413, 'El envío supera el tamaño permitido.');
    }
    text += decoder.decode(value, { stream: true });
  }

  try {
    const data = JSON.parse(text + decoder.decode());
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch {
    // Malformed submissions get the same response as other invalid JSON inputs.
  }
  throw new ForumError(400, 'El envío no tiene un formato válido.');
}

function field(data, key, max, min = 1) {
  const value = typeof data[key] === 'string' ? data[key].trim() : '';
  if (value.length < min || value.length > max) throw new ForumError(400, 'Revisa los campos y los límites de caracteres.');
  return value;
}

async function submit(request, env) {
  const data = await readJson(request);
  const parent = data.parentId == null ? null : field(data, 'parentId', 72);
  const name = field(data, 'name', 100, 2);
  const campus = field(data, 'campus', 90, 2);
  const role = field(data, 'role', 40);
  const email = field(data, 'email', 254);
  const body = field(data, 'body', 2500, 5);
  const title = parent ? '' : field(data, 'title', 120, 4);
  if (!roles.has(role) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ForumError(400, 'Elige un puesto e ingresa un correo válido.');
  }

  const id = crypto.randomUUID();
  const acceptedParent = parent === null || exampleIds.has(parent);
  const result = await env.DB.prepare(`
    INSERT INTO posts (id, parent_id, name, role, campus, email, title, body, created_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE ? OR EXISTS (SELECT 1 FROM posts WHERE id = ? AND status = 'approved')
  `).bind(id, parent, name, role, campus, email, title, body, new Date().toISOString(), Number(acceptedParent), parent).run();
  if (result.meta.changes !== 1) throw new ForumError(409, 'La contribución a la que quieres responder no está publicada.');
  return { id, status: 'pending' };
}

async function limit(binding, request) {
  const key = request.headers.get('CF-Connecting-IP') || 'local';
  if (!(await binding.limit({ key })).success) throw new ForumError(429, 'Hay demasiados intentos. Espera un momento y vuelve a intentar.');
}

async function authorize(request, env) {
  await limit(env.MODERATION_LIMIT, request);
  const supplied = request.headers.get('Authorization') || '';
  const expected = 'Bearer ' + encodeURIComponent(env.MODERATOR_PASSWORD);
  const digest = async text => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
  const [a, b] = await Promise.all([digest(supplied), digest(expected)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  if (difference !== 0) throw new ForumError(401, 'La contraseña de moderación no es válida.');
}

async function moderate(request, env, id) {
  const { decision } = await readJson(request);
  if (!['approved', 'rejected'].includes(decision)) throw new ForumError(400, 'Elige aprobar o rechazar.');
  const result = await env.DB.prepare("UPDATE posts SET status = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'")
    .bind(decision, new Date().toISOString(), id).run();
  if (result.meta.changes !== 1) throw new ForumError(409, 'Este envío ya no está pendiente.');
  return { id, status: decision };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
    const json = (data, status = 200) => Response.json(data, { status, headers });
    if (origin && origin !== env.FORUM_ORIGIN) return json({ error: 'Origen no autorizado.' }, 403);
    if (origin) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
      headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    const path = new URL(request.url).pathname;
    const ready = typeof env.MODERATOR_PASSWORD === 'string' && env.MODERATOR_PASSWORD.length >= 20;
    try {
      if (path === '/api/posts' && request.method === 'GET') {
        const { results } = await env.DB.prepare(`SELECT ${publicFields} FROM posts WHERE status = 'approved' ORDER BY created_at, id`).all();
        return json({ posts: results, submissionsOpen: ready });
      }
      if (!ready) throw new ForumError(503, 'El foro aún no está recibiendo contribuciones.');
      if (path === '/api/posts' && request.method === 'POST') {
        await limit(env.SUBMISSION_LIMIT, request);
        return json(await submit(request, env), 201);
      }
      if (path === '/api/moderation' && request.method === 'GET') {
        await authorize(request, env);
        const { results } = await env.DB.prepare(`
          SELECT ${publicFields}, email FROM posts WHERE status = 'pending' ORDER BY created_at, id LIMIT 100
        `).all();
        return json({ posts: results });
      }
      const id = path.match(/^\/api\/moderation\/([\da-f-]{36})$/i)?.[1];
      if (id && request.method === 'POST') {
        await authorize(request, env);
        return json(await moderate(request, env, id));
      }
      return json({ error: 'Ruta no encontrada.' }, 404);
    } catch (error) {
      if (error instanceof ForumError) return json({ error: error.message }, error.status);
      return json({ error: 'El foro no está disponible en este momento.' }, 503);
    }
  },
};
