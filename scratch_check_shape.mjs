import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data } = await supabase.from('contact_departments').select('contact_id, extra_fields, workspaces:workspace_id!inner (name)').eq('workspaces.name', 'ישיבת דעת').limit(10);
console.log(JSON.stringify(data, null, 2));
