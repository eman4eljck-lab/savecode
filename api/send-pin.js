// Vercel Serverless Function
// Path in repo: /api/send-pin.js  →  available at https://www.savecode.us/api/send-pin
//
// Purpose: send the SaveCode verification PIN by email WITHOUT exposing the
// Resend API key in client-side code. The key is read from Vercel's
// Environment Variables (server-side only), never sent to the browser.
//
// Setup required in Vercel dashboard:
//   Project → Settings → Environment Variables
//   Name:  RESEND_API_KEY
//   Value: (your Resend API key, starts with re_...)
//   Apply to: Production, Preview, Development (all three)
//   Then redeploy the project so the function picks up the variable.

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to, pin } = req.body || {};

  // Basic validation
  if (!to || !pin) {
    return res.status(400).json({ error: 'Missing "to" or "pin" in request body' });
  }
  if (!/^\d{6}$/.test(String(pin))) {
    return res.status(400).json({ error: 'PIN must be exactly 6 digits' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: 'Server not configured: RESEND_API_KEY missing' });
  }

  const FROM_ADDRESS = process.env.RESEND_FROM || 'onboarding@resend.dev';

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [to],
        subject: 'Your SaveCode Verification PIN',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
            <h2 style="color:#0a0f1e;">SaveCode Verification PIN</h2>
            <p style="color:#374151;font-size:14px;">Use the PIN below to verify your address on your SaveCode dashboard:</p>
            <div style="font-family:monospace;font-size:32px;font-weight:700;letter-spacing:6px;background:#f5f0e8;padding:16px 24px;border-radius:10px;text-align:center;margin:20px 0;">${pin}</div>
            <p style="color:#6b7280;font-size:12px;">This PIN is temporary and was sent by email as part of an early testing phase. In production, SaveCode PINs are verified via physical mail to confirm address ownership.</p>
          </div>`
      })
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('Resend API error:', errText);
      return res.status(502).json({ error: 'Email provider error' });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('send-pin function error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
