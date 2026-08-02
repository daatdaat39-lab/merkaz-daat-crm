import { createClient } from '@supabase/supabase-js';
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check(label, fn) {
  try {
    const { error } = await fn();
    console.log(error ? `❌ ${label}: חסר (${error.message})` : `✅ ${label}`);
  } catch (e) {
    console.log(`❌ ${label}: שגיאה (${e.message})`);
  }
}

console.log('--- 0030 ---');
await check('dismissed_duplicate_pairs', () => admin.from('dismissed_duplicate_pairs').select('id').limit(1));

console.log('--- 0031 ---');
await check('donation_transactions', () => admin.from('donation_transactions').select('id').limit(1));

console.log('--- 0032 ---');
await check('contact_departments.approval_status', () => admin.from('contact_departments').select('approval_status').limit(1));
await check('campaigns', () => admin.from('campaigns').select('id').limit(1));
await check('campaign_contacts', () => admin.from('campaign_contacts').select('id').limit(1));
await check('contact_call_history', () => admin.from('contact_call_history').select('id').limit(1));
await check('calendar_dedications', () => admin.from('calendar_dedications').select('id').limit(1));
