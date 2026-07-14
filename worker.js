export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/api/kontakt') {
      return handleKontakt(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};

function jsonOk() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonErr(msg, status) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status: status || 400,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function verifyTurnstile(token, secret) {
  if (!secret || secret === 'disabled') return true;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret, response: token || '' }),
  });
  const data = await res.json();
  return data.success === true;
}

async function sendMail(env, { subject, html, replyTo }) {
  const from = env.CONTACT_FROM || 'landlogistik@cloud-schmiede.ch';
  const to   = env.CONTACT_TO   || 'office@landlogistik.at';
  const bcc  = env.CONTACT_BCC  || undefined;

  const body = {
    from: `Landlogistik <${from}>`,
    to: [to],
    subject,
    html,
  };
  if (replyTo) body.reply_to = replyTo;
  if (bcc) body.bcc = [bcc];

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error('Resend error:', res.status, await res.text());
  }
  return res.ok;
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function row(label, value) {
  if (!value) return '';
  return `<tr>
    <td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;color:#64748b;white-space:nowrap;vertical-align:top">${esc(label)}</td>
    <td style="padding:8px 12px;border:1px solid #e2e8f0;color:#0f172a">${esc(value).replace(/\n/g, '<br>')}</td>
  </tr>`;
}

async function handleKontakt(request, env) {
  try {
    const form = await request.formData();

    if (form.get('website')) return jsonOk(); // honeypot

    const token = form.get('cf-turnstile-response') || '';
    if (!await verifyTurnstile(token, env.TURNSTILE_SECRET)) {
      return jsonErr('Spam-Schutz fehlgeschlagen. Bitte Seite neu laden.');
    }

    const name        = String(form.get('name')        || '').slice(0, 200);
    const firma       = String(form.get('firma')        || '').slice(0, 200);
    const art         = String(form.get('art')          || '').slice(0, 100);
    const email       = String(form.get('email')        || '').slice(0, 200);
    const telefon     = String(form.get('telefon')      || '').slice(0, 50);
    const fahrzeugtyp = String(form.get('fahrzeugtyp')  || '').slice(0, 100);
    const mietdauer   = String(form.get('mietdauer')    || '').slice(0, 50);
    const abholdatum  = String(form.get('abholdatum')   || '').slice(0, 20);
    const abholzeit   = String(form.get('abholzeit')    || '').slice(0, 10);
    const zustelldat  = String(form.get('zustelldatum') || '').slice(0, 20);
    const zustellzeit = String(form.get('zustellzeit')  || '').slice(0, 10);
    const nachricht   = String(form.get('nachricht')    || '').slice(0, 5000);

    const html = `
      <h2 style="font-family:sans-serif;color:#0f172a;">Neue Anfrage – Landlogistik</h2>
      <table style="font-family:sans-serif;border-collapse:collapse;width:100%;max-width:600px;">
        ${row('Name', name)}
        ${row('Firma', firma)}
        ${row('Art der Anfrage', art)}
        ${row('E-Mail', email)}
        ${row('Telefon', telefon)}
        ${row('Fahrzeugtyp', fahrzeugtyp)}
        ${row('Mietdauer', mietdauer)}
        ${row('Abholdatum', abholdatum)}
        ${row('Abholzeit', abholzeit)}
        ${row('Zustelldatum / Rückgabe', zustelldat)}
        ${row('Zustellzeit', zustellzeit)}
        ${row('Nachricht', nachricht)}
      </table>
      <hr style="margin-top:2rem;border:none;border-top:1px solid #eee;">
      <p style="color:#999;font-size:12px;font-family:sans-serif;">via landlogistik.at</p>`;

    const ok = await sendMail(env, {
      subject: `Neue Anfrage: ${art || 'Kontaktformular'} – ${name}`,
      html,
      replyTo: email || undefined,
    });

    return ok ? jsonOk() : jsonErr('E-Mail konnte nicht gesendet werden. Bitte rufen Sie uns an: 0664 46 208 03', 500);
  } catch (e) {
    console.error('Contact form error:', e);
    return jsonErr('Unbekannter Fehler. Bitte rufen Sie uns an: 0664 46 208 03', 500);
  }
}
