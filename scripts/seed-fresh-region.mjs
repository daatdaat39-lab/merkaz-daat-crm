// סקריפט חד-פעמי: ממלא פרויקט Supabase טרי (אחרי הרצת fresh-region-schema.sql)
// במשתמשי בדיקה ואנשי קשר לדוגמה לכל מחלקה, כדי שיהיה עם מה להמשיך לבנות/לבדוק.
// הרצה: node --env-file=.env.local scripts/seed-fresh-region.mjs
// (אם --env-file לא נתמך בגרסת ה-Node שלך, פשוט ערוך את .env.local עם הפרטים
// של הפרויקט החדש לפני ההרצה - הסקריפט טוען אותו ידנית ממילא כגיבוי)

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// טעינה ידנית של .env.local (בלי תלות בחבילת dotenv) - רק אם המשתנה עוד לא מוגדר
try {
  const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  for (const line of envText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
} catch {
  // אם אין .env.local, מסתמכים על משתני סביבה שכבר הוגדרו בסביבת ההרצה
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('חסר NEXT_PUBLIC_SUPABASE_URL או SUPABASE_SERVICE_ROLE_KEY - ודא ש-.env.local מצביע כבר על הפרויקט החדש.');
  process.exit(1);
}
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const TEST_PASSWORD = 'TestPass123!';

const PIPELINES = {
  'דעת למדני': { order: ['new_lead', 'open', 'meeting', 'registering', 'registered', 'started', 'graduate'], reasons: ['התעניינות ברישום לקורס', 'שאלה על תוכן הלימודים', 'שאלה על מחיר/תשלום', 'שאלה על מלגה'] },
  'דעת ותבונה': { order: ['new_lead', 'open', 'meeting', 'registering', 'registered', 'active_student', 'graduate'], reasons: ['התעניינות ברישום ללימודים', 'שאלה על תוכן הלימודים', 'שאלה על מחיר/תשלום'] },
  'תרומות': { order: ['potential', 'no_contact_yet', 'contacted', 'call', 'offer', 'committed', 'donated', 'active_donor'], reasons: ['רצון לתרום', 'שאלה על אופן התרומה', 'בקשת מידע על הארגון'] },
};
const CLOSE_REASONS = ['לא מעוניין', 'גיל לא מתאים', 'אין מענה'];
const FIRST_NAMES = ['נועה', 'איתמר', 'שירה', 'דניאל', 'מיכל', 'יהונתן', 'טליה', 'אורי', 'הדר', 'רועי'];
const LAST_NAMES = ['כהן', 'לוי', 'מזרחי', 'פרץ', 'ברק', 'גולן', 'אברהם', 'שלום'];

function pick(arr, i) { return arr[i % arr.length]; }

async function upsertTestUser({ email, name, workspaceId, role, isSuperOwner }) {
  let userId;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, password: TEST_PASSWORD, email_confirm: true, user_metadata: { name },
  });
  if (created?.user) {
    userId = created.user.id;
  } else {
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existing = list?.users?.find((u) => u.email === email);
    if (!existing) throw new Error(`יצירת משתמש נכשלה עבור ${email}: ${createError?.message}`);
    userId = existing.id;
  }

  await admin.from('profiles').upsert({ id: userId, name, current_workspace_id: workspaceId }, { onConflict: 'id' });

  if (isSuperOwner) {
    const { data: allWs } = await admin.from('workspaces').select('id');
    for (const ws of allWs || []) {
      await admin.from('workspace_members').upsert({ workspace_id: ws.id, user_id: userId, role: 'owner' }, { onConflict: 'workspace_id,user_id' });
    }
  } else {
    await admin.from('workspace_members').upsert({ workspace_id: workspaceId, user_id: userId, role }, { onConflict: 'workspace_id,user_id' });
  }

  return userId;
}

async function main() {
  console.log('מנקה נתוני דמו ישנים (אם יש)...');
  await admin.from('contacts').delete().like('email', 'demo-lead-%@example.com');

  const { data: workspaces, error: wsError } = await admin.from('workspaces').select('id, name');
  if (wsError) throw wsError;
  const wsByName = Object.fromEntries((workspaces || []).map((w) => [w.name, w.id]));
  const requiredNames = ['מרכז דעת — ראשי', 'דעת למדני', 'דעת ותבונה', 'תרומות'];
  for (const n of requiredNames) {
    if (!wsByName[n]) throw new Error(`workspace "${n}" לא נמצא - ודא ש-fresh-region-schema.sql רץ בהצלחה קודם.`);
  }

  console.log('יוצר משתמשי בדיקה...');
  const credentials = [];

  const superOwnerId = await upsertTestUser({ email: 'owner@test.local', name: 'דנה הבעלים (כל המחלקות)', workspaceId: wsByName['מרכז דעת — ראשי'], isSuperOwner: true });
  credentials.push(['owner@test.local', 'בעלים בכל 4 המחלקות']);

  const deptUsers = {}; // dept name -> { admin: userId, member: userId }
  for (const [deptName, slug] of [['מרכז דעת — ראשי', 'main'], ['דעת למדני', 'lamdani'], ['דעת ותבונה', 'tvuna'], ['תרומות', 'trumot']]) {
    const adminEmail = `${slug}-admin@test.local`;
    const memberEmail = `${slug}-member@test.local`;
    const adminId = await upsertTestUser({ email: adminEmail, name: `מנהל ${deptName}`, workspaceId: wsByName[deptName], role: 'admin' });
    const memberId = await upsertTestUser({ email: memberEmail, name: `נציג ${deptName}`, workspaceId: wsByName[deptName], role: 'member' });
    deptUsers[deptName] = { admin: adminId, member: memberId };
    credentials.push([adminEmail, `מנהל ב-${deptName}`]);
    credentials.push([memberEmail, `נציג ב-${deptName}`]);
  }

  console.log('יוצר אנשי קשר לדוגמה לכל מחלקה ולכל שלב...');
  let contactIndex = 0;
  for (const [deptName, pipeline] of Object.entries(PIPELINES)) {
    const stages = [...pipeline.order, 'closed'];
    for (const stage of stages) {
      const first = pick(FIRST_NAMES, contactIndex);
      const last = pick(LAST_NAMES, contactIndex + 3);
      const phone = `050-${(1000000 + contactIndex).toString().slice(-7)}`;
      const email = `demo-${deptName === 'תרומות' ? 'trumot' : deptName === 'דעת ותבונה' ? 'tvuna' : 'lamdani'}-${stage}@test.local`;

      const { data: contact, error: contactError } = await admin
        .from('contacts')
        .insert({ first, last, phone, email, source: 'נתוני בדיקה', tags: ['בדיקה'] })
        .select('id')
        .single();
      if (contactError) throw contactError;

      const closedReason = stage === 'closed' ? pick(CLOSE_REASONS, contactIndex) : null;
      const agentId = contactIndex % 2 === 0 ? deptUsers[deptName].member : deptUsers[deptName].admin;

      const { data: deptRow, error: deptRowError } = await admin
        .from('contact_departments')
        .insert({
          contact_id: contact.id, workspace_id: wsByName[deptName], stage, closed_reason: closedReason,
          agent_id: agentId, last_activity_at: new Date(Date.now() - contactIndex * 3600000).toISOString(),
        })
        .select('id')
        .single();
      if (deptRowError) throw deptRowError;

      await admin.from('lead_inquiries').insert({
        contact_department_id: deptRow.id, reason: pick(pipeline.reasons, contactIndex), note: 'נוצר אוטומטית לצורך בדיקות',
      });

      contactIndex++;
    }
  }

  console.log(`\nהושלם: ${contactIndex} אנשי קשר לדוגמה, ${credentials.length} משתמשי בדיקה.\n`);
  console.log('פרטי התחברות (סיסמה זהה לכולם):');
  console.log(`סיסמה: ${TEST_PASSWORD}\n`);
  for (const [email, desc] of credentials) console.log(`  ${email}  —  ${desc}`);
}

main().catch((err) => { console.error('שגיאה:', err.message || err); process.exit(1); });
