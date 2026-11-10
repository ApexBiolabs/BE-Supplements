// api/fena-webhook.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body;
    console.log('Fena webhook received:', JSON.stringify(payload));

    const { reference, amount, status, customerName, customerEmail } = payload;

    if (!reference) {
      console.error('No reference in webhook payload');
      return res.status(400).json({ error: 'No reference' });
    }

    const completedStatuses = ['paid', 'executed', 'completed', 'authorized', 'approved'];
    if (!completedStatuses.includes(status)) {
      console.log('Ignoring webhook with status:', status);
      return res.status(200).json({ received: true });
    }

    const orderRef = ('BE-' + reference.replace(/^be-/, '')).toUpperCase();

    await updateOrderStatus(orderRef, parseFloat(amount));
    await sendEmails(orderRef, parseFloat(amount), customerName, customerEmail);

    console.log('Order confirmed:', orderRef);
    return res.status(200).json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error.message);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}

async function updateOrderStatus(orderRef, paidAmount) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    // Fetch the order to get affiliate code
    const { data: order } = await supabase
      .from('orders')
      .select('affiliate_code')
      .eq('ref', orderRef)
      .single();

    let commission = 0;

    // If there's an affiliate code, look up their commission %
    if (order?.affiliate_code) {
      const { data: aff } = await supabase
        .from('affiliates')
        .select('commission_pct')
        .eq('code', order.affiliate_code.toUpperCase())
        .single();

      if (aff?.commission_pct) {
        commission = parseFloat((paidAmount * aff.commission_pct / 100).toFixed(2));
      }
    }

    await supabase.from('orders').update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      commission,
    }).eq('ref', orderRef);

    console.log('Order updated to paid:', orderRef, 'commission:', commission);
  } catch (err) {
    console.error('Supabase update error:', err.message);
  }
}

async function sendEmails(orderRef, amount, customerName, customerEmail) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data: order } = await supabase.from('orders').select('*').eq('ref', orderRef).single();

    const name = customerName || order?.customer_name || 'Customer';
    const email = customerEmail || order?.customer_email;
    const items = order?.items || 'Lyophilised Peptide(s)';

    if (email) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Be Elite Supplements <sales@beelitesupplements.com>',
          to: email,
          subject: `Order Confirmed — ${orderRef}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
              <div style="background:#0E1116;padding:24px;text-align:center">
                <div style="display:inline-block;background:#fff;border-radius:12px;padding:10px 18px;margin-bottom:6px">
                  <img src="https://beelitesupplements.com/logo-email.png" alt="Be Elite Supplements" style="height:36px;display:block"/>
                </div>
                <p style="color:#A3A3A0;font-size:12px;margin:4px 0 0">Research Grade Peptides</p>
              </div>
              <div style="background:#fff;padding:32px">
                <h2 style="color:#0E1116;margin:0 0 8px">Order Confirmed ✓</h2>
                <p style="color:#444;margin:0 0 24px">Hi ${name}, your payment has been received and your order is confirmed.</p>
                <div style="background:#F7F1E3;border:1px solid #E8DCC0;border-radius:8px;padding:16px;margin-bottom:24px">
                  <p style="margin:0 0 6px;color:#555;font-size:13px"><strong>Order Reference:</strong> ${orderRef}</p>
                  <p style="margin:0 0 6px;color:#555;font-size:13px"><strong>Amount Paid:</strong> £${amount.toFixed(2)}</p>
                  <p style="margin:0 0 6px;color:#555;font-size:13px"><strong>Items:</strong> ${items}</p>
                  <p style="margin:0;color:#555;font-size:13px"><strong>Dispatch:</strong> Within 48 hours</p>
                </div>
                <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:14px;margin-bottom:24px">
                  <p style="margin:0;color:#7a5c00;font-size:12px"><strong>⚠ Research Use Only.</strong> All products are supplied strictly for in vitro laboratory research purposes only. Not for human or veterinary use.</p>
                </div>
                <p style="color:#666;font-size:13px">Questions? Contact us at <a href="mailto:sales@beelitesupplements.com" style="color:#8C6A1E">sales@beelitesupplements.com</a></p>
              </div>
              <div style="background:#0E1116;padding:16px;text-align:center">
                <p style="color:#8A8A87;font-size:11px;margin:0">© 2026 Be Elite Supplements · beelitesupplements.com · Research use only</p>
              </div>
            </div>
          `,
        }),
      });
    }

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Be Elite Supplements <sales@beelitesupplements.com>',
        to: 'sales@beelitesupplements.com',
        subject: `💰 New Order — ${orderRef} — £${amount.toFixed(2)}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:500px">
            <h2 style="color:#8C6A1E">New Order Received!</h2>
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:6px 0;color:#666;width:140px">Order Ref</td><td style="padding:6px 0;font-weight:bold">${orderRef}</td></tr>
              <tr><td style="padding:6px 0;color:#666">Customer</td><td style="padding:6px 0">${name}</td></tr>
              <tr><td style="padding:6px 0;color:#666">Email</td><td style="padding:6px 0">${email || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#666">Amount</td><td style="padding:6px 0;font-weight:bold;color:#8C6A1E">£${amount.toFixed(2)}</td></tr>
              <tr><td style="padding:6px 0;color:#666">Items</td><td style="padding:6px 0">${items}</td></tr>
              <tr><td style="padding:6px 0;color:#666">Shipping</td><td style="padding:6px 0">${order?.shipping_method || 'Standard'}</td></tr>
              <tr><td style="padding:6px 0;color:#666;vertical-align:top">Address</td><td style="padding:6px 0">${[order?.address_line1, order?.address_line2, order?.city, order?.county, order?.postcode].filter(Boolean).join(', ') || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#666">Phone</td><td style="padding:6px 0">${order?.phone || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#666">Affiliate</td><td style="padding:6px 0">${order?.affiliate_code || 'None'}</td></tr>
              ${order?.commission ? `<tr><td style="padding:6px 0;color:#666">Commission</td><td style="padding:6px 0;color:#c9a84c">£${parseFloat(order.commission).toFixed(2)}</td></tr>` : ''}
            </table>
            <p style="margin-top:20px"><a href="https://beelitesupplements.com/admin" style="background:#0E1116;color:white;padding:10px 20px;border-radius:6px;text-decoration:none">View in Admin Panel</a></p>
          </div>
        `,
      }),
    });

    console.log('Emails sent for order:', orderRef);
  } catch (err) {
    console.error('Email error:', err.message);
  }
}
