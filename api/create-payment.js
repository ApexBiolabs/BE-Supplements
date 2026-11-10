// api/create-payment.js
// Fena Toolkit API - create and process single payment
// Base URL from Fena support: https://epos.api.prod-gcp.fena.co
// Docs: https://toolkit-docs.fena.co/toolkit-api/payments-module/single-payments/api-requests

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      amount, orderRef, customerName, customerEmail,
      items, affiliateCode, penAdded, shippingMethod,
      addr1, addr2, city, county, postcode, phone,
    } = req.body;

    if (!amount || !orderRef || !customerEmail) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (affiliateCode) {
      const alreadyUsed = await checkCodeAlreadyUsed(affiliateCode, customerEmail);
      if (alreadyUsed) {
        return res.status(400).json({ error: 'This discount code has already been used on a previous order.' });
      }
    }

    const terminalId = process.env.FENA_TERMINAL_ID;
    const terminalSecret = process.env.FENA_SECRET;
    const bankAccountId = process.env.FENA_BANK_ACCOUNT_ID;

    if (!terminalId || !terminalSecret) {
      console.error('Missing FENA env vars');
      return res.status(500).json({ error: 'Payment provider not configured' });
    }

    // Reference: max 12 chars, only lowercase a-z, 0-9, hyphens
    const reference = orderRef.toLowerCase().replace(/[^a-z0-9-]/g, '').substring(0, 12);

    // Due date: 24 hours from now
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const payload = {
      reference,
      amount: parseFloat(amount).toFixed(2),
      customerName: customerName || '',
      customerEmail: customerEmail,
      paymentMethod: 'fena_ob',
      description: `Be Elite Supplements - ${orderRef}`,
      dueDate,
    };

    // Only add bankAccount if we have an ID
    if (bankAccountId) {
      payload.bankAccount = bankAccountId;
    }

    console.log('Using terminal-id:', terminalId);
    console.log('Sending to Fena:', JSON.stringify(payload));

    const paymentRes = await fetch('https://epos.api.prod-gcp.fena.co/open/payments/single/create-and-process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'terminal-id': terminalId,
        'terminal-secret': terminalSecret,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await paymentRes.text();
    console.log('Fena response status:', paymentRes.status);
    console.log('Fena response:', responseText);

    if (!paymentRes.ok) {
      console.error('Fena error:', responseText);
      return res.status(502).json({ error: 'Failed to create payment', details: responseText });
    }

    const data = JSON.parse(responseText);

    // Payment link is in result.paymentLink
    const paymentUrl = data?.result?.link || data?.result?.paymentLink || data?.paymentLink;

    if (!paymentUrl) {
      console.error('No payment link in response:', JSON.stringify(data));
      return res.status(502).json({ error: 'No payment link returned', data });
    }

    console.log('Payment created:', orderRef, '-> link:', paymentUrl);

    // Save pending order to Supabase
    await savePendingOrder({
      orderRef, customerName, customerEmail,
      amount: parseFloat(amount), items,
      affiliateCode, penAdded, shippingMethod,
      fenaPaymentId: data?.result?.id,
      addr1, addr2, city, county, postcode, phone,
    });

    return res.status(200).json({ paymentUrl, paymentId: data?.result?.id });

  } catch (error) {
    console.error('Create payment error:', error.message);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

async function checkCodeAlreadyUsed(code, email) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data } = await supabase
      .from('orders')
      .select('id')
      .eq('affiliate_code', code.toUpperCase())
      .ilike('customer_email', email)
      .in('status', ['paid', 'dispatched'])
      .limit(1);
    return !!(data && data.length > 0);
  } catch (err) {
    console.error('Code reuse check error:', err.message);
    return false; // fail open — never block a legitimate order because this check itself failed
  }
}

async function savePendingOrder(order) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const itemsStr = Array.isArray(order.items) ? order.items.join(', ') : (order.items || '');
    const { error } = await supabase.from('orders').insert([{
      ref: order.orderRef,
      customer_name: order.customerName,
      customer_email: order.customerEmail,
      amount: order.amount,
      items: itemsStr,
      affiliate_code: order.affiliateCode || null,
      pen_added: false,
      shipping_method: order.shippingMethod || 'standard',
      fena_payment_id: order.fenaPaymentId || null,
      address_line1: order.addr1 || null,
      address_line2: order.addr2 || null,
      city: order.city || null,
      county: order.county || null,
      postcode: order.postcode || null,
      phone: order.phone || null,
      status: 'pending',
    }]);
    if (error) console.error('Supabase insert error:', JSON.stringify(error));
    console.log('Order saved:', order.orderRef);
  } catch (err) {
    console.error('Supabase save error:', err.message);
  }
}
