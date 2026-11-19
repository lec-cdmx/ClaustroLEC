export function mailReady(env) {
  if (env.LOCAL_PREVIEW === true && typeof env.DEV_MAIL?.send === 'function') return true;
  return env.MAIL_ENABLED === 'true' && env.MAIL_PROVIDER === 'microsoft'
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.EMAIL_FROM || '')
    && Boolean(env.MS_TENANT_ID && env.MS_CLIENT_ID && env.MS_CLIENT_SECRET);
}

// Uses application credentials provisioned by the institution, not a mailbox password.
export async function sendMail(env, message, fetcher = fetch) {
  if (env.LOCAL_PREVIEW === true && typeof env.DEV_MAIL?.send === 'function') return env.DEV_MAIL.send(message);
  if (!mailReady(env)) throw new Error('Correo automático no configurado.');
  const credentials = new URLSearchParams({client_id:env.MS_CLIENT_ID,client_secret:env.MS_CLIENT_SECRET,
    scope:'https://graph.microsoft.com/.default',grant_type:'client_credentials'});
  const authorization = await fetcher(`https://login.microsoftonline.com/${encodeURIComponent(env.MS_TENANT_ID)}/oauth2/v2.0/token`, {
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:credentials,
    signal:AbortSignal.timeout(10000),
  });
  if (!authorization.ok) throw new Error(`Autorización de correo rechazada (${authorization.status}).`);
  const token = await authorization.json();
  if (!token.access_token) throw new Error('Microsoft no devolvió la autorización de envío.');
  const result = await fetcher(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.EMAIL_FROM)}/sendMail`, {
    method:'POST', headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},
    body:JSON.stringify({message:{subject:message.subject,body:{contentType:'Text',content:message.text},
      toRecipients:[{emailAddress:{address:message.to}}]}}), signal:AbortSignal.timeout(10000),
  });
  if (result.status !== 202) throw new Error(`Microsoft no aceptó el envío (${result.status}).`);
}
