// api/winback-campaign.js
// Runs daily via Vercel Cron. Finds customers whose most recent paid/dispatched
// order was 45+ days ago and sends a one-time win-back email with a 10% code.
// Each customer only ever receives this once, tracked in winback_emails.

import { createClient } from '@supabase/supabase-js';

const WINBACK_CODE = 'COMEBACK10';
const DAYS_THRESHOLD = 45;

export default async function handler(req, res) {
  const auth = req.headers.authorization;
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const { data: orders, error } = await supabase
    .from('orders')
    .select('customer_name, customer_email, created_at')
    .in('status', ['paid', 'dispatched'])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Winback query error:', error.message);
    return res.status(500).json({ error: error.message });
  }

  if (!orders || orders.length === 0) {
    return res.status(200).json({ sent: 0, message: 'No paying customers found' });
  }

  // Most recent order per customer email
  const latestByEmail = new Map();
  for (const o of orders) {
    if (!o.customer_email) continue;
    const key = o.customer_email.toLowerCase();
    if (!latestByEmail.has(key)) {
      latestByEmail.set(key, o); // orders already sorted newest-first
    }
  }

  const thresholdDate = new Date(Date.now() - DAYS_THRESHOLD * 24 * 60 * 60 * 1000);
  const overdue = [...latestByEmail.values()].filter(o => new Date(o.created_at) < thresholdDate);

  if (overdue.length === 0) {
    return res.status(200).json({ sent: 0, message: 'No customers past the win-back threshold yet' });
  }

  // Exclude anyone already sent a win-back email
  const { data: alreadySent, error: alreadySentErr } = await supabase.from('winback_emails').select('customer_email');
  if (alreadySentErr) {
    console.error('Could not check winback_emails table — refusing to send to avoid duplicate emails:', alreadySentErr.message);
    return res.status(500).json({ error: 'Could not verify who has already been emailed: ' + alreadySentErr.message });
  }
  const alreadySentSet = new Set((alreadySent || []).map(r => r.customer_email.toLowerCase()));

  const targets = overdue.filter(o => !alreadySentSet.has(o.customer_email.toLowerCase()));

  let sent = 0;

  for (const customer of targets) {
    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Be Elite Supplements <sales@belitesupplements.com>',
          to: customer.customer_email,
          subject: 'We miss you — 10% off your next order 🧪',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
              <div style="background:#0E1116;padding:24px;text-align:center">
                <div style="display:inline-block;background:#fff;border-radius:12px;padding:10px 18px;margin-bottom:6px">
                  <img src="https://belitesupplements.com/logo-email.png" alt="Be Elite Supplements" style="height:36px;display:block"/>
                </div>
                <p style="color:#A3A3A0;font-size:12px;margin:4px 0 0">Research Grade Peptides</p>
              </div>
              <div style="background:#fff;padding:32px">
                <h2 style="color:#0E1116;margin:0 0 8px">It's been a while</h2>
                <p style="color:#444;margin:0 0 20px">Hi ${customer.customer_name || 'there'}, it's been a little while since your last order with us. Here's 10% off to welcome you back.</p>
                <div style="background:#F7F1E3;border:1px solid #E8DCC0;border-radius:8px;padding:20px;margin-bottom:24px;text-align:center">
                  <p style="margin:0 0 6px;color:#555;font-size:13px">Use code at checkout</p>
                  <p style="margin:0;color:#8C6A1E;font-size:24px;font-weight:bold;letter-spacing:1px">${WINBACK_CODE}</p>
                  <p style="margin:8px 0 0;color:#999;font-size:11px">10% off · No expiry · One use per customer</p>
                </div>
                <p style="text-align:center;margin:0 0 24px">
                  <a href="https://belitesupplements.com" style="background:#8C6A1E;color:#fff;padding:13px 32px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Shop Now</a>
                </p>
                <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:14px;margin-bottom:20px">
                  <p style="margin:0;color:#7a5c00;font-size:12px"><strong>⚠ Research Use Only.</strong> All products are supplied strictly for in vitro laboratory research purposes only. Not for human or veterinary use.</p>
                </div>
                <p style="color:#666;font-size:13px">Any questions? Just reply to this email or contact <a href="mailto:sales@belitesupplements.com" style="color:#8C6A1E">sales@belitesupplements.com</a></p>
              </div>
              <div style="background:#0E1116;padding:16px;text-align:center">
                <p style="color:#8A8A87;font-size:11px;margin:0 0 6px">© 2026 Be Elite Supplements · belitesupplements.com · Research use only</p>
                <p style="color:#8A8A87;font-size:11px;margin:0">Don't want offers like this? <a href="mailto:sales@belitesupplements.com?subject=Unsubscribe" style="color:#A3A3A0">Unsubscribe</a></p>
              </div>
            </div>
          `,
        }),
      });

      if (emailRes.ok) {
        const { error: insertErr } = await supabase.from('winback_emails').insert([{ customer_email: customer.customer_email.toLowerCase() }]);
        if (insertErr) {
          console.error('Sent email but FAILED to record it for', customer.customer_email, '— they may be emailed again:', insertErr.message);
        }
        sent++;
      } else {
        console.error('Resend failed (winback) for', customer.customer_email, await emailRes.text());
      }
    } catch (err) {
      console.error('Winback error for', customer.customer_email, err.message);
    }
  }

  console.log(`Winback campaign: ${sent} email(s) sent`);
  return res.status(200).json({ sent, eligible: overdue.length, alreadySent: alreadySentSet.size });
}
