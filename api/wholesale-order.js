// api/wholesale-order.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { business, name, email, phone, notes, orderLines, grandTotal } = req.body;

    if (!business || !name || !email || !phone || !orderLines || orderLines.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const rows = orderLines.map(l => {
      const addons = [l.pens ? 'Pens' : null, l.boxes ? 'Boxes' : null].filter(Boolean).join(' + ') || '—';
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5">${l.product}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;text-align:center">${l.units}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5">${addons}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;text-align:right;font-weight:bold">£${l.lineTotal.toFixed(2)}</td>
        </tr>`;
    }).join('');

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Be Elite Supplements <sales@belitesupplements.com>',
        to: 'sales@belitesupplements.com',
        reply_to: email,
        subject: `📦 Wholesale Order Request — ${business} — £${grandTotal.toFixed(2)}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#0E1116;padding:20px;text-align:center">
              <h1 style="color:#C9A44C;font-size:20px;margin:0">New Wholesale Order Request</h1>
            </div>
            <div style="background:#fff;padding:28px">
              <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
                <tr><td style="padding:5px 0;color:#666;width:130px">Business</td><td style="padding:5px 0;font-weight:bold">${business}</td></tr>
                <tr><td style="padding:5px 0;color:#666">Contact</td><td style="padding:5px 0">${name}</td></tr>
                <tr><td style="padding:5px 0;color:#666">Email</td><td style="padding:5px 0">${email}</td></tr>
                <tr><td style="padding:5px 0;color:#666">Phone</td><td style="padding:5px 0">${phone}</td></tr>
                ${notes ? `<tr><td style="padding:5px 0;color:#666;vertical-align:top">Notes</td><td style="padding:5px 0">${notes}</td></tr>` : ''}
              </table>
              <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
                <thead>
                  <tr style="background:#F7F1E3">
                    <th style="padding:8px 12px;text-align:left;font-size:12px;color:#666">Product</th>
                    <th style="padding:8px 12px;text-align:center;font-size:12px;color:#666">Units</th>
                    <th style="padding:8px 12px;text-align:left;font-size:12px;color:#666">Add-ons</th>
                    <th style="padding:8px 12px;text-align:right;font-size:12px;color:#666">Total</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
              <div style="text-align:right;font-size:18px;font-weight:bold;color:#8C6A1E;padding-top:8px">
                Grand Total: £${grandTotal.toFixed(2)}
              </div>
            </div>
          </div>
        `,
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error('Resend error:', errText);
      return res.status(500).json({ error: 'Failed to send email' });
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Wholesale order error:', error.message);
    return res.status(500).json({ error: 'Failed to process order request' });
  }
}
