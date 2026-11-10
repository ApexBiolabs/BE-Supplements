// api/affiliates.js
// Full CRUD for affiliates — protected by admin key
// Public GET with ?code= param for affiliate login (no admin key needed)
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // PUBLIC — discount code check at checkout (GET /api/affiliates?code=CODE)
  // Returns only what checkout needs. Never returns passwords or contact details.
  if (req.method === 'GET' && req.query.code) {
    const { data, error } = await supabase
      .from('affiliates')
      .select('code, discount_pct, status')
      .eq('code', req.query.code.toUpperCase())
      .eq('status', 'active')
      .single();
    if (error || !data) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json({ code: data.code, discount_pct: data.discount_pct });
  }

  // PUBLIC — affiliate portal login, checked on the server
  // POST { action: 'login', code, password }
  if (req.method === 'POST' && req.body && req.body.action === 'login') {
    const { code, password } = req.body;
    if (!code || !password) return res.status(400).json({ error: 'Missing code or password' });
    const { data, error } = await supabase
      .from('affiliates')
      .select('id, name, email, code, password, discount_pct, commission_pct, tier, status')
      .eq('code', String(code).toUpperCase())
      .eq('status', 'active')
      .single();
    if (error || !data || data.password !== password) return res.status(401).json({ error: 'Incorrect code or password' });
    const { password: _omit, ...safe } = data;
    return res.status(200).json(safe);
  }

  // All other routes require admin key
  const auth = req.headers['x-admin-key'];
  if (!process.env.ADMIN_KEY || auth !== process.env.ADMIN_KEY) return res.status(401).json({ error: 'Unauthorised' });

  // GET — list all affiliates
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('affiliates')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // POST — create new affiliate
  if (req.method === 'POST') {
    const { name, email, code, password, discount_pct, commission_pct, tier, is_discount_only } = req.body;

    if (is_discount_only) {
      if (!code || !discount_pct) {
        return res.status(400).json({ error: 'Missing code or discount percentage' });
      }
      const { data, error } = await supabase.from('affiliates').insert([{
        name: name || code,
        email: `${code.toLowerCase().replace(/[^a-z0-9]/g,'')}@discount-code.local`,
        code: code.toUpperCase(),
        password: `nologin-${code.toLowerCase().replace(/[^a-z0-9]/g,'')}`,
        discount_pct,
        commission_pct: 0,
        tier: 'Discount Code',
        status: 'active',
        is_discount_only: true,
      }]).select().single();
      if (error) {
        console.error('Discount code creation error:', error.message, error.details, error.hint);
        return res.status(500).json({ error: error.message, details: error.details, hint: error.hint });
      }
      return res.status(200).json(data);
    }

    if (!name || !email || !code || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const { data, error } = await supabase.from('affiliates').insert([{
      name, email,
      code: code.toUpperCase(),
      password,
      discount_pct: discount_pct || 10,
      commission_pct: commission_pct || 10,
      tier: tier || 'Standard',
      status: 'active',
    }]).select().single();
    if (error) return res.status(500).json({ error: error.message });

    // Send welcome email to new affiliate
    try {
      const upperCode = code.toUpperCase();
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Be Elite Supplements <sales@belitesupplements.com>',
          to: email,
          subject: 'Welcome to the Be Elite Supplements Affiliate Programme!',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
              <div style="background:#0E1116;padding:24px;text-align:center">
                <div style="display:inline-block;background:#fff;border-radius:12px;padding:10px 18px;margin-bottom:6px"><img src="https://belitesupplements.com/logo-email.png" alt="Be Elite Supplements" style="height:36px;display:block"/></div>
                <p style="color:#A3A3A0;font-size:12px;margin:4px 0 0">Affiliate Programme</p>
              </div>
              <div style="background:#fff;padding:32px">
                <h2 style="color:#0E1116;margin:0 0 16px">Welcome to the Team! 🎉</h2>
                <p style="color:#444;margin:0 0 24px">Hi ${name}, you've been added to the Be Elite Supplements affiliate programme. Here are your details:</p>
                <div style="background:#F7F1E3;border:1px solid #E8DCC0;border-radius:8px;padding:20px;margin-bottom:24px">
                  <p style="margin:0 0 10px;color:#555;font-size:14px"><strong>Your Discount Code:</strong> <span style="font-size:18px;color:#8C6A1E;font-weight:800">${upperCode}</span></p>
                  <p style="margin:0 0 10px;color:#555;font-size:14px"><strong>Customer Discount:</strong> ${discount_pct || 10}% off all orders</p>
                  <p style="margin:0 0 10px;color:#555;font-size:14px"><strong>Your Commission:</strong> ${commission_pct || 10}% per sale</p>
                  <p style="margin:0 0 10px;color:#555;font-size:14px"><strong>Affiliate Portal:</strong> <a href="https://belitesupplements.com/affiliate.html" style="color:#8C6A1E">belitesupplements.com/affiliate.html</a></p>
                  <p style="margin:0;color:#555;font-size:14px"><strong>Your Password:</strong> ${password}</p>
                </div>
                <p style="color:#444;font-size:14px;margin:0 0 16px">Share your code with your audience — every time someone uses it at checkout, they get a discount and you earn commission.</p>
                <p style="color:#666;font-size:13px">Questions? Contact us at <a href="mailto:sales@belitesupplements.com" style="color:#8C6A1E">sales@belitesupplements.com</a></p>
              </div>
              <div style="background:#0E1116;padding:16px;text-align:center">
                <p style="color:#8A8A87;font-size:11px;margin:0">© 2026 Be Elite Supplements · belitesupplements.com · Research use only</p>
              </div>
            </div>
          `,
        }),
      });
      console.log('Welcome email sent to:', email);
    } catch (emailErr) {
      console.error('Welcome email error:', emailErr.message);
      // Don't fail the affiliate creation if email fails
    }

    return res.status(200).json(data);
  }

  // PATCH — update affiliate
  if (req.method === 'PATCH') {
    const { id, name, email, code, password, discount_pct, commission_pct, tier, status, is_discount_only } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const updates = {
      name, email,
      code: code?.toUpperCase(),
      password,
      discount_pct,
      commission_pct,
      tier,
      status,
    };
    if (typeof is_discount_only === 'boolean') updates.is_discount_only = is_discount_only;
    const { error } = await supabase.from('affiliates').update(updates).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  // DELETE — remove affiliate
  if (req.method === 'DELETE') {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const { error } = await supabase.from('affiliates').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
