// api/affiliate-bank-details.js
// Self-service bank details for affiliates — authenticated via their own code+password
// (no admin key needed, matches the auth pattern already used for affiliate login).
import { createClient } from '@supabase/supabase-js';

function mask(str, keep = 4) {
  if (!str) return '';
  const s = String(str);
  if (s.length <= keep) return s;
  return '•'.repeat(s.length - keep) + s.slice(-keep);
}

async function authenticate(supabase, code, password) {
  if (!code || !password) return null;
  const { data, error } = await supabase
    .from('affiliates')
    .select('id, code, password, status')
    .eq('code', code.toUpperCase())
    .eq('status', 'active')
    .single();
  if (error || !data) return null;
  if (data.password !== password) return null;
  return data;
}

export default async function handler(req, res) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // GET — fetch current (masked) bank details for the logged-in affiliate
  // GET /api/affiliate-bank-details?code=JAMES10&password=james123
  if (req.method === 'GET') {
    const { code, password } = req.query;
    const aff = await authenticate(supabase, code, password);
    if (!aff) return res.status(401).json({ error: 'Unauthorised' });

    const { data, error } = await supabase
      .from('affiliates')
      .select('bank_account_name, bank_sort_code, bank_account_number, bank_updated_at')
      .eq('id', aff.id)
      .single();
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({
      has_bank_details: !!(data.bank_account_number && data.bank_sort_code),
      bank_account_name: data.bank_account_name || '',
      bank_sort_code: mask(data.bank_sort_code, 2),
      bank_account_number: mask(data.bank_account_number, 4),
      bank_updated_at: data.bank_updated_at,
    });
  }

  // POST — save/update bank details for the logged-in affiliate
  // POST { code, password, bank_account_name, bank_sort_code, bank_account_number }
  if (req.method === 'POST') {
    const { code, password, bank_account_name, bank_sort_code, bank_account_number } = req.body || {};
    const aff = await authenticate(supabase, code, password);
    if (!aff) return res.status(401).json({ error: 'Unauthorised' });

    const name = (bank_account_name || '').trim();
    const sortCode = (bank_sort_code || '').replace(/[^0-9]/g, '');
    const accountNumber = (bank_account_number || '').replace(/[^0-9]/g, '');

    if (!name) return res.status(400).json({ error: 'Account holder name is required' });
    if (sortCode.length !== 6) return res.status(400).json({ error: 'Sort code must be 6 digits' });
    if (accountNumber.length !== 8) return res.status(400).json({ error: 'Account number must be 8 digits' });

    const { error } = await supabase
      .from('affiliates')
      .update({
        bank_account_name: name,
        bank_sort_code: sortCode,
        bank_account_number: accountNumber,
        bank_updated_at: new Date().toISOString(),
      })
      .eq('id', aff.id);
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
