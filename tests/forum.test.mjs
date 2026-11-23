import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../server/forum/worker.mjs';
import { localDatabase, migrate } from '../tools/lib/d1-local.mjs';

const password = 'clave-solo-para-pruebas-locales';
const origin = 'https://portal.example';
const person = {name:'Docente de prueba',role:'Profesor de cátedra',campus:'Santa Fe',email:'privado@example.invalid',title:'Una pregunta económica',body:'¿Qué evidencia usarían para explicar este resultado?',tags:'economía, datos',category:'discussion'};
function setup(t) {
  const DB = localDatabase();
  migrate(DB);
  t.after(() => DB.sqlite.close());
  const permit = {async limit() {return {success:true};}};
  const env = { DB, DEPARTMENT_PASSWORD:password, FORUM_ORIGIN:origin, SUBMISSION_LIMIT:permit, DEPARTMENT_LIMIT:permit, REACTION_LIMIT:permit };
  async function call(path, {body, admin=false, visitor, requestOrigin=origin, raw}={}) {
    const headers = {'Origin':requestOrigin};
    if (body || raw) headers['Content-Type']='application/json';
    if (admin) headers.Authorization='Bearer '+encodeURIComponent(password);
    if (visitor) headers['X-Visitor-Id']=visitor;
    const response = await worker.fetch(new Request('https://worker.example/api/'+path, {method:body||raw?'POST':'GET',headers,body:raw??(body?JSON.stringify(body):undefined)}),env);
    return {status:response.status,data:await response.json()};
  }
  const publish = async (overrides={}) => call('department/posts',{admin:true,body:{...person,...overrides}});
  return {env,DB,call,publish};
}

test('legacy posts survive migration in Buenas prácticas', () => {
  const db = localDatabase();
  try {
    for (const name of ['0001_posts.sql','0002_post_tags.sql','0003_post_email_visibility.sql']) db.sqlite.exec(readFileSync(new URL('../server/forum/migrations/'+name,import.meta.url),'utf8'));
    db.sqlite.prepare("INSERT INTO posts (id,name,role,campus,email,title,body,status,created_at) VALUES ('legacy','Nombre','Directivo','CCM','mail@example.invalid','Título','Contenido','approved','2026-11-19')").run();
    db.sqlite.exec(readFileSync(new URL('../server/forum/migrations/0004_community_feed.sql',import.meta.url),'utf8'));
    assert.deepEqual({...db.sqlite.prepare('SELECT id, category, official, pinned FROM posts').get()},{id:'legacy',category:'practice',official:0,pinned:0});
  } finally { db.sqlite.close(); }
});

test('public submissions appear immediately without impersonating the department or exposing email', async t => {
  const {call}=setup(t);
  const created=await call('posts',{body:{...person,official:1,pinned:true,status:'approved'}});
  assert.equal(created.status,201);
  assert.equal(created.data.status,'published');
  assert.equal((await call('posts')).data.posts.length,1);
  const [post]=(await call('posts')).data.posts;
  assert.equal(post.category,'discussion');
  assert.equal(post.official,0); assert.equal(post.pinned,0);
  assert.equal(post.contact_email,null); assert.ok(!('email' in post));
});

test('department publishing requires auth and replaces the single featured discussion atomically', async t => {
  const {call,publish,DB}=setup(t);
  assert.equal((await call('department/posts',{body:person})).status,401);
  const first=await publish({pinned:true});
  const second=await publish({pinned:true,title:'Otra conversación económica'});
  assert.equal(first.status,201); assert.equal(second.status,201);
  const featured=DB.sqlite.prepare('SELECT id,name FROM posts WHERE pinned=1').all();
  assert.equal(featured.length,1); assert.equal(featured[0].id,second.data.id);
  assert.equal(featured[0].name,'Departamento de Economía');
  assert.equal((await publish({pinned:true,category:'agenda'})).status,400);
  assert.equal(DB.sqlite.prepare('SELECT id FROM posts WHERE pinned=1').get().id,second.data.id);
  assert.equal((await call('featured/'+second.data.id,{admin:true,body:{pinned:false}})).status,200);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM posts WHERE pinned=1').get().n,0);
});

test('nested replies appear immediately, inherit category and require visible ancestors', async t => {
  const {call,publish,DB}=setup(t);
  const root=await publish({category:'community'});
  const reply=await call('posts',{body:{...person,parentId:root.data.id,category:'agenda'}});
  const forbidden=await call('posts',{body:{...person,parentId:crypto.randomUUID()}});
  assert.equal(forbidden.status,409);
  assert.equal(reply.data.status,'published');
  const nested=await call('posts',{body:{...person,parentId:reply.data.id}});
  assert.equal(nested.data.status,'published');
  const posts=(await call('posts')).data.posts;
  assert.equal(posts.length,3); assert.ok(posts.every(post=>post.category==='community'));
  DB.sqlite.prepare("UPDATE posts SET status='rejected' WHERE id=?").run(reply.data.id);
  assert.equal((await call('posts')).data.posts.length,1);
  assert.equal((await call('posts',{body:{...person,parentId:nested.data.id}})).status,409);
});

test('likes persist, are idempotent per browser and can be removed without revealing visitor IDs', async t => {
  const {call,publish}=setup(t);
  const {id}= (await publish()).data;
  const a=crypto.randomUUID(), b=crypto.randomUUID();
  const like=visitor=>call('likes/'+id,{visitor,body:{liked:true}});
  assert.equal((await like(a)).data.likes,1);
  assert.equal((await like(a)).data.likes,1);
  assert.equal((await like(b)).data.likes,2);
  const post=(await call('posts',{visitor:a})).data.posts[0];
  assert.equal(post.liked,1); assert.equal(post.likes,2); assert.ok(!JSON.stringify(post).includes(a));
  assert.equal((await call('likes/'+id,{visitor:a,body:{liked:false}})).data.likes,1);
  assert.equal((await call('likes/'+id,{body:{liked:true}})).status,400);
  assert.equal((await call('likes/'+crypto.randomUUID(),{visitor:a,body:{liked:true}})).status,404);
});

test('validation, origin checks, rate limits and hidden-target protections apply', async t => {
  const {call,env,DB}=setup(t);
  assert.equal((await call('posts',{body:{...person,category:'inventada'}})).status,400);
  assert.equal((await call('posts',{body:person,requestOrigin:'https://other.example'})).status,403);
  const pending=(await call('posts',{body:person})).data.id;
  DB.sqlite.prepare("UPDATE posts SET status='rejected' WHERE id=?").run(pending);
  assert.equal((await call('likes/'+pending,{visitor:crypto.randomUUID(),body:{liked:true}})).status,404);
  assert.equal((await call('posts',{raw:'{"invalid":'})).status,400);
  assert.equal((await call('posts',{raw:JSON.stringify({body:'x'.repeat(20000)})})).status,413);
  env.REACTION_LIMIT={async limit(){return {success:false};}};
  assert.equal((await call('likes/'+pending,{visitor:crypto.randomUUID(),body:{liked:true}})).status,429);
});

test('public email appears only with consent; approval endpoints no longer exist', async t => {
  const {call}=setup(t);
  const created=await call('posts',{body:{...person,publishEmail:true}});
  assert.equal((await call('moderation',{admin:true})).status,404);
  assert.equal((await call('moderation/'+created.data.id,{admin:true,body:{decision:'approved'}})).status,404);
  assert.equal((await call('department')).status,401);
  assert.equal((await call('posts')).data.posts[0].contact_email,person.email);
});

test('public participation remains available without department access configured', async t => {
  const {call,env}=setup(t);
  delete env.DEPARTMENT_PASSWORD;
  const availability=(await call('posts')).data;
  assert.equal(availability.submissionsOpen,true);
  assert.equal(availability.publicationMode,'direct');
  assert.equal(availability.departmentOpen,false);
  assert.equal((await call('posts',{body:person})).data.status,'published');
  assert.equal((await call('department',{admin:true})).status,503);
  // Existing deployments can keep their department credential under its old name.
  env.MODERATOR_PASSWORD=password;
  assert.equal((await call('department',{admin:true})).status,200);
});
