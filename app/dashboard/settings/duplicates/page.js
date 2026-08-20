import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfAnyWorkspace } from '../../lib/contactGuards';
import { findDuplicateCandidates, detectCoupleCandidates } from '../../lib/findDuplicates';
import DuplicateQueueClient from './DuplicateQueueClient';
import CoupleCandidatesSection from './CoupleCandidatesSection';

// תור בדיקת כפליות - סורק את כל אנשי הקשר במערכת (לא רק מחלקה אחת),
// מאתר זוגות עם ת"ז/טלפון/מייל זהים או שם דומה מאוד (ר' findDuplicates.js),
// ומאפשר לעבור עליהם זוג-זוג ולמזג (משתמש שוב ב-MergeFieldsPicker/
// mergeContacts הקיימים) או לסמן "לא כפילות".
export default async function DuplicatesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const allowed = await isManagerOfAnyWorkspace(supabase, user.id);
  if (!allowed) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 24px' }}>
        <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
        <div style={{ marginTop: 20, background: 'var(--amber-bg, #fffbeb)', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', fontSize: 12.5, color: '#92400e' }}>
          רק owner או admin יכולים לגשת לבדיקת כפליות.
        </div>
      </div>
    );
  }

  // שולפים את כל אנשי הקשר בדפים של 1000 (מגבלת ברירת המחדל של
  // PostgREST) - אחרת בכמויות גדולות (אלפי אנשי קשר) הסריקה הייתה
  // מכסה רק את ה-1000 הראשונים לפי סדר שאילתה לא-מוגדר.
  const contactsSelect = 'id, first, last, phone, phone2, email, email2, idnum, source, dept, tags, notes, frozen, created_at, contact_departments (stage, workspaces:workspace_id (name))';
  async function fetchAllContactRows() {
    const pageSize = 1000;
    let page = 0;
    let all = [];
    while (true) {
      const { data: pageData } = await supabase.from('contacts').select(contactsSelect).range(page * pageSize, page * pageSize + pageSize - 1);
      if (!pageData || pageData.length === 0) break;
      all = all.concat(pageData);
      if (pageData.length < pageSize) break;
      page++;
    }
    return all;
  }

  const [contactRows, { data: dismissedPairs }, { data: namePairs, error: namePairsError }, { data: exactTokenPairs }, { data: dismissedCoupleRows }] = await Promise.all([
    fetchAllContactRows(),
    supabase.from('dismissed_duplicate_pairs').select('contact_id_a, contact_id_b'),
    // דמיון-שמות מחושב ב-DB (מיגרציה 0066/0068, אינדקס טריגרם) - לא בקוד -
    // כדי שזה יישאר סקיילבילי בכל כמות אנשי קשר, לא רק מתחת לסף קבוע.
    supabase.rpc('find_similar_contact_name_pairs'),
    // אותם רכיבי שם, סדר שונה - מדויק, לא מטושטש (מיגרציה 0067).
    supabase.rpc('find_same_tokens_contact_pairs'),
    supabase.from('dismissed_couple_candidates').select('contact_id'),
  ]);
  // בדיקת שגיאה מפורשת - קרה בפועל (0066 לא ניצל את אינדקס ה-GIN, נפל
  // ב-timeout על כמות גדולה) והוחזר בשקט כ"0 תוצאות" בלי שום סימן -
  // עדיף אזהרה גלויה על "אין כפילויות" שקרי.
  if (namePairsError) console.error('find_similar_contact_name_pairs RPC failed:', namePairsError);

  const contacts = (contactRows || []).map((c) => ({
    ...c,
    departments: (c.contact_departments || []).map((d) => ({ stage: d.stage, workspaceName: d.workspaces?.name || 'מחלקה' })),
  }));

  const { candidates } = findDuplicateCandidates(contacts, dismissedPairs || [], namePairs || [], exactTokenPairs || []);
  const coupleCandidates = detectCoupleCandidates(contacts, new Set((dismissedCoupleRows || []).map((r) => r.contact_id)));

  // כמה תרומות/התחייבויות יש לכל צד בכל זוג - כדי שהמנהל יראה *לפני*
  // שהוא לוחץ "מיזוג" אם יש נתונים כספיים בסיכון (בדיוק כמו שקרה בפועל
  // עם "מוריס מנחם" הלילה - כרטיס שנראה ריק אבל החביא תרומה אמיתית).
  // נשלף רק לאנשי הקשר שבתור (לא לכל 2,840) - קבוצה קטנה וזולה.
  const candidateIds = new Set();
  for (const c of candidates) { candidateIds.add(c.contactA.id); candidateIds.add(c.contactB.id); }
  const idsArray = Array.from(candidateIds);
  const [{ data: txnRows }, { data: commitmentRows }] = idsArray.length > 0
    ? await Promise.all([
        supabase.from('donation_transactions').select('contact_id').in('contact_id', idsArray),
        supabase.from('commitments').select('contact_id').in('contact_id', idsArray),
      ])
    : [{ data: [] }, { data: [] }];
  const txnCounts = new Map();
  for (const r of txnRows || []) txnCounts.set(r.contact_id, (txnCounts.get(r.contact_id) || 0) + 1);
  const commitmentCounts = new Map();
  for (const r of commitmentRows || []) commitmentCounts.set(r.contact_id, (commitmentCounts.get(r.contact_id) || 0) + 1);
  function withMoneyCounts(contact) {
    return { ...contact, transactionsCount: txnCounts.get(contact.id) || 0, commitmentsCount: commitmentCounts.get(contact.id) || 0 };
  }
  const candidatesWithCounts = candidates.map((c) => ({ ...c, contactA: withMoneyCounts(c.contactA), contactB: withMoneyCounts(c.contactB) }));

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>
      <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
      <h1 style={{ fontFamily: 'var(--font-heading)', margin: '14px 0 6px', fontSize: 20 }}>בדיקת כפליות</h1>
      <p style={{ margin: '0 0 4px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
        סריקה של כל אנשי הקשר במערכת — זוגות עם ת"ז/טלפון/מייל זהים, או שם דומה מאוד. עברו זוג-זוג ומזגו, או סמנו "לא כפילות".
      </p>
      {namePairsError && (
        <div style={{ margin: '10px 0', background: 'var(--amber-bg, #fffbeb)', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, color: '#92400e' }}>
          ⚠ בדיקת "שם דומה" נכשלה זמנית (שגיאת שרת) - התור למטה מציג רק התאמות מדויקות (ת"ז/טלפון/מייל/אותם רכיבי שם). רעננו את העמוד כדי לנסות שוב.
        </div>
      )}
      <CoupleCandidatesSection initialCandidates={coupleCandidates} />
      <DuplicateQueueClient initialCandidates={candidatesWithCounts} />
    </div>
  );
}
