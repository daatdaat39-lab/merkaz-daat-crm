import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const admin = createClient(url, key);

const { data: workspaces, error: wsError } = await admin
  .from('workspaces')
  .select('id, name')
  .order('created_at', { ascending: true });
if (wsError) { console.error('workspaces query failed:', wsError.message); process.exit(1); }
console.log('workspaces:', workspaces);

const { data: profiles, error: profError } = await admin.from('profiles').select('id, name');
if (profError) { console.error('profiles query failed:', profError.message); process.exit(1); }
console.log(`profiles count: ${profiles.length}`);

const { data: memberships, error: memError } = await admin
  .from('workspace_members')
  .select('workspace_id, user_id, role');
if (memError) { console.error('memberships query failed:', memError.message); process.exit(1); }
console.log(`memberships count: ${memberships.length}`);

const { data: usersList, error: usersError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (usersError) { console.error('listUsers failed:', usersError.message); process.exit(1); }
const emailsById = Object.fromEntries(usersList.users.map((u) => [u.id, u.email]));

const membershipMap = {};
memberships.forEach((m) => {
  membershipMap[m.user_id] = membershipMap[m.user_id] || {};
  membershipMap[m.user_id][m.workspace_id] = m.role;
});

const allUsers = profiles
  .filter((p) => emailsById[p.id])
  .map((p) => ({
    id: p.id,
    name: p.name || 'משתמש',
    email: emailsById[p.id] || '',
    memberships: membershipMap[p.id] || {},
  }));

console.log('\nAssembled table (user -> {workspaceId: role}):');
for (const u of allUsers) {
  const roleByWsName = {};
  for (const w of workspaces) {
    if (u.memberships[w.id]) roleByWsName[w.name] = u.memberships[w.id];
  }
  console.log(`- ${u.name} <${u.email}>:`, roleByWsName);
}

console.log('\nOwner-anywhere check example (first user):');
if (allUsers[0]) {
  const isOwner = Object.values(allUsers[0].memberships).includes('owner');
  console.log(`${allUsers[0].name}: isOwnerAnywhere=${isOwner}`);
}
