/**
 * ZZP Opdracht landingspagina voor SamenOntzorgen.
 * Serveert opdracht.html en heeft een /contact-endpoint via nodemailer.
 *
 * Benodigde environment-variabelen op Railway:
 *   EMAIL_USER  = het Gmail-adres dat de mail verstuurt
 *   EMAIL_PASS  = het app-wachtwoord van dat Gmail-account
 *   MAIL_TO     = (optioneel) ontvanger, standaard info@samenontzorgen.nl
 */
const express    = require('express');
const nodemailer = require('nodemailer');
const path       = require('path');

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
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;
  const mailTo    = process.env.MAIL_TO || 'info@samenontzorgen.nl';
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

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: emailUser, pass: emailPass }
    });

    await transporter.sendMail({
      from: `"SamenOntzorgen ZZP" <${emailUser}>`,
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
            <p style="color:#2C3E50;line-height:1.6;white-space:pre-wrap;">${bericht}</p>
          </div>
        </div>`
    });

    res.json({ success: true, message: 'Verzonden. We nemen snel contact op.' });
  } catch (error) {
    console.error('E-mail fout:', error);
    res.status(500).json({ success: false, message: 'Er ging iets mis bij het verzenden. Probeer het later nog eens.' });
  }
});

app.listen(PORT, () => {
  console.log(`ZZP landingspagina draait op http://localhost:${PORT}`);
});
