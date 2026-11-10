// api/orders.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const auth = req.headers['x-admin-key'];

  // PUBLIC — affiliate can fetch their own orders by code
  if (req.method === 'GET' && req.query.affiliate_code) {
    const { data, error } = await supabase
      .from('orders')
      .select('ref, amount, commission, commission_paid, created_at, status, items')
      .eq('affiliate_code', req.query.affiliate_code.toUpperCase())
      .in('status', ['paid', 'dispatched'])
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // All other routes require admin key
  if (!process.env.ADMIN_KEY || auth !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  if (req.method === 'GET' && req.query.check) return res.status(200).json({ ok: true });

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5000);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'PATCH') {
    const { ref, status, tracking, affiliate_code, mark_commission_paid, cleanup_duplicate_pending } = req.body;

    // Cancel pending orders where the same customer already has a completed order elsewhere
    if (cleanup_duplicate_pending) {
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

      const { data: pendingOrders, error: pendingErr } = await supabase
        .from('orders')
        .select('ref, customer_email, created_at')
        .eq('status', 'pending');
      if (pendingErr) return res.status(500).json({ error: pendingErr.message });
      if (!pendingOrders || pendingOrders.length === 0) {
        return res.status(200).json({ cancelled: 0 });
      }

      const { data: completedOrders, error: completedErr } = await supabase
        .from('orders')
        .select('customer_email')
        .in('status', ['paid', 'dispatched']);
      if (completedErr) return res.status(500).json({ error: completedErr.message });

      const completedEmails = new Set((completedOrders || []).map(o => (o.customer_email || '').toLowerCase()).filter(Boolean));

      const toCancel = pendingOrders
        .filter(o => {
          const isDuplicate = o.customer_email && completedEmails.has(o.customer_email.toLowerCase());
          const isOld = o.created_at < fourHoursAgo;
          return isDuplicate || isOld;
        })
        .map(o => o.ref);

      if (toCancel.length === 0) {
        return res.status(200).json({ cancelled: 0 });
      }

      const { error: cancelErr } = await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .in('ref', toCancel);
      if (cancelErr) return res.status(500).json({ error: cancelErr.message });

      return res.status(200).json({ cancelled: toCancel.length, refs: toCancel });
    }

    // Mark all owed commission for an affiliate as paid out
    if (mark_commission_paid && affiliate_code) {
      const { error } = await supabase
        .from('orders')
        .update({ commission_paid: true })
        .eq('affiliate_code', affiliate_code.toUpperCase())
        .in('status', ['paid', 'dispatched'])
        .or('commission_paid.is.null,commission_paid.eq.false');
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true });
    }

    const updates = { status };
    if (tracking !== undefined && tracking !== null) updates.tracking_number = tracking;
    if (status === 'dispatched') updates.dispatched_at = new Date().toISOString();

    const { error } = await supabase
      .from('orders')
      .update(updates)
      .eq('ref', ref);
    if (error) return res.status(500).json({ error: error.message });
    if (status === 'dispatched') await sendDispatchEmail(ref, tracking, supabase);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function sendDispatchEmail(orderRef, tracking, supabase) {
  try {
    const { data: order } = await supabase
      .from('orders')
      .select('customer_email, customer_name, items')
      .eq('ref', orderRef)
      .single();

    if (!order?.customer_email) return;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Be Elite Supplements <sales@belitesupplements.com>',
        to: order.customer_email,
        subject: `Your Order ${orderRef} Has Been Dispatched 📦`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
            <div style="background:#0E1116;padding:24px;text-align:center">
              <div style="display:inline-block;background:#fff;border-radius:12px;padding:10px 18px;margin-bottom:6px"><img src="https://belitesupplements.com/logo-email.png" alt="Be Elite Supplements" style="height:36px;display:block"/></div>
            </div>
            <div style="background:#fff;padding:32px">
              <h2 style="color:#0E1116">Your Order Is On Its Way! 📦</h2>
              <p style="color:#444">Hi ${order.customer_name || 'there'}, your order <strong>${orderRef}</strong> has been dispatched.</p>
              ${tracking ? `<p style="color:#444">Tracking number: <strong>${tracking}</strong></p>` : ''}
              <p style="color:#444">Expected delivery: 1–5 working days depending on your chosen shipping method.</p>
              <p style="color:#666;font-size:12px">All products are supplied for research use only. Not for human consumption.</p>
            </div>
            <div style="background:#0E1116;padding:16px;text-align:center">
              <p style="color:#8A8A87;font-size:11px;margin:0">© 2026 Be Elite Supplements · belitesupplements.com</p>
            </div>
          </div>
        `,
      }),
    });
  } catch (err) {
    console.error('Dispatch email error:', err);
  }
}
