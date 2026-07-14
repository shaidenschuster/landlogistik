export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle contact form submission
    if (request.method === 'POST' && url.pathname === '/api/kontakt') {
      return handleKontakt(request, env);
    }

    // Serve static assets
    return env.ASSETS.fetch(request);
  },
};

async function handleKontakt(request, env) {
  let redirectBase = new URL(request.url).origin + '/kontakt/';

  try {
    const formData = await request.formData();

    // Allow custom redirect target (e.g. transporter-mieten page)
    const redirectTo = formData.get('redirect_to');
    if (redirectTo && redirectTo.startsWith('/')) {
      redirectBase = new URL(request.url).origin + redirectTo;
    }

    // Honeypot check
    if (formData.get('website')) {
      return Response.redirect(redirectBase + '?success=1', 303);
    }

    // Turnstile verification
    const token = formData.get('cf-turnstile-response');
    const secret = env.TURNSTILE_SECRET ?? 'disabled';

    if (secret !== 'disabled') {
      const verify = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ secret, response: token ?? '' }),
        },
      );
      const result = await verify.json();
      console.log('Turnstile result:', JSON.stringify(result));
      if (!result.success) {
        console.error('Turnstile failed:', result['error-codes']);
        return Response.redirect(redirectBase + '?error=turnstile', 303);
      }
    } else {
      console.log('Turnstile disabled (no secret set)');
    }

    // Build email body
    const fields = [
      ['Name', formData.get('name')],
      ['Firma', formData.get('firma')],
      ['Art der Anfrage', formData.get('art')],
      ['E-Mail', formData.get('email')],
      ['Telefon', formData.get('telefon')],
      ['Fahrzeugtyp', formData.get('fahrzeugtyp')],
      ['Mietdauer', formData.get('mietdauer')],
      ['Abholdatum', formData.get('abholdatum')],
      ['Abholzeit', formData.get('abholzeit')],
      ['Zustelldatum / Rückgabe', formData.get('zustelldatum')],
      ['Zustellzeit', formData.get('zustellzeit')],
      ['Nachricht', formData.get('nachricht')],
    ];

    const textBody = fields
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');

    const htmlBody = `
      <h2 style="font-family:sans-serif;color:#0f172a">Neue Transportanfrage – Landlogistik</h2>
      <table style="font-family:sans-serif;border-collapse:collapse;width:100%;max-width:600px">
        ${fields
          .filter(([, v]) => v)
          .map(
            ([k, v]) => `
          <tr>
            <td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;color:#64748b;white-space:nowrap;vertical-align:top">${k}</td>
            <td style="padding:8px 12px;border:1px solid #e2e8f0;color:#0f172a">${String(v).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</td>
          </tr>`,
          )
          .join('')}
      </table>
    `;

    // Send via Resend
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.CONTACT_FROM ?? 'kontakt@landlogistik.at',
        to: [env.CONTACT_TO ?? 'office@landlogistik.at'],
        subject: `Neue Anfrage: ${formData.get('art') ?? 'Kontaktformular'} – ${formData.get('name') ?? ''}`,
        text: textBody,
        html: htmlBody,
        reply_to: formData.get('email') ?? undefined,
      }),
    });

    const resendBody = await resendResponse.text();
    console.log('Resend status:', resendResponse.status, resendBody);
    if (!resendResponse.ok) {
      console.error('Resend error:', resendBody);
      return Response.redirect(redirectBase + '?error=resend', 303);
    }

    return Response.redirect(redirectBase + '?success=1', 303);
  } catch (err) {
    console.error('Contact form error:', err);
    return Response.redirect(redirectBase + '?error=1', 303);
  }
}
