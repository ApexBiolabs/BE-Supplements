// api/wholesale-inquiry.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, email, company, phone, notes, items, total } = req.body;

    if (!name || !email || !items || items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const itemRows = items.map(i => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${i.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${i.units}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${i.pen ? '✓' : '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${i.box ? '✓' : '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600">£${parseFloat(i.total).toFixed(2)}</td>
      </tr>
    `).join('');

    // Notify Be Elite Supplements
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Be Elite Supplements <sales@belitesupplements.com>',
        to: 'sales@belitesupplements.com',
        subject: `🏭 Wholesale Enquiry — ${name}${company ? ' (' + company + ')' : ''} — £${parseFloat(total).toFixed(2)}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px">
            <h2 style="color:#8C6A1E">New Wholesale Enquiry</h2>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
              <tr><td style="padding:6px 0;color:#666;width:140px">Contact</td><td style="padding:6px 0;font-weight:bold">${name}</td></tr>
              <tr><td style="padding:6px 0;color:#666">Company</td><td style="padding:6px 0">${company || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#666">Email</td><td style="padding:6px 0">${email}</td></tr>
              <tr><td style="padding:6px 0;color:#666">Phone</td><td style="padding:6px 0">${phone || '—'}</td></tr>
            </table>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
              <thead>
                <tr style="background:#F7F1E3">
                  <th style="padding:8px 12px;text-align:left">Product</th>
                  <th style="padding:8px 12px">Units</th>
                  <th style="padding:8px 12px">Pens</th>
                  <th style="padding:8px 12px">Boxes</th>
                  <th style="padding:8px 12px;text-align:right">Total</th>
                </tr>
              </thead>
              <tbody>${itemRows}</tbody>
              <tfoot>
                <tr>
                  <td colspan="4" style="padding:10px 12px;text-align:right;font-weight:bold">Order Total</td>
                  <td style="padding:10px 12px;text-align:right;font-weight:bold;color:#8C6A1E;font-size:1.1em">£${parseFloat(total).toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
            ${notes ? `<p style="color:#444"><strong>Notes:</strong> ${notes}</p>` : ''}
          </div>
        `,
      }),
    });

    // Confirmation to the enquirer
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Be Elite Supplements <sales@belitesupplements.com>',
        to: email,
        subject: 'Wholesale Enquiry Received — Be Elite Supplements',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
            <div style="background:#0E1116;padding:24px;text-align:center">
              <h1 style="color:#C9A44C;font-size:22px;margin:0">BE ELITE SUPPLEMENTS</h1>
            </div>
            <div style="background:#fff;padding:32px">
              <h2 style="color:#0E1116;margin:0 0 8px">Thanks, ${name}</h2>
              <p style="color:#444">We've received your wholesale enquiry and will be in touch shortly to confirm your order and arrange payment.</p>
              <table style="width:100%;border-collapse:collapse;margin:20px 0">
                <thead>
                  <tr style="background:#F7F1E3">
                    <th style="padding:8px 12px;text-align:left;font-size:13px">Product</th>
                    <th style="padding:8px 12px;font-size:13px">Units</th>
                    <th style="padding:8px 12px;text-align:right;font-size:13px">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${items.map(i => `<tr><td style="padding:6px 12px;font-size:13px">${i.name}${i.pen ? ' + Pens' : ''}${i.box ? ' + Boxes' : ''}</td><td style="padding:6px 12px;text-align:center;font-size:13px">${i.units}</td><td style="padding:6px 12px;text-align:right;font-size:13px">£${parseFloat(i.total).toFixed(2)}</td></tr>`).join('')}
                </tbody>
                <tfoot>
                  <tr><td colspan="2" style="padding:10px 12px;text-align:right;font-weight:bold">Total</td><td style="padding:10px 12px;text-align:right;font-weight:bold;color:#8C6A1E">£${parseFloat(total).toFixed(2)}</td></tr>
                </tfoot>
              </table>
              <p style="color:#666;font-size:13px">Questions in the meantime? Reply to this email or contact <a href="mailto:sales@belitesupplements.com" style="color:#8C6A1E">sales@belitesupplements.com</a></p>
            </div>
            <div style="background:#0E1116;padding:16px;text-align:center">
              <p style="color:#8A8A87;font-size:11px;margin:0">© 2026 Be Elite Supplements · belitesupplements.com</p>
            </div>
          </div>
        `,
      }),
    });

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Wholesale inquiry error:', error.message);
    return res.status(500).json({ error: 'Failed to process enquiry' });
  }
}
