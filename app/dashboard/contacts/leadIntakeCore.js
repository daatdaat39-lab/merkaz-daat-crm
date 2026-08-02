// לוגיקת ליבה משותפת ליצירת/עדכון ליד - בשימוש גם מטופס יצירת ליד ידני
// (actions.js) וגם מנקודת הקליטה האוטומטית של לידים חיצוניים
// (api/leads/intake) - כדי ששני הנתיבים יתנהגו זהה לגמרי (זיהוי כפילויות,
// פתיחה מחדש של ליד סגור, רישום היסטוריית פניות). קובץ רגיל בלי 'use
// server' כדי שיהיה ניתן לייבוא גם מ-Route Handler.
import { getPipeline } from '../components/pipelines';

// מחפש איש קשר קיים לפי ת"ז/טלפון/מייל (זיהוי כפילויות לפי האפיון) -
// שאילתות נפרדות ומפורמטות במקום .or() בנוי ממחרוזת, כי הערכים האלה
// עשויים להגיע מתוכן חיצוני לא-מהימן (מייל נכנס) ו-PostgREST מפרש
// פסיקים/סוגריים במחרוזת .or() כתחביר, לא כתווים מילוליים.
// כולל שדות נוספים (לא רק id/tags) כדי שקוד קורא (כמו ייבוא בכמות) יוכל
// לדעת אילו שדות כבר מלאים אצל ההתאמה הקיימת בלי שאילתה נוספת - ר'
// bulkImportContactRows למטה, שלעולם לא דורס שדה שכבר יש לו ערך.
export async function findExistingMatch(supabase, { idnum, phone, email }) {
  const filters = [];
  if (idnum) filters.push(['idnum', idnum]);
  if (phone) filters.push(['phone', phone]);
  if (email) filters.push(['email', email]);
  if (filters.length === 0) return null;

  const select = 'id, tags, phone, phone2, email, email2, idnum, birth_date, gender';
  const results = await Promise.all(
    filters.map(([column, value]) => supabase.from('contacts').select(select).eq(column, value).limit(1))
  );
  for (const { data } of results) {
    if (data?.[0]) return data[0];
  }
  return null;
}

// מוסיף איש קשר למחלקה נתונה (contact_departments) בלי לגעת בשיוך שלו
// לשאר המחלקות - אדם יכול להיות פעיל בכמה מחלקות בו-זמנית, כל אחת עם
// שלב משלה. כל קריאה (גם לשיוך קיים) רושמת "פנייה" חדשה בהיסטוריה -
// כדי שאם מישהו יוצר קשר שוב, זה יישמר ולא יידרס. אם השיוך הקיים כבר
// "סגור" - הפנייה החדשה פותחת אותו מחדש מהשלב הראשון של ה-pipeline;
// אחרת השלב הנוכחי נשאר, רק "טיפול אחרון" מתעדכן (כך שהליד קופץ לראש
// רשימת הלידים, ממוינת לפי last_activity_at).
// source (אופציונלי) - שם המערכת/ערוץ שממנו הגיעה הפנייה (למשל "קשר",
// "ייבוא אקסל - מרץ 2026") - נשמר בעמודת lead_inquiries.source הקיימת
// (מיגרציה 0010) שעד כה אף קוד לא כתב אליה. extraFields (אופציונלי) -
// שדות נוספים למחלקה (extra_fields jsonb) - תמיד ממוזגים כך שערך קיים
// אף פעם לא נדרס, רק מפתחות חדשים/חסרים מתווספים.
export async function upsertDepartmentMembership(supabase, contactId, workspace, reason, note, source, extraFields) {
  const { data: existingRow } = await supabase
    .from('contact_departments')
    .select('id, stage, extra_fields')
    .eq('contact_id', contactId)
    .eq('workspace_id', workspace.id)
    .single();

  let rowId;
  if (existingRow) {
    rowId = existingRow.id;
    const update = { last_activity_at: new Date().toISOString() };
    if (existingRow.stage === 'closed') {
      const pipeline = getPipeline(workspace.name);
      update.stage = pipeline.order[0];
      update.closed_reason = null;
    }
    if (extraFields) {
      update.extra_fields = { ...extraFields, ...(existingRow.extra_fields || {}) };
    }
    await supabase.from('contact_departments').update(update).eq('id', rowId);
  } else {
    const pipeline = getPipeline(workspace.name);
    const { data: created } = await supabase.from('contact_departments').insert({
      contact_id: contactId, workspace_id: workspace.id, stage: pipeline.order[0], last_activity_at: new Date().toISOString(),
      extra_fields: extraFields || {},
    }).select('id').single();
    rowId = created?.id;
  }

  if (rowId && reason) {
    await supabase.from('lead_inquiries').insert({ contact_department_id: rowId, reason, note: note || null, source: source || null });
  }
}

// שדות בסיס באנשי קשר שמותר להשלים (רק אם ריקים אצל ההתאמה הקיימת -
// לעולם לא לדרוס ערך שכבר קיים) בייבוא בכמות ממערכות חיצוניות
const FILLABLE_CONTACT_FIELDS = ['phone', 'phone2', 'email', 'email2', 'idnum', 'birth_date', 'gender'];

// מוסיף תנועת תרומה בודדת להיסטוריה (donation_transactions, מיגרציה
// 0031) - לא "תמונת מצב" יחידה אלא רשומה מצטברת, כדי שאפשר יהיה לשמור
// היסטוריה מלאה מכמה מקורות (מערכות הנהלת חשבונות שונות + בעתיד קשר
// חי). דדופ אמיתי לפי מספר מסמך (external_doc_number, אינדקס ייחודי) -
// אותה תנועה שמופיעה בשני קבצים/ייבואים לא נוצרת פעמיים. שורה בלי
// amount/date תקינים פשוט מדולגת (לא שגיאה) - השדה כולו אופציונלי.
async function insertDonationTransaction(supabase, contactId, workspaceId, sourceSystem, donationTransaction) {
  if (!donationTransaction) return null;
  const amount = Number(donationTransaction.amount);
  const date = (donationTransaction.date || '').toString().trim();
  if (!amount || !date) return null;

  const { data, error } = await supabase
    .from('donation_transactions')
    .upsert({
      contact_id: contactId,
      workspace_id: workspaceId,
      source_system: sourceSystem || null,
      external_doc_number: (donationTransaction.docNumber || '').toString().trim() || null,
      amount,
      transaction_date: date,
    }, { onConflict: 'external_doc_number', ignoreDuplicates: true })
    .select('id');
  if (error) return null;
  return (data?.length || 0) > 0; // true = נוספה תנועה חדשה, false = דולגה (כבר קיימת)
}

// ייבוא בכמות ממערכת חיצונית (למשל דוח אקסל ממערכת "קשר" למחלקת
// תרומות) - מיועד לשימוש גם מאשף הייבוא הידני וגם (בעתיד) מחיבור חי
// לאותה מערכת, ולכן חי כאן ולא ב-actions.js. עקרון-העל: שום נתיב כאן
// לעולם לא מוחק/דורס נתון קיים - רק יוצר כרטיס חדש, או מעשיר כרטיס קיים
// (משלים שדות ריקים בלבד + מוסיף רשומת פנייה חדשה להיסטוריה).
// sourceSystem/batchLabel מתויגים על כל רשומת lead_inquiries שנוצרת, כך
// שהמקור והתקופה של כל ייבוא נשארים גלויים לצמיתות בטאב "פעילות".
export async function bulkImportContactRows(supabase, { rows, workspaceId, workspace, sourceSystem, batchLabel }) {
  const ws = workspace || { id: workspaceId };
  const reason = (batchLabel || '').trim() || 'ייבוא';
  let created = 0;
  let enriched = 0;
  let transactionsAdded = 0;
  let transactionsSkipped = 0;

  function trackTransactionResult(added) {
    if (added === null) return;
    if (added) transactionsAdded++;
    else transactionsSkipped++;
  }

  for (const row of rows) {
    const first = (row.first || '').toString().trim();
    if (!first) continue; // בלי שם פרטי אין מספיק מידע ליצור/לשייך כרטיס

    const idnum = (row.idnum || '').toString().trim() || null;
    const phone = (row.phone || '').toString().trim() || null;
    const email = (row.email || '').toString().trim() || null;
    const rowTags = Array.isArray(row.tags)
      ? row.tags
      : (row.tags || '').toString().split(',').map((t) => t.trim()).filter(Boolean);

    const existing = await findExistingMatch(supabase, { idnum, phone, email });

    if (existing) {
      const fill = {};
      for (const field of FILLABLE_CONTACT_FIELDS) {
        const incoming = row[field];
        if (!existing[field] && incoming !== undefined && incoming !== null && String(incoming).trim() !== '') {
          fill[field] = incoming;
        }
      }
      if (rowTags.length > 0) {
        fill.tags = Array.from(new Set([...(existing.tags || []), ...rowTags]));
      }
      if (Object.keys(fill).length > 0) {
        await supabase.from('contacts').update(fill).eq('id', existing.id);
      }
      await upsertDepartmentMembership(supabase, existing.id, ws, reason, null, sourceSystem, row.extraFields);
      trackTransactionResult(await insertDonationTransaction(supabase, existing.id, ws.id, sourceSystem, row.donationTransaction));
      enriched++;
      continue;
    }

    const { data: createdContact } = await supabase.from('contacts').insert({
      first,
      last: (row.last || '').toString().trim(), // contacts.last היא NOT NULL
      phone, idnum, email,
      phone2: (row.phone2 || '').toString().trim() || null,
      email2: (row.email2 || '').toString().trim() || null,
      birth_date: (row.birth_date || '').toString().trim() || null,
      gender: (row.gender || '').toString().trim() || null,
      source: sourceSystem || 'ייבוא אקסל',
      tags: rowTags,
    }).select('id').single();
    if (createdContact) {
      await upsertDepartmentMembership(supabase, createdContact.id, ws, reason, null, sourceSystem, row.extraFields);
      trackTransactionResult(await insertDonationTransaction(supabase, createdContact.id, ws.id, sourceSystem, row.donationTransaction));
      created++;
    }
  }

  return { success: true, created, enriched, transactionsAdded, transactionsSkipped, count: created + enriched };
}
