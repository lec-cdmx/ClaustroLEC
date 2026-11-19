import { ForumError, readBytes } from './http.mjs';
import { mailReady, sendMail } from './mail.mjs';

const normalizeEmail = value => String(value || '').trim().toLowerCase();
const token = () => [...crypto.getRandomValues(new Uint8Array(32))].map(value => value.toString(16).padStart(2,'0')).join('');
const tokenHash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(value=>value.toString(16).padStart(2,'0')).join('');
const oneLine = value => String(value || '').replace(/[\r\n]/g,' ').slice(0,120);
const escapeHTML = value => String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function publicURL(env, key, fallback) {
  const url = new URL(env[key] || fallback);
  if (url.protocol !== 'https:' && !(env.LOCAL_PREVIEW === true && ['localhost','127.0.0.1'].includes(url.hostname))) throw new Error('URL de correo no válida.');
  return url.origin;
}
const apiURL = env => publicURL(env,'PUBLIC_API_URL','https://claustrolec-foro.marco-mendez.workers.dev');
const portalURL = env => publicURL(env,'PUBLIC_PORTAL_URL','https://claustrolec.pages.dev');

async function rootPost(env, id) {
  return env.DB.prepare(`WITH RECURSIVE ancestors(id,parent_id,title) AS (
    SELECT id,parent_id,title FROM posts WHERE id = ?
    UNION SELECT p.id,p.parent_id,p.title FROM posts p JOIN ancestors a ON p.id=a.parent_id
  ) SELECT id,title FROM ancestors WHERE parent_id IS NULL LIMIT 1`).bind(id).first();
}

export async function subscribe(env, postId, suppliedEmail) {
  if (!mailReady(env)) throw new ForumError(503,'Los avisos por correo todavía no están activos.');
  const email = normalizeEmail(suppliedEmail);
  if (email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ForumError(400,'Escribe un correo válido.');
  const root = await rootPost(env,postId);
  if (!root) throw new ForumError(404,'No encontramos esta conversación.');
  const current = await env.DB.prepare('SELECT id,state,last_verification_at,unsubscribe_token FROM email_subscriptions WHERE post_id=? AND email=?').bind(root.id,email).first();
  if (current?.state === 'active' || (current?.state === 'pending' && Date.now()-Date.parse(current.last_verification_at)<600000)) return {status:'requested'};
  const confirmation = token(), cancellation = current?.unsubscribe_token || token();
  const id = current?.id || crypto.randomUUID();
  const now = new Date().toISOString();
  const expires = new Date(Date.now()+86400000).toISOString();
  const hash = await tokenHash(confirmation);
  const text = `Solicitaste recibir avisos de respuestas en una conversación del Claustro LEC: ${oneLine(root.title)}.\n\nConfirma tu correo aquí (el enlace vence en 24 horas):\n${apiURL(env)}/api/email/confirm?token=${confirmation}\n\nSi no solicitaste estos avisos, ignora este mensaje. No se activarán sin tu confirmación.\n\nCancelar avisos del portal:\n${apiURL(env)}/api/email/unsubscribe?token=${cancellation}`;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO email_subscriptions (id,post_id,email,state,confirm_hash,confirm_expires_at,unsubscribe_token,last_verification_at,updated_at)
      VALUES (?,?,?,'pending',?,?,?,?,?) ON CONFLICT(post_id,email) DO UPDATE SET state='pending',confirm_hash=excluded.confirm_hash,
      confirm_expires_at=excluded.confirm_expires_at,last_verification_at=excluded.last_verification_at,updated_at=excluded.updated_at`)
      .bind(id,root.id,email,hash,expires,cancellation,now,now),
    env.DB.prepare(`INSERT INTO email_outbox (id,subscription_id,source_post_id,kind,subject,body,next_attempt_at,updated_at)
      VALUES (?,?,?,'verification',?,?,?,?) ON CONFLICT(subscription_id,source_post_id,kind)
      DO UPDATE SET body=excluded.body,state='queued',attempts=0,next_attempt_at=excluded.next_attempt_at,updated_at=excluded.updated_at,last_error=NULL`)
      .bind(crypto.randomUUID(),id,root.id,'Confirma los avisos del Claustro LEC',text,now,now),
  ]);
  return {status:'requested'};
}

export async function queueReplies(env, postId) {
  const post = await env.DB.prepare('SELECT id,parent_id,name,email FROM posts WHERE id=?').bind(postId).first();
  if (!post?.parent_id) return;
  const root = await rootPost(env,postId);
  if (!root) return;
  const now = new Date().toISOString();
  const prefix = `${oneLine(post.name)} publicó una respuesta en la conversación «${oneLine(root.title)}» del Claustro LEC.\n\nVer la conversación:\n${portalURL(env)}/buenas-practicas.html#${post.id}\n\nCancelar todos los avisos del portal:\n${apiURL(env)}/api/email/unsubscribe?token=`;
  await env.DB.prepare(`INSERT OR IGNORE INTO email_outbox
    (id,subscription_id,source_post_id,kind,subject,body,next_attempt_at,updated_at)
    SELECT lower(hex(randomblob(16))),id,?,'reply',?,? || unsubscribe_token,?,?
    FROM email_subscriptions WHERE post_id=? AND state='active' AND email<>?`)
    .bind(postId,'Nueva respuesta · '+oneLine(root.title),prefix,now,now,root.id,normalizeEmail(post.email)).run();
}

export async function flushOutbox(env) {
  if (!mailReady(env)) return;
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE email_outbox SET state='failed',next_attempt_at=? WHERE state='sending' AND updated_at<?")
    .bind(now,new Date(Date.now()-600000).toISOString()).run();
  await env.DB.prepare(`UPDATE email_outbox SET state='cancelled' WHERE state IN ('queued','failed') AND NOT EXISTS (
    SELECT 1 FROM email_subscriptions s WHERE s.id=subscription_id AND ((kind='reply' AND s.state='active')
    OR (kind='verification' AND s.state='pending' AND s.confirm_expires_at>?)))`).bind(now).run();
  const {results:jobs} = await env.DB.prepare(`SELECT o.*,s.email FROM email_outbox o JOIN email_subscriptions s ON s.id=o.subscription_id
    WHERE o.state IN ('queued','failed') AND o.attempts<5 AND o.next_attempt_at<=? ORDER BY o.updated_at LIMIT 5`).bind(now).all();
  for (const job of jobs) {
    const claim = await env.DB.prepare(`UPDATE email_outbox SET state='sending',attempts=attempts+1,updated_at=?
      WHERE id=? AND state IN ('queued','failed')`).bind(now,job.id).run();
    if (claim.meta.changes!==1) continue;
    try {
      await sendMail(env,{to:job.email,subject:job.subject,text:job.body});
      await env.DB.prepare("UPDATE email_outbox SET state='sent',last_error=NULL,updated_at=? WHERE id=?").bind(new Date().toISOString(),job.id).run();
    } catch (error) {
      const retry = new Date(Date.now()+Math.min(3600000,60000*2**job.attempts)).toISOString();
      await env.DB.prepare("UPDATE email_outbox SET state='failed',last_error=?,next_attempt_at=?,updated_at=? WHERE id=?")
        .bind(oneLine(error.message),retry,new Date().toISOString(),job.id).run();
    }
  }
}

function emailPage(title, text, action, value, completed=false) {
  const content = `<!doctype html><html lang="es-MX"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(title)} | Claustro LEC</title>
    <style>body{font:1rem/1.6 system-ui;background:#f7f6f0;color:#121e33;margin:0;padding:2rem}main{max-width:34rem;margin:8vh auto;padding:2rem;border:1px solid #d6d9da;border-radius:.8rem;background:white}h1{font-size:1.7rem;line-height:1.2}button{padding:.8rem 1rem;border:0;background:#143fca;color:white;font:600 1rem system-ui;cursor:pointer}a{color:#143fca}</style>
    <main><p>Claustro LEC</p><h1>${escapeHTML(title)}</h1><p>${escapeHTML(text)}</p>${completed?'':`<form method="post" action="${escapeHTML(action)}"><input type="hidden" name="token" value="${escapeHTML(value)}"><button type="submit">${action.endsWith('confirm')?'Confirmar avisos':'Cancelar avisos'}</button></form>`}</main></html>`;
  return new Response(content,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer',
    'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'}});
}

export function emailError(message,status) {
  const page=emailPage('No se pudo procesar el enlace',message,'','',true);
  return new Response(page.body,{status,headers:page.headers});
}

export async function emailAction(request, env, action) {
  const url = new URL(request.url);
  let value = url.searchParams.get('token') || '';
  if (request.method === 'POST') {
    // The form body is tiny. A GET from an email scanner never changes preferences.
    const raw = new TextDecoder().decode(await readBytes(request,256));
    value = new URLSearchParams(raw).get('token') || '';
  }
  if (!/^[a-f\d]{64}$/.test(value)) throw new ForumError(400,'Enlace no válido.');
  const condition = action==='confirm' ? 'confirm_hash=? AND confirm_expires_at>?' : 'unsubscribe_token=?';
  const args = action==='confirm' ? [await tokenHash(value),new Date().toISOString()] : [value];
  const subscription = await env.DB.prepare('SELECT id,email FROM email_subscriptions WHERE '+condition).bind(...args).first();
  if (!subscription) throw new ForumError(410,'El enlace expiró o ya fue utilizado. Solicita uno nuevo desde la conversación.');
  if (request.method === 'GET') return emailPage(action==='confirm'?'Confirma tus avisos por correo':'Cancelar avisos por correo',
    action==='confirm'?'Recibirás un correo cuando haya nuevas respuestas en esta conversación.':'Dejarás de recibir los avisos del Claustro LEC en este correo.', '/api/email/'+action,value);
  if (action==='confirm') await env.DB.prepare("UPDATE email_subscriptions SET state='active',confirm_hash=NULL,confirm_expires_at=NULL,updated_at=? WHERE id=?").bind(new Date().toISOString(),subscription.id).run();
  else await env.DB.prepare("UPDATE email_subscriptions SET state='unsubscribed',confirm_hash=NULL,updated_at=? WHERE email=?").bind(new Date().toISOString(),subscription.email).run();
  return emailPage(action==='confirm'?'Avisos activados':'Avisos cancelados',action==='confirm'?'Tu correo quedó confirmado para recibir nuevas respuestas.':'Ya no recibirás avisos del portal. Puedes volver a solicitarlos desde una conversación.','', '',true);
}
