/**
 * ZZP Opdracht landingspagina voor SamenOntzorgen.
 * Serveert opdracht.html en heeft een /contact-endpoint via Resend.
 *
 * Benodigde environment-variabelen op Railway:
 *   RESEND_API_KEY = de API-sleutel van je gratis Resend-account (begint met re_)
 *   MAIL_TO        = ontvanger van de aanmeldingen (standaard info@samenontzorgen.nl)
 *   MAIL_FROM      = afzender (standaard SamenOntzorgen <onboarding@resend.dev>)
 *
 * Let op: zolang er nog geen eigen domein bij Resend is geverifieerd, kun je met
 * de afzender onboarding@resend.dev alleen versturen naar het e-mailadres waarmee
 * het Resend-account is aangemaakt. Zet MAIL_TO dus op dat adres.
 */
const express = require('express');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), { redirect: false }));

// Pagina
app.get(['/', '/opdracht'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'opdracht.html'));
});

// Formulier-endpoint
app.post('/contact', async (req, res) => {
  const apiKey   = process.env.RESEND_API_KEY;
  const mailTo   = process.env.MAIL_TO   || 'info@samenontzorgen.nl';
  const mailFrom = process.env.MAIL_FROM || 'SamenOntzorgen <onboarding@resend.dev>';
  const { naam, email, telefoon, bericht } = req.body;

  if (!naam || !bericht || (!email && !telefoon)) {
    return res.status(400).json({
      success: false,
      message: 'Naam, bericht en een e-mailadres of telefoonnummer zijn verplicht.'
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (email && !emailRegex.test(email)) {
    return res.status(400).json({ success: false, message: 'Vul een geldig e-mailadres in.' });
  }

  if (!apiKey) {
    console.error('RESEND_API_KEY ontbreekt. Zet die als environment-variabele op Railway.');
    return res.status(500).json({ success: false, message: 'Er ging iets mis bij het verzenden. Probeer het later nog eens.' });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: mailFrom,
        to: [mailTo],
        reply_to: email || undefined,
        subject: `Nieuwe aanmelding ZZP van ${naam}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#1c2b2d;padding:22px;border-radius:8px 8px 0 0;">
              <h1 style="color:#fff;margin:0;font-size:19px;">Nieuwe aanmelding via ZZP-opdracht pagina</h1>
            </div>
            <div style="background:#f9f9f9;padding:22px;border:1px solid #e0e0e0;border-top:none;">
              <p style="color:#2C3E50;"><strong>Naam:</strong> ${naam}</p>
              ${email ? `<p style="color:#2C3E50;"><strong>E-mail:</strong> ${email}</p>` : ''}
              ${telefoon ? `<p style="color:#2C3E50;"><strong>Telefoon:</strong> ${telefoon}</p>` : ''}
              <hr style="border:none;border-top:1px solid #e0e0e0;margin:14px 0;">
              <p style="color:#2C3E50;line-height:1.6;white-space:pre-wrap;">${bericht}</p>
            </div>
          </div>`
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('Resend fout:', response.status, detail);
      return res.status(500).json({ success: false, message: 'Er ging iets mis bij het verzenden. Probeer het later nog eens.' });
    }

    res.json({ success: true, message: 'Verzonden.' });
  } catch (error) {
    console.error('E-mail fout:', error);
    res.status(500).json({ success: false, message: 'Er ging iets mis bij het verzenden. Probeer het later nog eens.' });
  }
});

app.listen(PORT, () => {
  console.log(`ZZP landingspagina draait op http://localhost:${PORT}`);
});
