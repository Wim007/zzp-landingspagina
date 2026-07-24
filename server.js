/**
 * ZZP Opdracht landingspagina voor SamenOntzorgen.
 * Serveert opdracht.html en heeft een /contact-endpoint via Resend.
 *
 * Bij een inzending:
 *   1. Er gaat direct een melding naar het team (ongewijzigd gedrag).
 *   2. De invuller krijgt na een vertraging van 20 tot 45 minuten automatisch
 *      een welkomstmail met de informatie over de betreffende zorgvraag.
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
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

// Achter de Railway-proxy: zodat req.protocol https teruggeeft.
app.set('trust proxy', true);

// De zorgvragen staan in een apart databestand, zodat je ze dagelijks kunt
// toevoegen en weghalen zonder de code aan te raken. Het bestand wordt bij elk
// verzoek vers gelezen, dus wijzigingen werken meteen door, ook zonder herstart.
const OPDRACHTEN_FILE = path.join(__dirname, 'opdrachten.json');
function loadOpdrachten() {
  try {
    return JSON.parse(fs.readFileSync(OPDRACHTEN_FILE, 'utf8'));
  } catch (e) {
    console.error('Kon opdrachten.json niet lezen:', e.message);
    return {};
  }
}

// De smartlink die de website ook gebruikt. Op een computer toont hij een
// QR-code, op een telefoon stuurt hij door naar de juiste app store.
const APP_LINK = 'https://onelink.to/9txcf2';

// Tekst voor de invuller als de opdracht-code ontbreekt of onbekend is.
const OPDRACHT_FALLBACK =
  'We zochten je uit op basis van je vak en je regio. We sturen je zo snel mogelijk de passende zorgvraag toe.';

// Bestand-gebaseerde wachtrij zodat een geplande mail een herstart overleeft.
const QUEUE_FILE = path.join(__dirname, 'pending-applicant-mails.json');
const MAX_ATTEMPTS = 5;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), { redirect: false }));

// Pagina
app.get(['/', '/opdracht'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'opdracht.html'));
});

// ---------------------------------------------------------------------------
// Hulpfuncties
// ---------------------------------------------------------------------------

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Vertraging tussen 20 en 45 minuten, in milliseconden.
function delayMs() {
  return Math.floor((20 + Math.random() * 25) * 60 * 1000);
}

// Verstuurt een mail via Resend. Gooit een fout als het misgaat.
async function sendMail({ to, subject, html, replyTo }) {
  const apiKey   = process.env.RESEND_API_KEY;
  const mailFrom = process.env.MAIL_FROM || 'SamenOntzorgen <onboarding@resend.dev>';

  if (!apiKey) {
    throw new Error('RESEND_API_KEY ontbreekt.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: mailFrom,
      to: [to],
      reply_to: replyTo || undefined,
      subject,
      html
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend fout: ${response.status} ${detail}`);
  }
}

// Bouwt de HTML-mail voor de invuller, met een bulletproof download-knop.
function buildApplicantMail(naam, opdrachtText) {
  const naamHtml = escapeHtml(naam);
  const opdrachtHtml = escapeHtml(opdrachtText);

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1c2b2d;line-height:1.6;font-size:16px;">
    <p>Hoi ${naamHtml},</p>
    <p>fijn dat je meer wilt weten. Hieronder staat de zorgvraag die bij je vak en je regio past.</p>
    <div style="background:#e6f4f2;border-radius:12px;padding:18px 20px;margin:20px 0;color:#0a5a55;">
      ${opdrachtHtml}
    </div>
    <p>Over het tarief: jij bepaalt zelf je uurtarief. Het moet binnen het budget van de budgethouder passen en het zorgkantoor keurt het goed. Daar komt een servicebijdrage van SamenOntzorgen bovenop, en dat totaal leggen we voor aan de budgethouder.</p>
    <p>Wil je deze opdracht? Download dan de app en schrijf je in. In de app krijg je deze zorgvraag binnen, en ook andere opdrachten die bij je passen. Zo blijf je opdrachten ontvangen, ook als juist deze ene keer niet doorgaat.</p>
    <p style="margin-bottom:6px;">In de app:</p>
    <ul style="margin:0 0 16px;padding-left:20px;">
      <li>de app is gratis</li>
      <li>je krijgt passende opdrachten rechtstreeks binnen</li>
      <li>je bekijkt en beheert je opdrachten</li>
      <li>je accordeert je uren</li>
      <li>we helpen je met de zorgovereenkomst, en je facturen staan kloppend klaar</li>
    </ul>
    <p>De app en alle diensten zijn voor jou gratis, ze horen bij je lidmaatschap. De servicebijdrage gaat niet van jouw tarief af, hij komt bovenop het uurtarief dat jij wilt ontvangen, en zit zo in het totaalbedrag dat we aan de budgethouder voorleggen.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px auto;">
      <tr>
        <td align="center" bgcolor="#0e7c76" style="border-radius:10px;">
          <a href="${APP_LINK}" target="_blank" style="display:inline-block;background:#0e7c76;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;text-decoration:none;padding:14px 30px;border-radius:10px;">Download de app</a>
        </td>
      </tr>
    </table>
    <p style="text-align:center;font-size:14px;color:#5d6763;margin-top:0;">
      Werkt de knop niet? Ga naar <a href="${APP_LINK}" style="color:#0e7c76;">${APP_LINK}</a>
    </p>
    <p>Je zit nergens aan vast.</p>
    <p style="margin-bottom:0;">Groet,<br />Wim<br />SamenOntzorgen</p>
  </div>`;
}

// ---------------------------------------------------------------------------
// Wachtrij voor de vertraagde mail aan de invuller
// ---------------------------------------------------------------------------

function loadQueue() {
  try {
    return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveQueue(queue) {
  try {
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
  } catch (e) {
    console.error('Kon wachtrij niet opslaan:', e);
  }
}

function enqueueApplicantMail(item) {
  const queue = loadQueue();
  queue.push(item);
  saveQueue(queue);
}

let processing = false;
async function processQueue() {
  if (processing) return;
  processing = true;
  try {
    const queue = loadQueue();
    if (!queue.length) return;

    const now = Date.now();
    const remaining = [];
    let changed = false;

    for (const item of queue) {
      if (item.sendAt > now) {
        remaining.push(item);
        continue;
      }
      try {
        await sendMail({ to: item.to, subject: item.subject, html: item.html });
        changed = true; // verstuurd, valt uit de wachtrij
      } catch (err) {
        item.attempts = (item.attempts || 0) + 1;
        changed = true;
        if (item.attempts < MAX_ATTEMPTS) {
          remaining.push(item);
          console.error(`Mail aan ${item.to} mislukt (poging ${item.attempts}), opnieuw later.`, err.message);
        } else {
          console.error(`Mail aan ${item.to} definitief opgegeven na ${item.attempts} pogingen.`, err.message);
        }
      }
    }

    if (changed) saveQueue(remaining);
  } catch (err) {
    console.error('Fout bij verwerken wachtrij:', err);
  } finally {
    processing = false;
  }
}

// Periodieke check: elke minuut kijken of er mails klaarstaan.
setInterval(processQueue, 60 * 1000);
// Ook kort na de start een keer draaien, voor mails die tijdens een herstart
// hun verzendtijdstip al gepasseerd zijn.
setTimeout(processQueue, 10 * 1000);

// ---------------------------------------------------------------------------
// Overzicht van zorgvragen, met kant-en-klare links om te delen
// ---------------------------------------------------------------------------

app.get('/overzicht', (req, res) => {
  const opdrachten = loadOpdrachten();
  const base = `${req.protocol}://${req.get('host')}`;
  const codes = Object.keys(opdrachten);

  const cards = codes.length
    ? codes.map((code) => {
        const link = `${base}/?opdracht=${encodeURIComponent(code)}`;
        return `
      <div class="kaart">
        <div class="code">${escapeHtml(code)}</div>
        <p class="oms">${escapeHtml(opdrachten[code])}</p>
        <div class="linkrij">
          <input class="linkveld" type="text" readonly value="${escapeHtml(link)}" onclick="this.select();" />
          <button class="kopieer" type="button" data-link="${escapeHtml(link)}">Kopieer link</button>
        </div>
      </div>`;
      }).join('')
    : '<p class="leeg">Er staan op dit moment geen zorgvragen klaar.</p>';

  res.send(`<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8" />
<title>Overzicht zorgvragen</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex" />
<style>
  :root{--ink:#1c2b2d;--muted:#5d6763;--line:#e4e0d8;--teal:#0e7c76;--wash:#e6f4f2;--paper:#fbfaf7;}
  *{box-sizing:border-box;}
  body{margin:0;background:var(--paper);color:var(--ink);
    font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.55;}
  .wrap{max-width:820px;margin:0 auto;padding:32px 20px 60px;}
  h1{font-size:1.6rem;margin:0 0 6px;}
  .intro{color:var(--muted);margin:0 0 28px;}
  .kaart{background:#fff;border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin:0 0 16px;}
  .code{display:inline-block;font-weight:700;font-size:.82rem;letter-spacing:.06em;text-transform:uppercase;
    color:var(--teal);background:var(--wash);border-radius:6px;padding:4px 10px;margin-bottom:10px;}
  .oms{margin:0 0 14px;color:var(--ink);}
  .linkrij{display:flex;gap:8px;flex-wrap:wrap;}
  .linkveld{flex:1;min-width:220px;padding:10px 12px;border:1px solid var(--line);border-radius:8px;
    font:inherit;font-size:.9rem;color:var(--muted);background:#f7f6f2;}
  .kopieer{border:none;background:var(--teal);color:#fff;border-radius:8px;padding:10px 16px;
    font:inherit;font-weight:600;cursor:pointer;}
  .kopieer:hover{background:#0b6560;}
  .kopieer.ok{background:#146c3f;}
  .leeg{color:var(--muted);}
</style>
</head>
<body>
  <div class="wrap">
    <h1>Overzicht zorgvragen</h1>
    <p class="intro">Deel de link van een zorgvraag in je bericht. Iedereen die zich via die link aanmeldt, krijgt automatisch de bijbehorende informatie per mail. Voeg je in <strong>opdrachten.json</strong> een zorgvraag toe of haal je er een weg, dan verandert deze pagina vanzelf mee.</p>
    ${cards}
  </div>
  <script>
    document.querySelectorAll('.kopieer').forEach(function(btn){
      btn.addEventListener('click', function(){
        var link = btn.getAttribute('data-link');
        navigator.clipboard.writeText(link).then(function(){
          var orig = btn.textContent;
          btn.textContent = 'Gekopieerd'; btn.classList.add('ok');
          setTimeout(function(){ btn.textContent = orig; btn.classList.remove('ok'); }, 1600);
        });
      });
    });
  </script>
</body>
</html>`);
});

// ---------------------------------------------------------------------------
// Formulier-endpoint
// ---------------------------------------------------------------------------

app.post('/contact', async (req, res) => {
  const mailTo   = process.env.MAIL_TO   || 'info@samenontzorgen.nl';
  const apiKey   = process.env.RESEND_API_KEY;
  const { naam, email, telefoon, bericht, opdracht } = req.body;

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

  // Opdracht-code opzoeken.
  const opdrachten = loadOpdrachten();
  const code = (opdracht || '').toString().trim().toLowerCase();
  const opdrachtText = opdrachten[code];
  const hasOpdracht = Boolean(opdrachtText);

  // Extra regel voor het team als de opdracht-code ontbreekt of onbekend is.
  const missingCodeWarning = hasOpdracht ? '' : `
              <p style="color:#b3261e;"><strong>Let op:</strong> de opdracht-code ontbrak of was onbekend${code ? ` (ontvangen: ${escapeHtml(code)})` : ''}. Stuur zelf de passende zorgvraag toe.</p>`;

  try {
    // 1. Melding aan het team, direct.
    await sendMail({
      to: mailTo,
      replyTo: email || undefined,
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
              <p style="color:#2C3E50;line-height:1.6;white-space:pre-wrap;">${bericht}</p>${missingCodeWarning}
            </div>
          </div>`
    });

    // 2. Mail aan de invuller, vertraagd inplannen.
    if (email) {
      const html = buildApplicantMail(naam, hasOpdracht ? opdrachtText : OPDRACHT_FALLBACK);
      enqueueApplicantMail({
        to: email,
        subject: 'De zorgvraag waar we je over mailden',
        html,
        sendAt: Date.now() + delayMs(),
        attempts: 0
      });
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
