// api/print-label.js
// Creates a Royal Mail Click & Drop order
// Docs: https://api.parcel.royalmail.com/api/v1

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers['x-admin-key'];
  if (!process.env.ADMIN_KEY || auth !== process.env.ADMIN_KEY) return res.status(401).json({ error: 'Unauthorised' });

  const { orderRef, service = 'TPS' } = req.body;
  if (!orderRef) return res.status(400).json({ error: 'Missing orderRef' });

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const { data: order, error } = await supabase
    .from('orders')
    .select('*')
    .eq('ref', orderRef)
    .single();

  if (error || !order) return res.status(404).json({ error: 'Order not found' });

  try {
    const serviceCodeMap = {
      'TPS': 'TOLP24',
      'TPL': 'TOLP48',
      'STL1': 'OLP1',
      'STL2': 'OLP2',
    };
    const rmServiceCode = serviceCodeMap[service] || 'TOLP24';
    const shippingMethodName = service === 'TPS' ? 'Tracked 24'
      : service === 'TPL' ? 'Tracked 48'
      : service === 'STL1' ? '1st Class'
      : '2nd Class';

    const amount = parseFloat(order.amount || 0);

    // Royal Mail Click & Drop API format - wrapped in items array
    const rmPayload = {
      items: [{
        orderReference: order.ref,
        orderDate: new Date(order.created_at).toISOString(),
        subtotal: amount,
        shippingCostCharged: 0,
        total: amount,
        currencyCode: 'GBP',
        recipient: {
          address: {
            fullName: order.customer_name || 'Customer',
            addressLine1: order.address_line1 || '',
            addressLine2: order.address_line2 || '',
            city: order.city || '',
            postcode: order.postcode || '',
            countryCode: 'GB',
          },
          emailAddress: order.customer_email || '',
          phoneNumber: order.phone || '',
        },
        packages: [{
          weightInGrams: 200,
          packageFormatIdentifier: 'SmallParcel',
          contents: [{
            name: order.items || 'Research Peptide(s)',
            SKU: order.ref,
            quantity: 1,
            unitValue: amount,
            unitWeightInGrams: 200,
          }],
        }],
        billing: {
          address: {
            fullName: order.customer_name || 'Customer',
            addressLine1: order.address_line1 || '',
            addressLine2: order.address_line2 || '',
            city: order.city || '',
            postcode: order.postcode || '',
            countryCode: 'GB',
          },
          emailAddress: order.customer_email || '',
          phoneNumber: order.phone || '',
        },
        postageDetails: {
          sendNotificationsTo: 'recipient',
          serviceCode: rmServiceCode,
        },
      }],
    };

    console.log('Sending to Royal Mail:', JSON.stringify(rmPayload));

    const rmRes = await fetch('https://api.parcel.royalmail.com/api/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': process.env.ROYAL_MAIL_API_KEY,
        'Accept': 'application/json',
      },
      body: JSON.stringify(rmPayload),
    });

    const responseText = await rmRes.text();
    console.log('Royal Mail response status:', rmRes.status);
    console.log('Royal Mail response:', responseText);

    if (!rmRes.ok) {
      return res.status(502).json({ error: 'Royal Mail API error', details: responseText });
    }

    const rmData = JSON.parse(responseText);
    const orderIdentifier = rmData?.[0]?.orderIdentifier;
    const trackingNumber = rmData?.[0]?.trackingNumber || null;

    // Update order status to dispatched
    await supabase.from('orders').update({
      status: 'dispatched',
      tracking_number: trackingNumber || null,
      dispatched_at: new Date().toISOString(),
    }).eq('ref', orderRef);

    // Send dispatch email to customer
    if (order.customer_email) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Be Elite Supplements <sales@belitesupplements.com>',
          to: order.customer_email,
          subject: `Your Order Has Been Dispatched — ${orderRef}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
              <div style="background:#0E1116;padding:24px;text-align:center">
                <h1 style="color:#C9A44C;font-size:22px;margin:0">BE ELITE SUPPLEMENTS</h1>
                <p style="color:#A3A3A0;font-size:12px;margin:4px 0 0">Research Grade Peptides</p>
              </div>
              <div style="background:#fff;padding:32px">
                <h2 style="color:#0E1116;margin:0 0 8px">Your Order Is On Its Way 📦</h2>
                <p style="color:#444;margin:0 0 24px">Hi ${order.customer_name || 'there'}, your order has been dispatched.</p>
                <div style="background:#F7F1E3;border:1px solid #E8DCC0;border-radius:8px;padding:16px;margin-bottom:24px">
                  <p style="margin:0 0 6px;color:#555;font-size:13px"><strong>Order Reference:</strong> ${orderRef}</p>
                  <p style="margin:0 0 6px;color:#555;font-size:13px"><strong>Items:</strong> ${order.items || 'Lyophilised Peptide(s)'}</p>
                  <p style="margin:0 0 6px;color:#555;font-size:13px"><strong>Service:</strong> ${shippingMethodName}</p>
                  ${trackingNumber ? `<p style="margin:0;color:#555;font-size:13px"><strong>Tracking:</strong> <a href="https://www.royalmail.com/track-your-item#/tracking-results/${trackingNumber}" style="color:#8C6A1E">${trackingNumber}</a></p>` : ''}
                </div>
                <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:14px;margin-bottom:24px">
                  <p style="margin:0;color:#7a5c00;font-size:12px"><strong>⚠ Research Use Only.</strong> All products are supplied strictly for in vitro laboratory research purposes only.</p>
                </div>
                <p style="color:#666;font-size:13px">Questions? Contact us at <a href="mailto:sales@belitesupplements.com" style="color:#8C6A1E">sales@belitesupplements.com</a></p>
              </div>
              <div style="background:#0E1116;padding:16px;text-align:center">
                <p style="color:#8A8A87;font-size:11px;margin:0">© 2026 Be Elite Supplements · belitesupplements.com</p>
              </div>
            </div>
          `,
        }),
      });
    }

    return res.status(200).json({
      success: true,
      orderIdentifier,
      trackingNumber,
      message: trackingNumber
        ? `Order dispatched — tracking: ${trackingNumber}`
        : 'Order created in Click & Drop — log in to print label.',
    });

  } catch (err) {
    console.error('Print label error:', err.message);
    return res.status(500).json({ error: 'Failed to create label', message: err.message });
  }
}
