// api/request-payout.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, name, email } = req.body;

    if (!code || !name) {
      return res.status(400).json({ error: 'Missing affiliate details' });
    }

    // Look up current commission owed via Supabase
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    const { data: orders } = await supabase
      .from('orders')
      .select('commission')
      .eq('affiliate_code', code.toUpperCase())
      .in('status', ['paid', 'dispatched']);

    const totalCommission = (orders || []).reduce((s, o) => s + parseFloat(o.commission || 0), 0);

    // Email admin notification
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Be Elite Supplements <sales@belitesupplements.com>',
        to: 'sales@belitesupplements.com',
        subject: `💸 Payout Request — ${name} (${code})`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:500px">
            <h2 style="color:#8C6A1E">Affiliate Payout Request</h2>
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:6px 0;color:#666;width:140px">Affiliate</td><td style="padding:6px 0;font-weight:bold">${name}</td></tr>
              <tr><td style="padding:6px 0;color:#666">Code</td><td style="padding:6px 0">${code}</td></tr>
              <tr><td style="padding:6px 0;color:#666">Email</td><td style="padding:6px 0">${email || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#666">Amount Owed</td><td style="padding:6px 0;font-weight:bold;color:#8C6A1E">£${totalCommission.toFixed(2)}</td></tr>
            </table>
            <p style="margin-top:20px"><a href="https://belitesupplements.com/admin" style="background:#0E1116;color:white;padding:10px 20px;border-radius:6px;text-decoration:none">View in Admin Panel</a></p>
          </div>
        `,
      }),
    });

    return res.status(200).json({ success: true, amount: totalCommission });

  } catch (error) {
    console.error('Payout request error:', error.message);
    return res.status(500).json({ error: 'Failed to process payout request' });
  }
}
