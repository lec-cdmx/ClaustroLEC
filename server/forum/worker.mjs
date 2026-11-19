import { examples } from '../../assets/js/forum-examples.js';
import { parseTags, tagError } from '../../assets/js/forum-tags.js';
import { categories } from '../../assets/js/feed-categories.js';

const roles = new Set(['Directivo', 'Profesor investigador', 'Profesor de tiempo completo', 'Profesor de cátedra']);
const exampleIds = new Set(examples.map(post => post.id));
const publicFields = 'id, parent_id, name, role, campus, title, body, created_at, tags, category, official, pinned';
const categoryIds = new Set(categories.map(category => category.id));
const visibleCTE = `WITH RECURSIVE visible(id) AS (
  SELECT id FROM posts WHERE status = 'approved' AND (parent_id IS NULL OR parent_id IN (${[...exampleIds].map(() => '?').join(',')}))
  UNION SELECT p.id FROM posts p JOIN visible v ON p.parent_id = v.id WHERE p.status = 'approved'
)`;
const encoder = new TextEncoder();
const decodeTags = post => ({ ...post, tags: JSON.parse(post.tags) });

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

async function isVisible(env, id) {
  return Boolean(await env.DB.prepare(`${visibleCTE} SELECT id FROM visible WHERE id = ?`).bind(...exampleIds, id).first());
}

function visitorId(request, required = false) {
  const value = request.headers.get('X-Visitor-Id') || '';
  if (/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value)) return value;
  if (required) throw new ForumError(400, 'No fue posible identificar este navegador. Recarga e intenta de nuevo.');
  return '';
}

async function submit(request, env, official = false) {
  const data = await readJson(request);
  const parent = official || data.parentId == null ? null : field(data, 'parentId', 72);
  const name = official ? 'Departamento de Economía' : field(data, 'name', 100, 2);
  const campus = official ? 'Región CDMX' : field(data, 'campus', 90, 2);
  const role = official ? 'Directivo' : field(data, 'role', 40);
  const email = field(data, 'email', 254);
  const emailPublic = data.publishEmail === true ? 1 : 0;
  const body = field(data, 'body', 2500, 5);
  const title = parent ? '' : field(data, 'title', 120, 4);
  const tags = parent ? [] : parseTags(data.tags);
  if (!tags) throw new ForumError(400, tagError);
  let category = parent ? 'practice' : (data.category ?? 'practice');
  if (!categoryIds.has(category)) throw new ForumError(400, 'Elige una categoría válida.');
  if (parent) {
    if (!exampleIds.has(parent) && !await isVisible(env, parent)) {
      throw new ForumError(409, 'La publicación a la que quieres responder no está disponible.');
    }
    const parentPost = await env.DB.prepare('SELECT category FROM posts WHERE id = ?').bind(parent).first();
    category = parentPost?.category ?? 'practice';
  }
  const pinned = official && data.pinned === true;
  if (pinned && category !== 'discussion') throw new ForumError(400, 'Solo se puede destacar una discusión.');
  if (!roles.has(role) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ForumError(400, 'Elige un puesto e ingresa un correo válido.');
  }

  const id = crypto.randomUUID();
  const status = official ? 'approved' : 'pending';
  const insert = env.DB.prepare(`
    INSERT INTO posts (id, parent_id, name, role, campus, email, title, body, created_at, tags, email_public, category, official, pinned, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, parent, name, role, campus, email, title, body, new Date().toISOString(), JSON.stringify(tags), emailPublic, category, Number(official), Number(pinned), status);
  if (pinned) await env.DB.batch([env.DB.prepare('UPDATE posts SET pinned = 0 WHERE pinned = 1'), insert]);
  else await insert.run();
  return { id, status };
}

async function react(request, env, id) {
  const visitor = visitorId(request, true);
  const { liked } = await readJson(request);
  if (typeof liked !== 'boolean') throw new ForumError(400, 'Indica si quieres marcar Me gusta.');
  if (!await isVisible(env, id)) throw new ForumError(404, 'La publicación no está disponible.');
  if (liked) {
    await env.DB.prepare('INSERT OR IGNORE INTO post_likes (post_id, visitor_id, created_at) VALUES (?, ?, ?)')
      .bind(id, visitor, new Date().toISOString()).run();
  } else await env.DB.prepare('DELETE FROM post_likes WHERE post_id = ? AND visitor_id = ?').bind(id, visitor).run();
  const stats = await env.DB.prepare('SELECT COUNT(*) AS likes, MAX(visitor_id = ?) AS liked FROM post_likes WHERE post_id = ?').bind(visitor, id).first();
  return { id, likes: stats.likes, liked: Boolean(stats.liked) };
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
    const allowedOrigins = (env.FORUM_ORIGIN ?? '').split(',').map(value => value.trim());
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
    const json = (data, status = 200) => Response.json(data, { status, headers });
    if (origin && !allowedOrigins.includes(origin)) return json({ error: 'Origen no autorizado.' }, 403);
    if (origin) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
      headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Visitor-Id';
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    const path = new URL(request.url).pathname;
    const ready = typeof env.MODERATOR_PASSWORD === 'string' && env.MODERATOR_PASSWORD.length >= 20;
    try {
      if (path === '/api/posts' && request.method === 'GET') {
        const { results } = await env.DB.prepare(`${visibleCTE}
          SELECT ${publicFields.split(', ').map(field => 'p.' + field).join(', ')},
            CASE WHEN p.email_public = 1 THEN p.email END AS contact_email,
            (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS likes,
            EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.visitor_id = ?) AS liked
          FROM posts p WHERE p.id IN (SELECT id FROM visible) ORDER BY p.created_at, p.id
        `).bind(...exampleIds, visitorId(request)).all();
        return json({ posts: results.map(decodeTags), submissionsOpen: ready, feedVersion: 2, reactionsOpen: Boolean(env.REACTION_LIMIT), preview: env.LOCAL_PREVIEW === true });
      }
      if (!ready) throw new ForumError(503, 'El foro aún no está recibiendo contribuciones.');
      if (path === '/api/posts' && request.method === 'POST') {
        await limit(env.SUBMISSION_LIMIT, request);
        return json(await submit(request, env), 201);
      }
      if (path === '/api/department/posts' && request.method === 'POST') {
        await authorize(request, env);
        return json(await submit(request, env, true), 201);
      }
      const reactionId = path.match(/^\/api\/likes\/([\da-f-]{36})$/i)?.[1];
      if (reactionId && request.method === 'POST') {
        if (!env.REACTION_LIMIT) throw new ForumError(503, 'Los Me gusta aún no están disponibles.');
        await limit(env.REACTION_LIMIT, request);
        return json(await react(request, env, reactionId));
      }
      if (path === '/api/moderation' && request.method === 'GET') {
        await authorize(request, env);
        const { results } = await env.DB.prepare(`
          SELECT ${publicFields}, email, email_public FROM posts WHERE status = 'pending' ORDER BY created_at, id LIMIT 100
        `).all();
        const featured = await env.DB.prepare(`SELECT ${publicFields} FROM posts WHERE pinned = 1 AND status = 'approved'`).first();
        return json({ posts: results.map(decodeTags), featured: featured ? decodeTags(featured) : null });
      }
      const featuredId = path.match(/^\/api\/featured\/([\da-f-]{36})$/i)?.[1];
      if (featuredId && request.method === 'POST') {
        await authorize(request, env);
        const { pinned } = await readJson(request);
        if (pinned !== false) throw new ForumError(400, 'Indica que deseas retirar la discusión destacada.');
        await env.DB.prepare('UPDATE posts SET pinned = 0 WHERE id = ?').bind(featuredId).run();
        return json({ id: featuredId, pinned: false });
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
