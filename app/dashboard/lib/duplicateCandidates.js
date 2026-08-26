// עוטף-DB סביב findDuplicates.js (שנשאר טהור/בלי קריאות DB לפי ההערה
// בראשו) - שולף אנשי קשר+זוגות-מועמדים+ספירת-כסף פעם אחת, כדי שגם
// עמוד "בדיקת כפליות" (settings/duplicates/page.js) וגם פעולות
// מיזוג-בכמות (contacts/actions.js) יראו בדיוק את אותה קבוצת מועמדים -
// בלי סטייה בין השניים.
import { findDuplicateCandidates } from './findDuplicates';

export async function loadDuplicateCandidatesWithMoneyCounts(supabase) {
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

  async function fetchAllExternalIds() {
    const pageSize = 1000; let from = 0; let all = [];
    while (true) {
      const { data } = await supabase.from('contact_external_ids').select('contact_id, source_system, external_id').range(from, from + pageSize - 1);
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return all;
  }

  const [contactRows, { data: dismissedPairs }, { data: namePairs, error: namePairsError }, { data: exactTokenPairs }, externalIdRows] = await Promise.all([
    fetchAllContactRows(),
    supabase.from('dismissed_duplicate_pairs').select('contact_id_a, contact_id_b'),
    // דמיון-שמות מחושב ב-DB (מיגרציה 0066/0068, אינדקס טריגרם) - לא בקוד -
    // כדי שזה יישאר סקיילבילי בכל כמות אנשי קשר, לא רק מתחת לסף קבוע.
    supabase.rpc('find_similar_contact_name_pairs'),
    // אותם רכיבי שם, סדר שונה - מדויק, לא מטושטש (מיגרציה 0067).
    supabase.rpc('find_same_tokens_contact_pairs'),
    fetchAllExternalIds(),
  ]);
  // בדיקת שגיאה מפורשת - קרה בפועל (0066 לא ניצל את אינדקס ה-GIN, נפל
  // ב-timeout על כמות גדולה) והוחזר בשקט כ"0 תוצאות" בלי שום סימן -
  // עדיף אזהרה גלויה על "אין כפילויות" שקרי.
  if (namePairsError) console.error('find_similar_contact_name_pairs RPC failed:', namePairsError);

  const contacts = (contactRows || []).map((c) => ({
    ...c,
    departments: (c.contact_departments || []).map((d) => ({ stage: d.stage, workspaceName: d.workspaces?.name || 'מחלקה' })),
  }));

  // אותו (source_system, external_id) על 2+ contact_id שונים - כמעט
  // תמיד כפילות ודאית (ר' הערה ב-findDuplicates.js). מחושב כאן (לא ב-DB)
  // כי זו טבלה קטנה יחסית ולוגיקת-קיבוץ פשוטה, לא דורשת RPC ייעודי.
  const byExternalId = new Map();
  for (const r of externalIdRows || []) {
    const key = `${r.source_system}::${r.external_id}`;
    if (!byExternalId.has(key)) byExternalId.set(key, new Set());
    byExternalId.get(key).add(r.contact_id);
  }
  const externalIdPairs = [];
  for (const ids of byExternalId.values()) {
    if (ids.size < 2) continue;
    const arr = Array.from(ids);
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) externalIdPairs.push({ id_a: arr[i], id_b: arr[j] });
    }
  }

  const { candidates } = findDuplicateCandidates(contacts, dismissedPairs || [], namePairs || [], exactTokenPairs || [], externalIdPairs);

  // כמה תרומות/התחייבויות יש לכל צד בכל זוג - כדי שהמנהל יראה *לפני*
  // שהוא לוחץ "מיזוג" אם יש נתונים כספיים בסיכון (בדיוק כמו שקרה בפועל
  // עם "מוריס מנחם" - כרטיס שנראה ריק אבל החביא תרומה אמיתית).
  // נשלף רק לאנשי הקשר שבתור (לא לכל אנשי הקשר) - קבוצה קטנה וזולה.
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

  return { candidatesWithCounts, namePairsError };
}
