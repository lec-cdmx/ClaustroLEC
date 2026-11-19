// Node 24+. Runs only on loopback; never connects to production D1 or sends mail.
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import worker from '../server/forum/worker.mjs';
import { examples } from '../assets/js/forum-examples.js';
import { localDatabase, migrate, rateLimit } from './lib/d1-local.mjs';

if (!process.env.MODERATOR_PASSWORD || process.env.MODERATOR_PASSWORD.length < 20) {
  throw new Error('Configura MODERATOR_PASSWORD con una contraseña local de al menos 20 caracteres.');
}
mkdirSync(new URL('../fuentes-locales/', import.meta.url), { recursive: true });
const DB = localDatabase(fileURLToPath(new URL('../fuentes-locales/comunidad-preview.sqlite', import.meta.url)));
migrate(DB);
const demo = process.argv.includes('--demo');
if (demo && DB.sqlite.prepare('SELECT COUNT(*) AS count FROM posts').get().count === 0) {
  const ids = new Map(examples.map(post => [post.id, crypto.randomUUID()]));
  const insert = DB.sqlite.prepare(`INSERT INTO posts
    (id, parent_id, name, role, campus, email, title, body, created_at, tags, category, official, pinned, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`);
  for (const [index, post] of examples.entries()) {
    insert.run(ids.get(post.id), ids.get(post.parent_id) ?? null, post.name, post.role, post.campus,
      'ejemplo@example.invalid', post.title ? 'Ejemplo: ' + post.title : '', post.body, new Date(Date.parse('2026-11-19T12:00:00Z') + index * 1000).toISOString(),
      JSON.stringify(post.tags), post.category, Number(post.official || 0), Number(post.pinned || 0));
  }
}
const env = {
  DB, MODERATOR_PASSWORD: process.env.MODERATOR_PASSWORD,
  FORUM_ORIGIN: 'http://127.0.0.1:4173,http://localhost:4173',
  SUBMISSION_LIMIT: rateLimit(8), MODERATION_LIMIT: rateLimit(30), REACTION_LIMIT: rateLimit(60), LOCAL_PREVIEW: true,
};
createServer(async (incoming, outgoing) => {
  try {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of incoming) {
      bytes += chunk.length;
      if (bytes > 20000) { outgoing.writeHead(413); outgoing.end(); return; }
      chunks.push(chunk);
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) if (value) headers.set(key, String(value));
    headers.set('CF-Connecting-IP', incoming.socket.remoteAddress);
    const response = await worker.fetch(new Request('http://127.0.0.1:8787' + incoming.url, {
      method: incoming.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined,
    }), env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch { outgoing.writeHead(500); outgoing.end('No fue posible atender la solicitud local.'); }
}).listen(8787, '127.0.0.1', () => console.log('Feed local: http://127.0.0.1:8787 (SQLite local, sin correos ni cambios remotos)'));
