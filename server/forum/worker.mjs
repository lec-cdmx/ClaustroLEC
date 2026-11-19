import { ForumError, readJson, field } from './http.mjs';
import { readSubmission, imageInsert } from './images.mjs';
import { mailReady } from './mail.mjs';
import { subscribe, queueReplies, flushOutbox, emailAction, emailError } from './notifications.mjs';
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

async function isVisible(env, id) {
  return Boolean(await env.DB.prepare(`${visibleCTE} SELECT id FROM visible WHERE id = ?`).bind(...exampleIds, id).first());
}

function visitorId(request, required = false) {
  const value = request.headers.get('X-Visitor-Id') || '';
  if (/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value)) return value;
  if (required) throw new ForumError(400, 'No fue posible identificar este navegador. Recarga e intenta de nuevo.');
  return '';
}

async function submit(request, env, official = false, context) {
  const { data, images } = await readSubmission(request);
  const parent = official || data.parentId == null ? null : field(data, 'parentId', 72);
  const name = official ? 'Departamento de Economía' : field(data, 'name', 100, 2);
  const campus = official ? 'Región CDMX' : field(data, 'campus', 90, 2);
  const role = official ? 'Directivo' : field(data, 'role', 40);
  const email = field(data, 'email', 254);
  const emailPublic = data.publishEmail === true ? 1 : 0;
  const body = field(data, 'body', 2500, images.length ? 0 : 5);
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
  // 'approved' is the legacy database value for a visible publication.
  const status = 'approved';
  const insert = env.DB.prepare(`
    INSERT INTO posts (id, parent_id, name, role, campus, email, title, body, created_at, tags, email_public, category, official, pinned, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, parent, name, role, campus, email, title, body, new Date().toISOString(), JSON.stringify(tags), emailPublic, category, Number(official), Number(pinned), status);
  const statements = [insert, ...images.map(image => imageInsert(env.DB, id, image))];
  if (pinned) statements.unshift(env.DB.prepare('UPDATE posts SET pinned = 0 WHERE pinned = 1'));
  await env.DB.batch(statements);
  let notificationStatus = 'off';
  try {
    if (data.notifyReplies === true) {
      if (mailReady(env)) { await subscribe(env,id,email); notificationStatus = 'requested'; }
      else notificationStatus = 'unavailable';
    }
    if (parent) await queueReplies(env,id);
  } catch { notificationStatus = 'failed'; }
  const delivery = flushOutbox(env).catch(() => {});
  if (context?.waitUntil) context.waitUntil(delivery);
  else await delivery;
  return { id, status: 'published', notificationStatus };
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
  const password = env.DEPARTMENT_PASSWORD ?? env.MODERATOR_PASSWORD;
  if (typeof password !== 'string' || password.length < 20) throw new ForumError(503, 'El acceso del departamento aún no está configurado.');
  await limit(env.DEPARTMENT_LIMIT ?? env.MODERATION_LIMIT, request);
  const supplied = request.headers.get('Authorization') || '';
  const expected = 'Bearer ' + encodeURIComponent(password);
  const digest = async text => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
  const [a, b] = await Promise.all([digest(supplied), digest(expected)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  if (difference !== 0) throw new ForumError(401, 'La contraseña del departamento no es válida.');
}

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    const path = url.pathname;
    const emailRoute = path.match(/^\/api\/email\/(confirm|unsubscribe)$/)?.[1];
    const origin = request.headers.get('Origin');
    const allowedOrigins = (env.FORUM_ORIGIN ?? '').split(',').map(value => value.trim());
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
    const json = (data, status = 200) => Response.json(data, { status, headers });
    if (origin && !allowedOrigins.includes(origin) && !(emailRoute && origin === url.origin)) return json({ error: 'Origen no autorizado.' }, 403);
    if (origin) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
      headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Visitor-Id';
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    const departmentPassword = env.DEPARTMENT_PASSWORD ?? env.MODERATOR_PASSWORD;
    const departmentOpen = typeof departmentPassword === 'string' && departmentPassword.length >= 20;
    try {
      if (emailRoute && ['GET','POST'].includes(request.method)) {
        if (request.method==='POST') await limit(env.NOTIFICATION_LIMIT ?? env.SUBMISSION_LIMIT,request);
        return await emailAction(request,env,emailRoute);
      }
      if (path === '/api/posts' && request.method === 'GET') {
        const { results } = await env.DB.prepare(`${visibleCTE}
          SELECT ${publicFields.split(', ').map(field => 'p.' + field).join(', ')},
            CASE WHEN p.email_public = 1 THEN p.email END AS contact_email,
            (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS likes,
            EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.visitor_id = ?) AS liked
          FROM posts p WHERE p.id IN (SELECT id FROM visible) ORDER BY p.created_at, p.id
        `).bind(...exampleIds, visitorId(request)).all();
        const { results: images } = await env.DB.prepare(`${visibleCTE} SELECT id, post_id, description FROM post_images WHERE post_id IN (SELECT id FROM visible) ORDER BY post_id, position`).bind(...exampleIds).all();
        const byPost = new Map();
        for (const image of images) {
          if (!byPost.has(image.post_id)) byPost.set(image.post_id, []);
          byPost.get(image.post_id).push({ id: image.id, description: image.description });
        }
        return json({ posts: results.map(post => ({ ...decodeTags(post), images: byPost.get(post.id) || [] })), submissionsOpen: Boolean(env.SUBMISSION_LIMIT), feedVersion: 4, publicationMode: 'direct', departmentOpen, imagesOpen: true, notificationsOpen: mailReady(env), reactionsOpen: Boolean(env.REACTION_LIMIT), preview: env.LOCAL_PREVIEW === true });
      }
      const imageId = path.match(/^\/api\/images\/([\da-f-]{36})$/i)?.[1];
      if (imageId && request.method === 'GET') {
        const image = await env.DB.prepare('SELECT post_id, mime, data FROM post_images WHERE id = ?').bind(imageId).first();
        if (!image || !await isVisible(env, image.post_id)) throw new ForumError(404, 'Imagen no disponible.');
        return new Response(new Uint8Array(image.data), { headers: { ...headers, 'Content-Type': image.mime, 'Content-Disposition': 'inline', 'Cache-Control': 'public, max-age=3600' } });
      }
      if (path === '/api/posts' && request.method === 'POST') {
        if (!env.SUBMISSION_LIMIT) throw new ForumError(503, 'El servicio de publicaciones aún no está disponible.');
        await limit(env.SUBMISSION_LIMIT, request);
        return json(await submit(request, env, false, context), 201);
      }
      if (path === '/api/department/posts' && request.method === 'POST') {
        await authorize(request, env);
        return json(await submit(request, env, true, context), 201);
      }
      const subscribeId = path.match(/^\/api\/posts\/([\da-f-]{36})\/subscribe$/i)?.[1];
      if (subscribeId && request.method === 'POST') {
        await limit(env.NOTIFICATION_LIMIT ?? env.SUBMISSION_LIMIT,request);
        if (!await isVisible(env,subscribeId)) throw new ForumError(404,'No encontramos esta conversación.');
        const {email} = await readJson(request);
        const result = await subscribe(env,subscribeId,email);
        const delivery = flushOutbox(env).catch(() => {});
        if (context?.waitUntil) context.waitUntil(delivery); else await delivery;
        return json(result,202);
      }
      const reactionId = path.match(/^\/api\/likes\/([\da-f-]{36})$/i)?.[1];
      if (reactionId && request.method === 'POST') {
        if (!env.REACTION_LIMIT) throw new ForumError(503, 'Los Me gusta aún no están disponibles.');
        await limit(env.REACTION_LIMIT, request);
        return json(await react(request, env, reactionId));
      }
      if (path === '/api/department' && request.method === 'GET') {
        await authorize(request, env);
        const featured = await env.DB.prepare(`SELECT ${publicFields} FROM posts WHERE pinned = 1 AND status = 'approved'`).first();
        const mail = await env.DB.prepare("SELECT SUM(state='queued' OR state='sending') AS pending,SUM(state='failed') AS failed FROM email_outbox").first();
        return json({ featured: featured ? decodeTags(featured) : null, notifications: {configured:mailReady(env),pending:mail.pending||0,failed:mail.failed||0} });
      }
      const featuredId = path.match(/^\/api\/featured\/([\da-f-]{36})$/i)?.[1];
      if (featuredId && request.method === 'POST') {
        await authorize(request, env);
        const { pinned } = await readJson(request);
        if (pinned !== false) throw new ForumError(400, 'Indica que deseas retirar la discusión destacada.');
        await env.DB.prepare('UPDATE posts SET pinned = 0 WHERE id = ?').bind(featuredId).run();
        return json({ id: featuredId, pinned: false });
      }
      return json({ error: 'Ruta no encontrada.' }, 404);
    } catch (error) {
      if (error instanceof ForumError) return emailRoute ? emailError(error.message,error.status) : json({ error: error.message }, error.status);
      return json({ error: 'El foro no está disponible en este momento.' }, 503);
    }
  },
  async scheduled(_event,env,context) { context.waitUntil(flushOutbox(env)); },
};
