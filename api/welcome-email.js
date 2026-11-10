// api/welcome-email.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Missing name or email' });
    }

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Be Elite Supplements <sales@belitesupplements.com>',
        to: email,
        subject: 'Welcome to Be Elite Supplements — Account Created',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
            <div style="background:#0E1116;padding:24px;text-align:center">
              <div style="display:inline-block;background:#fff;border-radius:12px;padding:10px 18px;margin-bottom:6px"><img src="https://belitesupplements.com/logo-email.png" alt="Be Elite Supplements" style="height:36px;display:block"/></div>
              <p style="color:#A3A3A0;font-size:12px;margin:4px 0 0">Research Grade Peptides</p>
            </div>
            <div style="background:#fff;padding:32px">
              <h2 style="color:#0E1116;margin:0 0 8px">Welcome, ${name} 👋</h2>
              <p style="color:#444;margin:0 0 20px">Your account has been created. You can now sign in anytime to track your orders and view your order history.</p>
              <p style="text-align:center;margin:0 0 20px">
                <a href="https://belitesupplements.com/account" style="background:#8C6A1E;color:#fff;padding:13px 32px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">View My Account</a>
              </p>
              <p style="color:#666;font-size:13px">Questions? Contact us at <a href="mailto:sales@belitesupplements.com" style="color:#8C6A1E">sales@belitesupplements.com</a></p>
            </div>
            <div style="background:#0E1116;padding:16px;text-align:center">
              <p style="color:#8A8A87;font-size:11px;margin:0">© 2026 Be Elite Supplements · belitesupplements.com</p>
            </div>
          </div>
        `,
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error('Resend error:', errText);
      return res.status(500).json({ error: 'Failed to send welcome email' });
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Welcome email error:', error.message);
    return res.status(500).json({ error: 'Failed to send welcome email' });
  }
}
