import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/forum/worker.mjs';
import {localDatabase,migrate} from '../tools/lib/d1-local.mjs';
import {MAX_IMAGE_BYTES} from '../server/forum/images.mjs';
import {flushOutbox} from '../server/forum/notifications.mjs';
import {sendMail} from '../server/forum/mail.mjs';

const pixel = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/bZkAAAAASUVORK5CYII=','base64'));
const person = {name:'Docente de prueba',role:'Profesor de cátedra',campus:'Santa Fe',email:'autor@example.invalid',title:'Conversación de prueba',body:'Una pregunta para el claustro.',tags:'economía, docencia'};

function setup(t) {
  const DB=localDatabase(); migrate(DB); t.after(()=>DB.sqlite.close());
  const messages=[];
  const permit={async limit(){return {success:true};}};
  const env={DB,LOCAL_PREVIEW:true,DEV_MAIL:{async send(message){messages.push(message);}},FORUM_ORIGIN:'https://portal.example',SUBMISSION_LIMIT:permit,NOTIFICATION_LIMIT:permit,REACTION_LIMIT:permit};
  async function invoke(path,{body,method=body?'POST':'GET',origin='https://portal.example'}={}) {
    const headers={Origin:origin};
    let payload=body;
    if (body && !(body instanceof FormData) && typeof body!=='string') {headers['Content-Type']='application/json';payload=JSON.stringify(body);}
    if (typeof body==='string') headers['Content-Type']='application/x-www-form-urlencoded';
    return worker.fetch(new Request('https://worker.example'+path,{method,headers,body:payload}),env);
  }
  const post=async body=>{const response=await invoke('/api/posts',{body:{...person,...body}});assert.equal(response.status,201);return response.json();};
  return {DB,env,messages,invoke,post};
}
function multipart(data,files=[{bytes:pixel,type:'image/png'}]) {
  const form=new FormData();form.set('data',JSON.stringify({...person,...data}));
  for (const file of files) form.append('images',new Blob([file.bytes],{type:file.type}),'imagen.png');
  return form;
}

test('image-only publications store their images atomically and serve their bytes',async t=>{
  const {invoke}=setup(t);
  const response=await invoke('/api/posts',{body:multipart({body:'',imageDescriptions:['Gráfica del ejemplo']})});
  assert.equal(response.status,201);
  const {id}=await response.json();
  const data=await (await invoke('/api/posts')).json();
  assert.equal(data.posts[0].id,id);assert.equal(data.posts[0].body,'');
  assert.equal(data.posts[0].images[0].description,'Gráfica del ejemplo');
  assert.ok(!('data' in data.posts[0].images[0]));
  const image=await invoke('/api/images/'+data.posts[0].images[0].id);
  assert.equal(image.headers.get('Content-Type'),'image/png');
  assert.equal(image.headers.get('X-Content-Type-Options'),'nosniff');
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()),pixel);
});

test('invalid, spoofed, oversized and excessive attachments are rejected before creating posts',async t=>{
  const {invoke,DB}=setup(t);
  for (const files of [
    [{bytes:new TextEncoder().encode('<svg onload="alert(1)"></svg>'),type:'image/svg+xml'}],
    [{bytes:pixel,type:'image/jpeg'}],
    [{bytes:new Uint8Array(MAX_IMAGE_BYTES+1),type:'image/png'}],
    Array.from({length:4},()=>({bytes:pixel,type:'image/png'})),
  ]) assert.ok([400,413].includes((await invoke('/api/posts',{body:multipart({},files)})).status));
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM posts').get().n,0);
});

test('image persistence failure rolls back the publication; hidden posts do not expose images',async t=>{
  const {invoke,DB}=setup(t);
  DB.sqlite.exec("CREATE TRIGGER fail_image BEFORE INSERT ON post_images BEGIN SELECT RAISE(ABORT,'test failure'); END;");
  assert.equal((await invoke('/api/posts',{body:multipart({})})).status,503);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM posts').get().n,0);
  DB.sqlite.exec('DROP TRIGGER fail_image');
  const publication=await (await invoke('/api/posts',{body:multipart({})})).json();
  const image=DB.sqlite.prepare('SELECT id FROM post_images').get();
  DB.sqlite.prepare("UPDATE posts SET status='rejected' WHERE id=?").run(publication.id);
  assert.equal((await invoke('/api/images/'+image.id)).status,404);
});

test('unconfigured email does not prevent publication and does not pretend to subscribe',async t=>{
  const {invoke,env,post,DB}=setup(t);delete env.DEV_MAIL;
  const publication=await post({notifyReplies:true});
  assert.equal(publication.notificationStatus,'unavailable');
  assert.equal((await invoke('/api/posts/'+publication.id+'/subscribe',{body:{email:person.email}})).status,503);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM email_subscriptions').get().n,0);
  assert.equal((await (await invoke('/api/posts')).json()).notificationsOpen,false);
});

test('confirmed subscribers receive new replies; scanners, self-replies and cancellations are handled',async t=>{
  const {post,messages,invoke,DB}=setup(t);
  const root=await post({notifyReplies:true});
  assert.equal(messages.length,1);assert.equal(messages[0].to,person.email);
  await post({parentId:root.id,email:'otro@example.invalid'});
  assert.equal(messages.length,1,'unconfirmed recipients must not receive conversations');
  const confirm=new URL(messages[0].text.match(/https:\/\/worker\.example\/api\/email\/confirm\?token=[a-f\d]+/)?.[0] || messages[0].text.match(/https:\/\/[^\s]+\/api\/email\/confirm\?token=[a-f\d]+/)[0]);
  assert.equal((await invoke(confirm.pathname+confirm.search)).status,200);
  assert.equal(DB.sqlite.prepare('SELECT state FROM email_subscriptions').get().state,'pending');
  assert.equal((await invoke(confirm.pathname,{body:'token='+confirm.searchParams.get('token'),origin:'https://worker.example'})).status,200);
  const reply=await post({parentId:root.id,email:'otro@example.invalid',name:'Colega'});
  assert.equal(messages.length,2);assert.ok(messages[1].text.includes(reply.id));
  assert.equal(DB.sqlite.prepare('SELECT state FROM email_subscriptions').get().state,'active');
  await post({parentId:reply.id,email:person.email});
  assert.equal(messages.length,2,'self-replies must not notify the sender');
  const cancellation=new URL(messages[1].text.match(/https:\/\/[^\s]+\/api\/email\/unsubscribe\?token=[a-f\d]+/)[0]);
  await invoke(cancellation.pathname+cancellation.search);
  assert.equal(DB.sqlite.prepare('SELECT state FROM email_subscriptions').get().state,'active');
  await invoke(cancellation.pathname,{body:'token='+cancellation.searchParams.get('token'),origin:'https://worker.example'});
  await post({parentId:root.id,email:'otro@example.invalid'});
  assert.equal(messages.length,2);
  const exposed=JSON.stringify(await (await invoke('/api/posts')).json());
  assert.ok(!exposed.includes('confirm_hash')&&!exposed.includes('unsubscribe_token')&&!exposed.includes(person.email));
});

test('failed deliveries remain in the outbox and retry without resending completed jobs',async t=>{
  const {env,post,DB,messages}=setup(t);
  env.DEV_MAIL={async send(){throw new Error('Fallo temporal de prueba');}};
  const publication=await post({notifyReplies:true});
  assert.equal(publication.status,'published');
  let job=DB.sqlite.prepare('SELECT state,attempts FROM email_outbox').get();
  assert.equal(job.state,'failed');assert.equal(job.attempts,1);
  env.DEV_MAIL={async send(message){messages.push(message);}};
  DB.sqlite.exec("UPDATE email_outbox SET next_attempt_at='2020-01-01'");
  await flushOutbox(env);await flushOutbox(env);
  assert.equal(messages.length,1);
  job=DB.sqlite.prepare('SELECT state,attempts FROM email_outbox').get();
  assert.equal(job.state,'sent');assert.equal(job.attempts,2);
});

test('verification requests are throttled per mailbox and expired links cannot activate notices',async t=>{
  const {post,invoke,messages,DB}=setup(t);
  const publication=await post({notifyReplies:true});
  await invoke('/api/posts/'+publication.id+'/subscribe',{body:{email:person.email}});
  assert.equal(messages.length,1);
  const link=new URL(messages[0].text.match(/https:\/\/[^\s]+\/api\/email\/confirm\?token=[a-f\d]+/)[0]);
  DB.sqlite.exec("UPDATE email_subscriptions SET confirm_expires_at='2020-01-01'");
  assert.equal((await invoke(link.pathname,{body:'token='+link.searchParams.get('token'),origin:'https://worker.example'})).status,410);
  assert.equal(DB.sqlite.prepare('SELECT state FROM email_subscriptions').get().state,'pending');
});

test('Microsoft integration uses the authorized sender and Mail.Send JSON API',async()=>{
  const calls=[];
  const env={MAIL_ENABLED:'true',MAIL_PROVIDER:'microsoft',EMAIL_FROM:'marco.mendez@tec.mx',MS_TENANT_ID:'tenant',MS_CLIENT_ID:'client',MS_CLIENT_SECRET:'test-secret'};
  const fetcher=async(url,options)=>{calls.push({url,options});return calls.length===1?Response.json({access_token:'test-access'}):new Response(null,{status:202});};
  await sendMail(env,{to:'destino@example.invalid',subject:'Aviso de prueba',text:'Nueva respuesta.'},fetcher);
  assert.equal(calls.length,2);
  assert.ok(calls[0].url.startsWith('https://login.microsoftonline.com/'));
  assert.ok(calls[1].url.endsWith('/users/marco.mendez%40tec.mx/sendMail'));
  assert.equal(calls[1].options.headers.Authorization,'Bearer test-access');
  const payload=JSON.parse(calls[1].options.body);
  assert.equal(payload.message.toRecipients[0].emailAddress.address,'destino@example.invalid');
  assert.equal(payload.message.body.contentType,'Text');
});
