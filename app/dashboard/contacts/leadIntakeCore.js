// לוגיקת ליבה משותפת ליצירת/עדכון ליד - בשימוש גם מטופס יצירת ליד ידני
// (actions.js) וגם מנקודת הקליטה האוטומטית של לידים חיצוניים
// (api/leads/intake) - כדי ששני הנתיבים יתנהגו זהה לגמרי (זיהוי כפילויות,
// פתיחה מחדש של ליד סגור, רישום היסטוריית פניות). קובץ רגיל בלי 'use
// server' כדי שיהיה ניתן לייבוא גם מ-Route Handler.
import { getPipeline } from '../lib/pipelines';

// מחפש איש קשר קיים לפי ת"ז/טלפון/מייל (זיהוי כפילויות לפי האפיון) -
// שאילתות נפרדות ומפורמטות במקום .or() בנוי ממחרוזת, כי הערכים האלה
// עשויים להגיע מתוכן חיצוני לא-מהימן (מייל נכנס) ו-PostgREST מפרש
// פסיקים/סוגריים במחרוזת .or() כתחביר, לא כתווים מילוליים.
// כולל שדות נוספים (לא רק id/tags) כדי שקוד קורא (כמו ייבוא בכמות) יוכל
// לדעת אילו שדות כבר מלאים אצל ההתאמה הקיימת בלי שאילתה נוספת - ר'
// bulkImportContactRows למטה, שלעולם לא דורס שדה שכבר יש לו ערך.
// sourceSystem+externalId (אופציונלי) - אם סופקו, נבדקים ראשונים דרך
// טבלת contact_external_ids (מיגרציה 0033): מזהה מוכר ממערכת חיצונית הוא
// ההתאמה הכי אמינה שיש (יותר מטלפון/מייל/ת"ז, שיכולים להשתנות).
export async function findExistingMatch(supabase, { idnum, phone, email, sourceSystem, externalId }) {
  const select = 'id, tags, phone, phone2, email, email2, idnum, birth_date, gender';

  if (sourceSystem && externalId) {
    const { data: mapping } = await supabase
      .from('contact_external_ids')
      .select('contact_id')
      .eq('source_system', sourceSystem)
      .eq('external_id', externalId)
      .maybeSingle();
    if (mapping?.contact_id) {
      const { data: byExternalId } = await supabase.from('contacts').select(select).eq('id', mapping.contact_id).limit(1);
      if (byExternalId?.[0]) return byExternalId[0];
    }
  }

  const filters = [];
  if (idnum) filters.push(['idnum', idnum]);
  if (phone) filters.push(['phone', phone]);
  if (email) filters.push(['email', email]);
  if (filters.length === 0) return null;

  const results = await Promise.all(
    filters.map(([column, value]) => supabase.from('contacts').select(select).eq(column, value).limit(1))
  );
  for (const { data } of results) {
    if (data?.[0]) return data[0];
  }
  return null;
}

// שומר/מעדכן את המזהה של איש הקשר במערכת חיצונית ספציפית
// (contact_external_ids, מיגרציה 0033). ignoreDuplicates:true בכוונה -
// אם אותו מזהה חיצוני כבר קיים ומצביע לכרטיס אחר, לא דורסים אותו בשקט
// (זה בדיוק סימן לכפילות שדורשת בדיקה ידנית, לא ממוזג אוטומטית).
export async function upsertContactExternalId(supabase, contactId, sourceSystem, externalId) {
  const source = (sourceSystem || '').toString().trim();
  const extId = (externalId || '').toString().trim();
  if (!source || !extId) return;
  await supabase
    .from('contact_external_ids')
    .upsert({ contact_id: contactId, source_system: source, external_id: extId }, { onConflict: 'source_system,external_id', ignoreDuplicates: true });
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
export async function upsertDepartmentMembership(supabase, contactId, workspace, reason, note, source, extraFields, options = {}) {
  const { data: existingRow } = await supabase
    .from('contact_departments')
    .select('id, stage, extra_fields')
    .eq('contact_id', contactId)
    .eq('workspace_id', workspace.id)
    .single();

  let rowId;
  let extraConflictCount = 0;
  if (existingRow) {
    rowId = existingRow.id;
    const update = { last_activity_at: new Date().toISOString() };
    if (existingRow.stage === 'closed') {
      const pipeline = await getPipeline(supabase, workspace.name);
      update.stage = pipeline.order[0];
      update.closed_reason = null;
    }
    if (extraFields) {
      const existingExtra = existingRow.extra_fields || {};
      update.extra_fields = { ...extraFields, ...existingExtra };
      // ייבוא בכמות בלבד (recordConflicts): ערך חדש שמתנגש עם ערך קיים
      // לא נדרס בשקט (ר' מיזוג למעלה - הקיים תמיד מנצח) - הוא נשמר לתור
      // בדיקה ידנית (import_conflicts) כדי שאף נתון מהקובץ לא "ייעלם".
      if (options.recordConflicts) {
        const conflictRows = [];
        for (const [key, incoming] of Object.entries(extraFields)) {
          const incomingStr = String(incoming ?? '').trim();
          if (!incomingStr) continue;
          const existingVal = existingExtra[key];
          const existingStr = existingVal === undefined || existingVal === null ? '' : String(existingVal).trim();
          if (existingStr && existingStr !== incomingStr) {
            conflictRows.push({
              contact_id: contactId, workspace_id: workspace.id, field_key: `extra:${key}`, field_label: key,
              existing_value: existingStr, new_value: incomingStr,
              source_system: options.sourceSystem || null, batch_label: options.batchLabel || null,
            });
          }
        }
        if (conflictRows.length > 0) {
          // .select() כדי לדעת את ה-id של כל קונפליקט שנוצר - נדרש רק
          // לשדות "רב-ערכיים" (options.multiValueFieldDefs), כדי שאפשר
          // יהיה אחר כך (עדיין בתוך אשף הייבוא) להעביר בדיוק את
          // הקונפליקטים האלה לעמודה כפולה חדשה, לא את כולם.
          const { data: insertedConflicts } = await supabase.from('import_conflicts').insert(conflictRows).select('id, field_key');
          extraConflictCount = conflictRows.length;
          if (options.multiValueTracker && options.multiValueFieldDefs) {
            for (const row of insertedConflicts || []) {
              const key = row.field_key.slice(6);
              const label = options.multiValueFieldDefs.get(key);
              if (label) options.multiValueTracker.push({ id: row.id, fieldKey: key, label });
            }
          }
        }
      }
    }
    await supabase.from('contact_departments').update(update).eq('id', rowId);
  } else {
    const pipeline = await getPipeline(supabase, workspace.name);
    // שיוך חדש בלבד יכול להיווצר כ"ממתין לאישור מנהל" - שיוך קיים לעולם
    // לא חוזר להמתנה (הוא כבר אושר פעם אחת ומטופל). options.stage - שלב
    // מפורש (למשל סטטוס שמופה בזמן ייבוא, או שלב שנקבע מסנכרון קשר) -
    // גובר על שלב ברירת המחדל, אבל רק ביצירת שיוך חדש; לשיוך קיים אף
    // פעם לא "מזיזים אחורה" ליד שכבר בתהליך (ר' טיפול ב-
    // existingRow.stage === 'closed' למעלה).
    const { data: created } = await supabase.from('contact_departments').insert({
      contact_id: contactId, workspace_id: workspace.id, stage: options.stage || pipeline.order[0], last_activity_at: new Date().toISOString(),
      extra_fields: extraFields || {},
      approval_status: options.requiresApproval ? 'pending' : 'approved',
      created_by_manager: !!options.createdByManager,
      // רק ביצירת שיוך חדש - שיוך קיים לעולם לא נוגעים ב-opened_process
      // שלו (אותו עיקרון כמו stage: לא "מורידים" ליד פעיל בשקט בייבוא חוזר).
      opened_process: options.openProcess === false ? false : true,
    }).select('id').single();
    rowId = created?.id;
  }

  if (rowId && reason) {
    await supabase.from('lead_inquiries').insert({ contact_department_id: rowId, reason, note: note || null, source: source || null });
  }

  return extraConflictCount;
}

// שדות בסיס באנשי קשר שמותר להשלים (רק אם ריקים אצל ההתאמה הקיימת -
// לעולם לא לדרוס ערך שכבר קיים) בייבוא בכמות ממערכות חיצוניות. ערך
// שמגיע לשדה שכבר תפוס בערך שונה נכנס לתור import_conflicts (ר' למטה)
// במקום להיזרק בשקט.
const FILLABLE_CONTACT_FIELDS = [
  'phone', 'phone2', 'email', 'email2', 'idnum', 'birth_date', 'gender',
  'city', 'street', 'house_number', 'apartment', 'zip_code', 'neighborhood', 'country',
];
const FIELD_LABELS = {
  phone: 'טלפון', phone2: 'טלפון נוסף', email: 'מייל', email2: 'מייל נוסף',
  idnum: 'ת"ז', birth_date: 'תאריך לידה', gender: 'מגדר',
  city: 'עיר', street: 'רחוב', house_number: 'מספר בית', apartment: 'דירה',
  zip_code: 'מיקוד', neighborhood: 'שכונה', country: 'מדינה',
};

// מוסיף תנועת תרומה בודדת להיסטוריה (donation_transactions, מיגרציה
// 0031) - לא "תמונת מצב" יחידה אלא רשומה מצטברת, כדי שאפשר יהיה לשמור
// היסטוריה מלאה מכמה מקורות (מערכות הנהלת חשבונות שונות + בעתיד קשר
// חי). דדופ אמיתי לפי מספר מסמך (external_doc_number, אינדקס ייחודי) -
// אותה תנועה שמופיעה בשני קבצים/ייבואים לא נוצרת פעמיים. שורה בלי
// amount/date תקינים פשוט מדולגת (לא שגיאה) - השדה כולו אופציונלי.
export async function insertDonationTransaction(supabase, contactId, workspaceId, sourceSystem, donationTransaction) {
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
      designation: (donationTransaction.designation || '').toString().trim() || null,
      payment_method: (donationTransaction.paymentMethod || '').toString().trim() || null,
      transaction_type: (donationTransaction.transactionType || '').toString().trim() || null,
      campaign_reference: (donationTransaction.campaignReference || '').toString().trim() || null,
      fundraiser_name: (donationTransaction.fundraiserName || '').toString().trim() || null,
      commitment_id: donationTransaction.commitmentId || null,
      receipt_url: (donationTransaction.receiptUrl || '').toString().trim() || null,
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
export async function bulkImportContactRows(supabase, { rows, workspaceId, workspace, sourceSystem, batchLabel, requiresApproval = false, openProcess = true }) {
  const ws = workspace || { id: workspaceId };
  const reason = (batchLabel || '').trim() || 'ייבוא';

  // שדות "רב-ערכיים" של המחלקה הזו (migration 0058) - קונפליקט על אחד
  // מהם, בזמן הייבוא הזה בדיוק, מוצע בסוף האשף כ"לפתוח עמודה נוספת?"
  // במקום להישאר סתם קונפליקט רגיל. Map ולא Set כי צריך גם את התווית
  // המקורית להצגה בשאלה.
  const { data: multiValueFields } = await supabase
    .from('workspace_extra_fields').select('field_key, label').eq('workspace_id', ws.id).eq('allow_multiple', true);
  const multiValueFieldDefs = new Map((multiValueFields || []).map((f) => [f.field_key, f.label]));
  const multiValueTracker = [];

  const membershipOptions = { requiresApproval, recordConflicts: true, sourceSystem, batchLabel, openProcess, multiValueFieldDefs, multiValueTracker };
  let created = 0;
  let enriched = 0;
  let transactionsAdded = 0;
  let transactionsSkipped = 0;
  let conflictsFound = 0;

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

    const externalId = (row.externalId || '').toString().trim() || null;
    const existing = await findExistingMatch(supabase, { idnum, phone, email, sourceSystem, externalId });

    if (existing) {
      const fill = {};
      const conflictRows = [];
      for (const field of FILLABLE_CONTACT_FIELDS) {
        const incoming = row[field];
        if (incoming === undefined || incoming === null) continue;
        const incomingStr = String(incoming).trim();
        if (!incomingStr) continue;
        if (!existing[field]) {
          fill[field] = incoming;
        } else if (String(existing[field]).trim() !== incomingStr) {
          conflictRows.push({
            contact_id: existing.id, workspace_id: ws.id, field_key: field, field_label: FIELD_LABELS[field] || field,
            existing_value: String(existing[field]).trim(), new_value: incomingStr,
            source_system: sourceSystem || null, batch_label: batchLabel || null,
          });
        }
      }
      if (rowTags.length > 0) {
        fill.tags = Array.from(new Set([...(existing.tags || []), ...rowTags]));
      }
      if (Object.keys(fill).length > 0) {
        await supabase.from('contacts').update(fill).eq('id', existing.id);
      }
      if (conflictRows.length > 0) {
        await supabase.from('import_conflicts').insert(conflictRows);
        conflictsFound += conflictRows.length;
      }
      conflictsFound += await upsertDepartmentMembership(supabase, existing.id, ws, reason, row.note || null, sourceSystem, row.extraFields, { ...membershipOptions, stage: row.stage || null });
      trackTransactionResult(await insertDonationTransaction(supabase, existing.id, ws.id, sourceSystem, row.donationTransaction));
      await upsertContactExternalId(supabase, existing.id, sourceSystem, externalId);
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
      city: (row.city || '').toString().trim() || null,
      street: (row.street || '').toString().trim() || null,
      house_number: (row.house_number || '').toString().trim() || null,
      apartment: (row.apartment || '').toString().trim() || null,
      zip_code: (row.zip_code || '').toString().trim() || null,
      neighborhood: (row.neighborhood || '').toString().trim() || null,
      country: (row.country || '').toString().trim() || null,
      source: sourceSystem || 'ייבוא אקסל',
      tags: rowTags,
    }).select('id').single();
    if (createdContact) {
      await upsertDepartmentMembership(supabase, createdContact.id, ws, reason, row.note || null, sourceSystem, row.extraFields, { ...membershipOptions, stage: row.stage || null });
      trackTransactionResult(await insertDonationTransaction(supabase, createdContact.id, ws.id, sourceSystem, row.donationTransaction));
      await upsertContactExternalId(supabase, createdContact.id, sourceSystem, externalId);
      created++;
    }
  }

  const multiValueByField = new Map();
  for (const c of multiValueTracker) {
    if (!multiValueByField.has(c.fieldKey)) multiValueByField.set(c.fieldKey, { fieldKey: c.fieldKey, label: c.label, conflictIds: [] });
    multiValueByField.get(c.fieldKey).conflictIds.push(c.id);
  }

  return {
    success: true, created, enriched, transactionsAdded, transactionsSkipped, conflictsFound, count: created + enriched,
    multiValueFieldConflicts: Array.from(multiValueByField.values()),
  };
}
