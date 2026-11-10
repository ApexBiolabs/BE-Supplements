// api/abandoned-cart.js
// Runs daily via Vercel Cron. Finds pending orders (abandoned checkouts)
// between 4 hours and 7 days old, sends one reminder email each.
// Account holders get an enhanced 10%-off version instead of the plain reminder.

import { createClient } from '@supabase/supabase-js';

const BASKET_CODE = 'BASKET10';

export default async function handler(req, res) {
  const auth = req.headers.authorization;
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: orders, error } = await supabase
    .from('orders')
    .select('ref, customer_name, customer_email, items, amount, created_at')
    .eq('status', 'pending')
    .lt('created_at', fourHoursAgo)
    .gt('created_at', sevenDaysAgo)
    .or('reminder_sent.is.null,reminder_sent.eq.false');

  if (error) {
    console.error('Abandoned cart query error:', error.message);
    return res.status(500).json({ error: error.message });
  }

  if (!orders || orders.length === 0) {
    return res.status(200).json({ sent: 0, message: 'No abandoned carts to chase' });
  }

  const accountEmails = await fetchAccountHolderEmails(supabase);

  // Customers who already have a completed order shouldn't be chased for an older abandoned one
  const { data: completedOrders } = await supabase
    .from('orders')
    .select('customer_email')
    .in('status', ['paid', 'dispatched']);
  const alreadyPaidEmails = new Set((completedOrders || []).map(o => (o.customer_email || '').toLowerCase()).filter(Boolean));

  let sent = 0;
  let sentEnhanced = 0;
  let skippedAlreadyPaid = 0;

  for (const order of orders) {
    if (!order.customer_email) continue;

    if (alreadyPaidEmails.has(order.customer_email.toLowerCase())) {
      await supabase.from('orders').update({ status: 'cancelled' }).eq('ref', order.ref);
      skippedAlreadyPaid++;
      continue;
    }

    const isAccountHolder = accountEmails.has(order.customer_email.toLowerCase());

    try {
      const emailRes = isAccountHolder
        ? await sendEnhancedReminder(order)
        : await sendPlainReminder(order);

      if (emailRes) {
        await supabase.from('orders').update({ reminder_sent: true }).eq('ref', order.ref);
        sent++;
        if (isAccountHolder) sentEnhanced++;
      }
    } catch (err) {
      console.error('Reminder error for', order.ref, err.message);
    }
  }

  console.log(`Abandoned cart: ${sent} reminder(s) sent (${sentEnhanced} enhanced), ${skippedAlreadyPaid} already-paid duplicate(s) cancelled`);
  return res.status(200).json({ sent, enhanced: sentEnhanced, skippedAlreadyPaid, checked: orders.length });
}

async function fetchAccountHolderEmails(supabase) {
  const emails = new Set();
  let page = 1;
  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data || !data.users || data.users.length === 0) break;
    data.users.forEach(u => { if (u.email) emails.add(u.email.toLowerCase()); });
    if (data.users.length < 1000) break;
    page++;
  }
  return emails;
}

async function sendPlainReminder(order) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Be Elite Supplements <sales@beelitesupplements.com>',
      to: order.customer_email,
      subject: 'You left something behind 🧪',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
          <div style="background:#0E1116;padding:24px;text-align:center">
            <div style="display:inline-block;background:#fff;border-radius:12px;padding:10px 18px;margin-bottom:6px"><img src="https://beelitesupplements.com/logo-email.png" alt="Be Elite Supplements" style="height:36px;display:block"/></div>
            <p style="color:#A3A3A0;font-size:12px;margin:4px 0 0">Research Grade Peptides</p>
          </div>
          <div style="background:#fff;padding:32px">
            <h2 style="color:#0E1116;margin:0 0 8px">Still interested?</h2>
            <p style="color:#444;margin:0 0 24px">Hi ${order.customer_name || 'there'}, you started an order with us but didn't quite finish. Your items are still available.</p>
            <div style="background:#F7F1E3;border:1px solid #E8DCC0;border-radius:8px;padding:16px;margin-bottom:24px">
              <p style="margin:0 0 6px;color:#555;font-size:13px"><strong>Your basket:</strong> ${order.items || 'Lyophilised Peptide(s)'}</p>
              <p style="margin:0;color:#555;font-size:13px"><strong>Total:</strong> £${parseFloat(order.amount || 0).toFixed(2)}</p>
            </div>
            <p style="text-align:center;margin:0 0 24px">
              <a href="https://beelitesupplements.com" style="background:#8C6A1E;color:#fff;padding:13px 32px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Complete Your Order</a>
            </p>
            <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:14px;margin-bottom:20px">
              <p style="margin:0;color:#7a5c00;font-size:12px"><strong>⚠ Research Use Only.</strong> All products are supplied strictly for in vitro laboratory research purposes only. Not for human or veterinary use.</p>
            </div>
            <p style="color:#666;font-size:13px">Any questions? Just reply to this email or contact <a href="mailto:sales@beelitesupplements.com" style="color:#8C6A1E">sales@beelitesupplements.com</a></p>
          </div>
          <div style="background:#0E1116;padding:16px;text-align:center">
            <p style="color:#8A8A87;font-size:11px;margin:0 0 6px">© 2026 Be Elite Supplements · beelitesupplements.com · Research use only</p>
            <p style="color:#8A8A87;font-size:11px;margin:0">Don't want reminders like this? <a href="mailto:sales@beelitesupplements.com?subject=Unsubscribe" style="color:#A3A3A0">Unsubscribe</a></p>
          </div>
        </div>
      `,
    }),
  });
  if (!res.ok) { console.error('Resend failed for', order.ref, await res.text()); return false; }
  return true;
}

async function sendEnhancedReminder(order) {
  const original = parseFloat(order.amount || 0);
  const discounted = Math.round(original * 0.9 * 100) / 100;
  const link = `https://beelitesupplements.com/?ref=${BASKET_CODE}`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Be Elite Supplements <sales@beelitesupplements.com>',
      to: order.customer_email,
      subject: "You left something behind — here's 10% off 🧪",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
          <div style="background:#0E1116;padding:24px;text-align:center">
            <div style="display:inline-block;background:#fff;border-radius:12px;padding:10px 18px;margin-bottom:6px"><img src="https://beelitesupplements.com/logo-email.png" alt="Be Elite Supplements" style="height:36px;display:block"/></div>
            <p style="color:#A3A3A0;font-size:12px;margin:4px 0 0">Research Grade Peptides</p>
          </div>
          <div style="background:#fff;padding:32px">
            <h2 style="color:#0E1116;margin:0 0 8px">Still interested? Here's 10% off.</h2>
            <p style="color:#444;margin:0 0 20px">Hi ${order.customer_name || 'there'}, you started an order with us but didn't quite finish. As one of our account holders, here's 10% off to help you complete it.</p>
            <div style="background:#F7F1E3;border:1px solid #E8DCC0;border-radius:8px;padding:16px;margin-bottom:20px">
              <p style="margin:0 0 10px;color:#555;font-size:13px"><strong>Your basket:</strong> ${order.items || 'Lyophilised Peptide(s)'}</p>
              <p style="margin:0 0 4px;color:#999;font-size:13px;text-decoration:line-through">Was: £${original.toFixed(2)}</p>
              <p style="margin:0;color:#8C6A1E;font-size:18px;font-weight:bold">Now: £${discounted.toFixed(2)}</p>
            </div>
            <p style="text-align:center;margin:0 0 8px">
              <a href="${link}" style="background:#8C6A1E;color:#fff;padding:13px 32px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Shop Now — Discount Applied</a>
            </p>
            <p style="text-align:center;color:#999;font-size:11px;margin:0 0 24px">Your discount is applied automatically when you click through — just re-add the items above at checkout.</p>
            <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:14px;margin-bottom:20px">
              <p style="margin:0;color:#7a5c00;font-size:12px"><strong>⚠ Research Use Only.</strong> All products are supplied strictly for in vitro laboratory research purposes only. Not for human or veterinary use.</p>
            </div>
            <p style="color:#666;font-size:13px">Any questions? Just reply to this email or contact <a href="mailto:sales@beelitesupplements.com" style="color:#8C6A1E">sales@beelitesupplements.com</a></p>
          </div>
          <div style="background:#0E1116;padding:16px;text-align:center">
            <p style="color:#8A8A87;font-size:11px;margin:0 0 6px">© 2026 Be Elite Supplements · beelitesupplements.com · Research use only</p>
            <p style="color:#8A8A87;font-size:11px;margin:0">Don't want offers like this? <a href="mailto:sales@beelitesupplements.com?subject=Unsubscribe" style="color:#A3A3A0">Unsubscribe</a></p>
          </div>
        </div>
      `,
    }),
  });
  if (!res.ok) { console.error('Resend failed (enhanced) for', order.ref, await res.text()); return false; }
  return true;
}
