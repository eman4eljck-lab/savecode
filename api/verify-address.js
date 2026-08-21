// Vercel Serverless Function
// Path in repo: /api/verify-address.js  →  available at https://www.savecode.us/api/verify-address
//
// Purpose: verify that a US mailing address is actually deliverable using
// Lob.com's US Address Verification API, WITHOUT exposing the Lob API key
// in client-side code. The key is read from Vercel's Environment Variables
// (server-side only), never sent to the browser.
//
// Setup required in Vercel dashboard:
//   Project → Settings → Environment Variables
//   Name:  LOB_API_KEY
//   Value: (your Lob live or test secret key, starts with live_... or test_...)
//   Apply to: Production, Preview, Development (all three)
//   Then redeploy the project so the function picks up the variable.

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { street, unit, city, state, zip } = req.body || {};

  // Basic validation
  if (!street || !city || !state || !zip) {
    return res.status(400).json({ error: 'Missing required address fields (street, city, state, zip)' });
  }
  if (!/^\d{5}$/.test(String(zip))) {
    return res.status(400).json({ error: 'ZIP code must be exactly 5 digits' });
  }

  const LOB_API_KEY = process.env.LOB_API_KEY;
  if (!LOB_API_KEY) {
    return res.status(500).json({ error: 'Server not configured: LOB_API_KEY missing' });
  }

  try {
    const lobRes = await fetch('https://api.lob.com/v1/us_verifications', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${LOB_API_KEY}:`).toString('base64'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        primary_line: street,
        secondary_line: unit || undefined,
        city,
        state,
        zip_code: zip
      })
    });

    if (!lobRes.ok) {
      const errText = await lobRes.text();
      console.error('Lob API error:', errText);
      return res.status(502).json({ error: 'Address verification provider error' });
    }

    const data = await lobRes.json();
    const deliverability = data.deliverability || 'undeliverable';
    // Lob's own guidance: any "deliverable*" value means mail can reach the
    // address (unit-related suffixes just flag a secondary-unit nuance).
    // Only a bare "undeliverable" should be rejected.
    const deliverable = deliverability.startsWith('deliverable');

    return res.status(200).json({
      deliverable,
      deliverability,
      normalized: {
        primary_line: data.primary_line,
        secondary_line: data.secondary_line,
        city: data.components?.city,
        state: data.components?.state,
        zip_code: data.components?.zip_code
      }
    });

  } catch (err) {
    console.error('verify-address function error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
