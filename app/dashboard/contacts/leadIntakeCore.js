// לוגיקת ליבה משותפת ליצירת/עדכון ליד - בשימוש גם מטופס יצירת ליד ידני
// (actions.js) וגם מנקודת הקליטה האוטומטית של לידים חיצוניים
// (api/leads/intake) - כדי ששני הנתיבים יתנהגו זהה לגמרי (זיהוי כפילויות,
// פתיחה מחדש של ליד סגור, רישום היסטוריית פניות). קובץ רגיל בלי 'use
// server' כדי שיהיה ניתן לייבוא גם מ-Route Handler.
import { getPipeline } from '../lib/pipelines';
import { detectCommitments } from './commitmentClustering';
import { planAdditionalPhones, normalizePhoneDigits } from './phoneRouting';
import { enrollInCampaign } from '../sales/campaigns/kesherCampaign';

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

  // ת"ז נבדק לפני מייל ומיידית מחזיר תוצאה (לא Promise.all מקביל) - כי
  // מייל הוא סימן חלש בהרבה מת"ז: משפחות רבות (ר' ייבוא ישיבת דעת) חולקות
  // מייל אחד לכמה בני משפחה (הורה+ילד, אח+אח), אז התאמת-מייל בלבד עלולה
  // "לבלוע" אדם חדש לגמרי לתוך כרטיס קיים של קרוב משפחה שלו. נמצא בפועל:
  // 7 תלמידים נכתבו בטעות על כרטיס ההורה/האח שלהם כי חלקו איתו מייל, אף
  // שהת"ז שבשורה שונה לגמרי מהת"ז שכבר שמור בכרטיס הקיים.
  if (idnum) {
    const { data: byIdnum } = await supabase.from('contacts').select(select).eq('idnum', idnum).limit(1);
    if (byIdnum?.[0]) return byIdnum[0];
  }
  if (email) {
    const { data: byEmail } = await supabase.from('contacts').select(select).eq('email', email).limit(1);
    const candidate = byEmail?.[0];
    // אם לשורה יש ת"ז ולכרטיס שנמצא לפי המייל כבר יש ת"ז שונה - זו הוכחה
    // שזה אדם אחר בפועל (רק חולק מייל משפחתי), לא התאמה - מדלגים הלאה
    // לבדיקת טלפון/יצירת כרטיס חדש, במקום לדרוס/להעשיר את הקרוב-משפחה.
    if (candidate && !(idnum && candidate.idnum && candidate.idnum.trim() !== idnum)) {
      return candidate;
    }
  }

  // טלפון: השוואה מנורמלת (ספרות בלבד, מול phone_digits/phone2_digits -
  // עמודות generated, מיגרציה 0064) ולא השוואת מחרוזת מדויקת - כי מקורות
  // שונים (מערכת עסקים מול קשר) מפרמטים טלפון אחרת (עם/בלי מקפים), והשוואה
  // מדויקת פספסה בשקט התאמות אמיתיות (אושר מריצה חיה - 8 כרטיסים כפולים
  // נוצרו בגלל זה בדיוק). בודק גם phone2 (בעבר לא נבדק בכלל כאן).
  if (phone) {
    // 9 ספרות אחרונות (normalizePhoneDigits, phoneRouting.js) - לא כל
    // הספרות - כדי לאחד "0501234567"/"972501234567"/"+972501234567",
    // וגם באג תיעוד שנצפה בפועל בקשר: "0" מיותר לפני קידומת בינלאומית
    // קיימת ("0+972501234567"). ר' מיגרציה 0065.
    const digits = normalizePhoneDigits(phone);
    if (digits) {
      const { data: viaPhone } = await supabase
        .from('contacts').select(select)
        .or(`phone_digits.eq.${digits},phone2_digits.eq.${digits}`)
        .limit(1);
      if (viaPhone?.[0]) return viaPhone[0];
    }
  }

  // אם הטלפון לא נמצא כ-phone/phone2 ראשי - בודקים גם contact_phones
  // (מיגרציה 0062, "טלפונים נוספים") - כדי שטלפון שכבר ידוע כ"מספר נוסף"
  // של מישהו לא ייצור איש קשר כפול אם הוא מופיע כטלפון ראשי בקובץ עתידי.
  if (phone) {
    const { data: viaExtraPhone } = await supabase.from('contact_phones').select('contact_id').eq('phone', phone).limit(1);
    if (viaExtraPhone?.[0]?.contact_id) {
      const { data: byExtraPhone } = await supabase.from('contacts').select(select).eq('id', viaExtraPhone[0].contact_id).limit(1);
      if (byExtraPhone?.[0]) return byExtraPhone[0];
    }
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
  // שדות "ריבוי-ערכים" (allow_multiple, ר' options.multiValueFieldDefs) -
  // מנרמל ערך גולמי שמגיע כמחרוזת-מופרדת-פסיק (כמו tags) למערך, כדי
  // ששני הענפים למטה (שיוך קיים/חדש) תמיד יכתבו מערך ל-extra_fields,
  // לא מחרוזת - זה מה שתצוגת-הצ'קבוקסים בכרטיס (ContactTabs.js) מצפה לו.
  if (extraFields && options.multiValueFieldDefs) {
    for (const key of options.multiValueFieldDefs.keys()) {
      if (extraFields[key] !== undefined && !Array.isArray(extraFields[key])) {
        extraFields = { ...extraFields, [key]: (extraFields[key] ?? '').toString().split(',').map((s) => s.trim()).filter(Boolean) };
      }
    }
  }

  const { data: existingRow } = await supabase
    .from('contact_departments')
    .select('id, stage, extra_fields, opened_process')
    .eq('contact_id', contactId)
    .eq('workspace_id', workspace.id)
    .single();

  let rowId;
  let extraConflictCount = 0;
  // אם השיוך (קיים או חדש) לא "פותח תהליך" (אנשי קשר היסטוריים - סמינרים,
  // בוגרי ישיבה וכו') - לא נרשמת "פנייה" בהיסטוריית הפעילות בכלל. לפני
  // התיקון הזה, כל ריצת-ייבוא נוספת שנוגעת באותו איש קשר יצרה עוד רשומת
  // "ייבוא" ריקה בכרטיס שלו, כאילו הוא ליד פעיל שמטופל - בעוד שההיסטוריה
  // האמיתית שהמשתמש ביקש (למשל אילו סמינרים השתתף/התעניין) כבר נשמרת
  // במקום הייעודי (contact_seminar_participations וכו'), לא כאן.
  let effectiveOpenedProcess;
  if (existingRow) {
    rowId = existingRow.id;
    effectiveOpenedProcess = existingRow.opened_process !== false;
    const update = { last_activity_at: new Date().toISOString() };
    if (existingRow.stage === 'closed') {
      const pipeline = await getPipeline(supabase, workspace.name);
      update.stage = pipeline.order[0];
      update.closed_reason = null;
    }
    if (extraFields) {
      const existingExtra = existingRow.extra_fields || {};
      const merged = { ...extraFields, ...existingExtra };
      // שדות ריבוי-ערכים לא "קיים מנצח, אחרת קונפליקט" - הם מאוחדים
      // (union) עם הקיים, בדיוק כמו tags כבר עובד היום (leadIntakeCore.js
      // בענף "existing" של bulkImportContactRows) - אדם עם עוד ערך חדש
      // (למשל עוד שנת-לימוד) לא אמור לפתוח קונפליקט, רק להצטרף לרשימה.
      if (options.multiValueFieldDefs) {
        for (const [key, incoming] of Object.entries(extraFields)) {
          if (!options.multiValueFieldDefs.has(key)) continue;
          const incomingArr = Array.isArray(incoming) ? incoming : [];
          if (incomingArr.length === 0) continue;
          const existingArr = Array.isArray(existingExtra[key]) ? existingExtra[key] : (existingExtra[key] ? [existingExtra[key]] : []);
          merged[key] = Array.from(new Set([...existingArr, ...incomingArr]));
        }
      }
      update.extra_fields = merged;
      // ייבוא בכמות בלבד (recordConflicts): ערך חדש שמתנגש עם ערך קיים
      // לא נדרס בשקט (ר' מיזוג למעלה - הקיים תמיד מנצח) - הוא נשמר לתור
      // בדיקה ידנית (import_conflicts) כדי שאף נתון מהקובץ לא "ייעלם".
      if (options.recordConflicts) {
        const conflictRows = [];
        for (const [key, incoming] of Object.entries(extraFields)) {
          if (options.multiValueFieldDefs?.has(key)) continue; // מאוחד למעלה - לעולם לא קונפליקט
          const incomingStr = String(incoming ?? '').trim();
          if (!incomingStr) continue;
          const existingVal = existingExtra[key];
          const existingStr = existingVal === undefined || existingVal === null ? '' : String(existingVal).trim();
          if (existingStr && existingStr !== incomingStr) {
            const fieldKey = `extra:${key}`;
            const dedupKey = `${contactId}|${fieldKey}|${existingStr}|${incomingStr}`;
            // ר' seenConflictKeys ב-bulkImportContactRows - קונפליקט זהה
            // כבר ממתין (מהרצה הזו או קודמת), לא יוצרים עוד עותק
            if (options.seenConflictKeys?.has(dedupKey)) continue;
            options.seenConflictKeys?.add(dedupKey);
            conflictRows.push({
              contact_id: contactId, workspace_id: workspace.id, field_key: fieldKey, field_label: key,
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
    const { data: created, error: createError } = await supabase.from('contact_departments').insert({
      contact_id: contactId, workspace_id: workspace.id, stage: options.stage || pipeline.order[0], last_activity_at: new Date().toISOString(),
      extra_fields: extraFields || {},
      approval_status: options.requiresApproval ? 'pending' : 'approved',
      created_by_manager: !!options.createdByManager,
      // רק ביצירת שיוך חדש - שיוך קיים לעולם לא נוגעים ב-opened_process
      // שלו (אותו עיקרון כמו stage: לא "מורידים" ליד פעיל בשקט בייבוא חוזר).
      opened_process: options.openProcess === false ? false : true,
    }).select('id').single();
    // אם ה-insert נכשל (למשל pipeline.order[0]===undefined כי למחלקה אין
    // אף pipeline_stage מוגדר) - בלי הבדיקה הזו הכשלון היה נבלע בשקט:
    // איש הקשר נוצר, התרומה/התנועה שלו נרשמת כרגיל בהמשך, אבל בלי אף
    // שיוך-מחלקה - "נעלם" מכל מסך מחלקתי (לידים/פייפליין/ניהול נתונים)
    // למרות שיש לו כסף אמיתי במערכת. נמצא בפועל: 68 אנשי קשר כאלה.
    if (createError) {
      console.error(`upsertDepartmentMembership: contact_departments insert failed for contact ${contactId}, workspace ${workspace.id}:`, createError.message);
    }
    rowId = created?.id;
    effectiveOpenedProcess = options.openProcess !== false;
  }

  if (rowId && reason && effectiveOpenedProcess) {
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

// ממיר DD/MM/YYYY (הפורמט הנפוץ בקבצי ייצוא ישראליים, וגם מה שהאשף
// הכללי - DepartmentImportWizard.js - שולח כברירת מחדל) ל-ISO
// (YYYY-MM-DD) לפני כתיבה לעמודת date ב-Postgres. קריטי: בלי ההמרה
// הזו, Postgres מפרש "DD/MM/YYYY" לפי datestyle ברירת המחדל (MDY) -
// כשה-DD>12 זו שגיאת "date/time field value out of range" ש-
// insertDonationTransaction בולעת בשקט (מחזירה null, לא נספר גם
// כ"נכשל" וגם לא כ"דולג") והתנועה כלל לא נכתבת; כשה-DD<=12 הוא
// "מצליח" בשקט אבל עם יום/חודש מוחלפים (תאריך שגוי, לא שגיאה גלויה).
// נמצא בפועל: 91% מהתנועות בייבוא צ'ריידי (DD>12) נעלמו לגמרי בלי
// אזהרה. תאריך שכבר ISO (כמו מה ש-kesherSyncActions.js's safeDate
// כבר ממיר לפני הקריאה לכאן) עובר ללא שינוי - הרג'קס לא תופס אותו.
function toIsoDate(raw) {
  const s = (raw || '').toString().trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return s;
  const [, day, month, year] = m;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

// מוסיף תנועת תרומה בודדת להיסטוריה (donation_transactions, מיגרציה
// 0031) - לא "תמונת מצב" יחידה אלא רשומה מצטברת, כדי שאפשר יהיה לשמור
// היסטוריה מלאה מכמה מקורות (מערכות הנהלת חשבונות שונות + בעתיד קשר
// חי). דדופ אמיתי לפי מספר מסמך (external_doc_number, אינדקס ייחודי) -
// אותה תנועה שמופיעה בשני קבצים/ייבואים לא נוצרת פעמיים. שורה בלי
// amount/date תקינים פשוט מדולגת (לא שגיאה) - השדה כולו אופציונלי.
export async function insertDonationTransaction(supabase, contactId, workspaceId, sourceSystem, donationTransaction) {
  if (!donationTransaction) return null;
  const amount = Number(donationTransaction.amount);
  const date = toIsoDate(donationTransaction.date);
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
    }, { onConflict: 'contact_id,source_system,external_doc_number', ignoreDuplicates: true })
    .select('id');
  if (error) return null;
  return (data?.length || 0) > 0; // true = נוספה תנועה חדשה, false = דולגה (כבר קיימת)
}

// מאחד קבוצת שורות שחולקות אותה אסמכתא חיצונית (למשל "אסמכתא בילינג"
// בקובץ הנהלת חשבונות) לשורת commitments אחת - נקרא פעם אחת לכל שורה
// גולמית שיש לה row.commitment (ר' DepartmentImportWizard.js), לפני
// insertDonationTransaction, כדי לצרף את commitment_id לתנועה שנוצרת
// ממנה. התאמה/עדכון לפי (workspace_id, external_reference) - אותו רעיון
// בדיוק כמו הסנכרון מול "קשר" (kesherSyncActions.js): select-then-branch,
// לא upsert ברמת ה-DB, כדי לדעת להבחין created מ-updated לתצוגה. כל שורה
// בקבוצה דורסת (patch מלא) - כלומר הסטטוס/אמצעי-התשלום שנשמרים משקפים את
// השורה האחרונה שעובדה (סדר הקובץ), שזה בדרך כלל גם הכרונולוגי ביותר.
export async function resolveCommitment(supabase, contactId, workspace, commitment, sourceSystem) {
  const externalReference = (commitment.externalReference || '').toString().trim();
  if (!externalReference) return null;
  const totalAmount = Number(commitment.totalAmount);
  if (!totalAmount || totalAmount <= 0) return null; // commitments.total_amount is not null > 0

  let status = 'active';
  if (commitment.cancelled || commitment.frozen) status = 'cancelled'; // אין ערך "מוקפא" נפרד בקונסטריינט - מטופל כבטל, ר' last_payment_status
  let lastPaymentStatus = commitment.frozen ? 'מוקפא (מקור)' : (commitment.cancelled ? 'בוטל (מקור)' : null);
  // דריסה מפורשת מזיהוי אוטומטי של תשלום כושל (commitmentClustering.js) -
  // סיבת הכישלון האמיתית מהמקור (למשל "כרטיס חסום") גוברת על מוקפא/בוטל.
  if (commitment.lastPaymentStatus) lastPaymentStatus = commitment.lastPaymentStatus;

  const patch = {
    total_amount: totalAmount,
    installments_count: Number(commitment.installmentsCount) > 0 ? Number(commitment.installmentsCount) : 1,
    start_date: commitment.startDate ? toIsoDate(commitment.startDate) : null,
    end_date: commitment.endDate ? toIsoDate(commitment.endDate) : null,
    designation: (commitment.designation || '').toString().trim() || null,
    payment_method: (commitment.paymentMethod || '').toString().trim() || null,
    status,
    last_payment_status: lastPaymentStatus,
    source_system: (sourceSystem || '').toString().trim() || null,
  };
  // ערך מוחלט (לא הצטברות) - מחושב פעם אחת לכל "ריצה" שזוהתה
  // (commitmentClustering.js) ומועבר בשלמותו על כל שורה בריצה, כדי
  // שריצה חוזרת של אותו ייבוא תישאר אידמפוטנטית ולא תכפיל את המונה.
  if (commitment.bouncedCount !== undefined) patch.bounced_count = Number(commitment.bouncedCount) || 0;

  const { data: existingCommitment } = await supabase
    .from('commitments').select('id')
    .eq('workspace_id', workspace.id).eq('external_reference', externalReference).maybeSingle();

  if (existingCommitment) {
    await supabase.from('commitments').update(patch).eq('id', existingCommitment.id);
    return { id: existingCommitment.id, created: false };
  }
  const { data: created } = await supabase.from('commitments')
    .insert({ contact_id: contactId, workspace_id: workspace.id, external_reference: externalReference, ...patch })
    .select('id').single();
  return created ? { id: created.id, created: true } : null;
}

// רושם הרשמה בודדת לקורס (contact_course_enrollments) - טבלת-ילד
// one-to-many אמיתית (בשונה מ-workspace_extra_fields, ערך יחיד לאיש-קשר),
// לשימוש ראשון בייבוא היסטוריית קורסים מ"אורביט" (מחלקת דעת ותבונה),
// אבל גנרית לכל מחלקה. מפתח דה-דופ טבעי (contact_id, year_label,
// course_code) - ignoreDuplicates כדי שריצה חוזרת של אותו ייבוא תישאר
// אידמפוטנטית בלי לשכפל שורות.
export async function resolveCourseEnrollment(supabase, contactId, workspace, enrollment) {
  const yearLabel = (enrollment.yearLabel || '').toString().trim();
  const courseCode = (enrollment.courseCode || '').toString().trim();
  if (!yearLabel || !courseCode) return false;
  const { error } = await supabase.from('contact_course_enrollments').upsert({
    contact_id: contactId,
    workspace_id: workspace.id,
    year_label: yearLabel,
    course_name: (enrollment.courseName || '').toString().trim() || null,
    course_code: courseCode,
    confidence: enrollment.confidence === 'low' ? 'low' : 'high',
  }, { onConflict: 'contact_id,year_label,course_code', ignoreDuplicates: true });
  return !error;
}

// רושם השתתפות/התעניינות באירוע-חג (contact_seminar_participations,
// one-to-many אמיתי - אותו דפוס בדיוק כמו resolveCourseEnrollment). kind
// ('participation'/'pledge') מבדיל רשומת השתתפות רגילה מרשומת-נדבה
// נפרדת (רק בראש השנה תשפ"ד) - מותר לאותו אדם לקבל שתי שורות לאותו
// event_type+year (אחת מכל kind) - הוחלט במפורש לא למזג להערה אחת.
export async function resolveSeminarParticipation(supabase, contactId, workspace, participation) {
  const eventType = (participation.eventType || '').toString().trim();
  const year = (participation.year || '').toString().trim();
  if (!eventType || !year) return false;
  const { error } = await supabase.from('contact_seminar_participations').upsert({
    contact_id: contactId,
    workspace_id: workspace.id,
    event_type: eventType,
    year,
    kind: participation.kind === 'pledge' ? 'pledge' : 'participation',
    status: participation.status === 'attended' ? 'attended' : 'interested',
    confidence: participation.confidence === 'low' ? 'low' : 'high',
    note: (participation.note || '').toString().trim() || null,
  }, { onConflict: 'contact_id,event_type,year,kind', ignoreDuplicates: true });
  return !error;
}

// מקשר איש-קשר לאיש-קשר קשור (contact_relations, one-to-many אמיתי -
// למשל תלמיד→הורה) - מתאים-או-יוצר, בדיוק כמו findExistingMatch/יצירת
// כרטיס חדש שכבר קיימים ב-bulkImportContactRows, אבל מצומצם בכוונה
// להתאמה **רק** לפי טלפון (לא שם) - אושר במפורש (לקח מפרויקט צ'ריידי:
// דדופ לפי שם לא אמין). איש-הקשר הקשור לא מקבל שיוך-מחלקה - נשאר
// עצמאי, נגיש רק דרך הקישור מהכרטיס השני (contact_relations תומכת
// בשני כיווני-שאילתה: contact_id ו-related_contact_id).
export async function resolveContactRelation(supabase, contactId, sourceSystem, relation) {
  const phone = (relation.phone || '').toString().trim();
  const first = (relation.first || '').toString().trim();
  if (!phone && !first) return false;

  let relatedId = null;
  const digits = normalizePhoneDigits(phone);
  if (digits) {
    const { data } = await supabase.from('contacts').select('id')
      .or(`phone_digits.eq.${digits},phone2_digits.eq.${digits}`).limit(1);
    relatedId = data?.[0]?.id || null;
  }
  if (!relatedId && first) {
    const { data: created } = await supabase.from('contacts').insert({
      first,
      last: (relation.last || '').toString().trim(),
      phone: phone || null,
      email: (relation.email || '').toString().trim() || null,
      source: sourceSystem || 'ייבוא אקסל',
    }).select('id').single();
    relatedId = created?.id || null;
  }
  if (!relatedId) return false;

  await supabase.from('contact_relations').upsert(
    { contact_id: contactId, related_contact_id: relatedId, relation_label: relation.label },
    { onConflict: 'contact_id,related_contact_id,relation_label', ignoreDuplicates: true }
  );
  return true;
}

// ייבוא בכמות ממערכת חיצונית (למשל דוח אקסל ממערכת "קשר" למחלקת
// תרומות) - מיועד לשימוש גם מאשף הייבוא הידני וגם (בעתיד) מחיבור חי
// לאותה מערכת, ולכן חי כאן ולא ב-actions.js. עקרון-העל: שום נתיב כאן
// לעולם לא מוחק/דורס נתון קיים - רק יוצר כרטיס חדש, או מעשיר כרטיס קיים
// (משלים שדות ריקים בלבד + מוסיף רשומת פנייה חדשה להיסטוריה).
// sourceSystem/batchLabel מתויגים על כל רשומת lead_inquiries שנוצרת, כך
// שהמקור והתקופה של כל ייבוא נשארים גלויים לצמיתות בטאב "פעילות".
export async function bulkImportContactRows(supabase, { rows, workspaceId, workspace, sourceSystem, batchLabel, requiresApproval = false, openProcess = true, autoDetectCommitments = null, campaignName = null, userId = null }) {
  const ws = workspace || { id: workspaceId };
  const reason = (batchLabel || '').trim() || 'ייבוא';

  // מעבר-הכנה על כל השורות ביחד (לפני הלולאה שכותבת ל-DB שורה-שורה) -
  // מזהה הוראות קבע מתוך תנועות חוזרות ומסמן/מסלק תשלומים כושלים, ר'
  // commitmentClustering.js. חייב לרוץ על המערך המלא כי הזיהוי דורש
  // ראייה חוצת-שורות (קיבוץ לפי חשבון+סכום), לא אפשרי per-row.
  const { clustersFound: commitmentsAutoDetected, skippedNoCommitment: bouncedRowsSkippedNoCommitment } =
    detectCommitments(rows, autoDetectCommitments || {});

  // שדות "רב-ערכיים" של המחלקה הזו (migration 0058) - קונפליקט על אחד
  // מהם, בזמן הייבוא הזה בדיוק, מוצע בסוף האשף כ"לפתוח עמודה נוספת?"
  // במקום להישאר סתם קונפליקט רגיל. Map ולא Set כי צריך גם את התווית
  // המקורית להצגה בשאלה.
  const { data: multiValueFields } = await supabase
    .from('workspace_extra_fields').select('field_key, label').eq('workspace_id', ws.id).eq('allow_multiple', true);
  const multiValueFieldDefs = new Map((multiValueFields || []).map((f) => [f.field_key, f.label]));
  const multiValueTracker = [];

  // מונע הישנות של הבאג שגרם ל-48,139 שורות ב-import_conflicts (רובן
  // שכפול מדויק): שאילתה בודדת (לא לכל שורה) טוענת את כל הקונפליקטים
  // ה-pending הקיימים של המחלקה הזו ל-Set בזיכרון - לפני שכל אחד
  // ממקומות-היצירה (למטה, וב-upsertDepartmentMembership) דוחף קונפליקט
  // חדש, בודקים אם כבר קיים אחד זהה (אותו contact_id+field_key+
  // existing_value+new_value) ומדלגים אם כן. ה-Set גם מתעדכן מיד בכל
  // דחיפה, כדי לתפוס גם כפילות תוך-ריצה (אלפי שורות של אותו קובץ) לא
  // רק כפילות מול הרצות קודמות. DepartmentImportWizard.js שולח ב-
  // CHUNK_SIZE=500, אז זו שאילתה אחת לכל נתח (~41 ל-20,521 שורות), לא
  // אחת לכל שורה.
  const { data: existingPendingConflicts } = await supabase
    .from('import_conflicts').select('contact_id, field_key, existing_value, new_value')
    .eq('workspace_id', ws.id).eq('status', 'pending');
  const seenConflictKeys = new Set(
    (existingPendingConflicts || []).map((r) => `${r.contact_id}|${r.field_key}|${r.existing_value}|${r.new_value}`)
  );

  const membershipOptions = { requiresApproval, recordConflicts: true, sourceSystem, batchLabel, openProcess, multiValueFieldDefs, multiValueTracker, seenConflictKeys };
  let created = 0;
  let enriched = 0;
  let transactionsAdded = 0;
  let transactionsSkipped = 0;
  let conflictsFound = 0;
  let commitmentsCreated = 0;
  let commitmentsUpdated = 0;
  let bouncedAttached = 0;
  let bouncedOrphanCommitmentsCreated = 0;
  let additionalPhonesCreated = 0;
  let courseEnrollmentsCreated = 0;
  let relationsCreated = 0;
  let seminarParticipationsCreated = 0;
  let couplesLinked = 0;
  let rowsFailed = 0;
  const failedRowDetails = [];
  // מקשר בני-זוג שפוצלו לשתי שורות נפרדות (row.coupleGroup, ר'
  // DepartmentImportWizard.js) - Map בתוך-ריצה בלבד (לא persisted), כי
  // הקישור צריך לקרות רק פעם אחת, כששני "החצאים" של הזוג כבר נוצרו/
  // אותרו. מניח ששני חברי הזוג נמצאים באותו chunk (500 שורות) - נכון
  // לכל קבצי סמינרים (הכי גדול ~380 שורות).
  const coupleGroupTracker = new Map();

  function trackTransactionResult(added) {
    if (added === null) return;
    if (added) transactionsAdded++;
    else transactionsSkipped++;
  }

  async function attachCommitment(contactId, row) {
    if (!row.commitment) return;
    const resolved = await resolveCommitment(supabase, contactId, ws, row.commitment, sourceSystem);
    if (!resolved) return;
    if (resolved.created) commitmentsCreated++; else commitmentsUpdated++;
    if (row.donationTransaction) row.donationTransaction.commitmentId = resolved.id;
    if (row.commitment.__isBounceRow) {
      if (resolved.created && row.commitment.__isOrphanRun) bouncedOrphanCommitmentsCreated++;
      else bouncedAttached++;
    }
  }

  async function attachCourseEnrollment(contactId, row) {
    if (!row.courseEnrollment) return;
    const ok = await resolveCourseEnrollment(supabase, contactId, ws, row.courseEnrollment);
    if (ok) courseEnrollmentsCreated++;
  }

  async function attachRelations(contactId, row) {
    for (const rel of row.relations || []) {
      const ok = await resolveContactRelation(supabase, contactId, sourceSystem, rel);
      if (ok) relationsCreated++;
    }
  }

  async function attachSeminarParticipation(contactId, row) {
    if (!row.seminarParticipation) return;
    const ok = await resolveSeminarParticipation(supabase, contactId, ws, row.seminarParticipation);
    if (ok) seminarParticipationsCreated++;
  }

  // מקשר שני כרטיסים כבני-זוג (contacts.related_contact_id/relation_label,
  // אותו מנגנון בדיוק כמו splitCoupleContact ב-actions.js:744-772) - רק
  // כש-row.coupleGroup קיים (סומן ע"י הממיר בפייתון לזוגות שפוצלו לפי
  // "ו", ר' DepartmentImportWizard.js). הקבוצה נראית פעמיים לאורך
  // הריצה (חצי-א' וחצי-ב') - בפעם הראשונה רק שומרים contactId בזיכרון,
  // בפעם השנייה מעדכנים את שני הכרטיסים בבת אחת.
  async function attachCoupleLink(contactId, row) {
    const group = (row.coupleGroup || '').toString().trim();
    if (!group) return;
    const otherId = coupleGroupTracker.get(group);
    if (!otherId) {
      coupleGroupTracker.set(group, contactId);
      return;
    }
    if (otherId === contactId) return; // אותו כרטיס הותאם פעמיים - לא קורה בפועל, הגנה
    await supabase.from('contacts').update({ related_contact_id: otherId, relation_label: 'בן/בת זוג' }).eq('id', contactId);
    await supabase.from('contacts').update({ related_contact_id: contactId, relation_label: 'בן/בת זוג' }).eq('id', otherId);
    couplesLinked++;
  }

  // מנתב טלפונים "נוספים" (row.additionalPhones, ממופים מ-phone3/phone4
  // באשף) בין contacts.phone/phone2 (אם עדיין ריקים) לבין contact_phones
  // (מיגרציה 0062) - ר' phoneRouting.js. existingExtraPhones ריק ליצירת
  // כרטיס חדש (אין עדיין שום contact_phones לאיש קשר שלא נוצר).
  async function routeAdditionalPhones(contactId, currentPhone, currentPhone2, existingExtraPhones, row) {
    if (!row.additionalPhones?.length) return {};
    const plan = planAdditionalPhones(currentPhone, currentPhone2, existingExtraPhones, row.additionalPhones);
    if (plan.toInsert.length > 0) {
      await supabase.from('contact_phones').upsert(
        plan.toInsert.map((p) => ({ contact_id: contactId, phone: p.phone, label: p.label, source: sourceSystem || null })),
        { onConflict: 'contact_id,phone', ignoreDuplicates: true }
      );
      additionalPhonesCreated += plan.toInsert.length;
    }
    return plan.patch;
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
        let incoming = row[field];
        if (incoming === undefined || incoming === null) continue;
        let incomingStr = String(incoming).trim();
        if (!incomingStr) continue;
        // birth_date חייב ISO לפני כתיבה ל-Postgres (עמודת date) - ר'
        // toIsoDate למעלה. בלי ההמרה: DD>12 זורק שגיאה שנבלעת בשקט
        // (fill לא נכתב, כלום לא נזרק/נספר), DD<=12 "מצליח" עם יום/חודש
        // מוחלפים - אותו באג בדיוק שכבר תוקן ב-insertDonationTransaction.
        if (field === 'birth_date') {
          incoming = toIsoDate(incoming);
          incomingStr = String(incoming).trim();
          if (!incomingStr) continue;
        }
        if (!existing[field]) {
          fill[field] = incoming;
        } else if (String(existing[field]).trim() !== incomingStr) {
          const existingStr = String(existing[field]).trim();
          const dedupKey = `${existing.id}|${field}|${existingStr}|${incomingStr}`;
          // ר' seenConflictKeys ב-בניית membershipOptions למעלה - קונפליקט
          // זהה כבר ממתין (מהרצה הזו או קודמת), לא יוצרים עוד עותק
          if (!seenConflictKeys.has(dedupKey)) {
            seenConflictKeys.add(dedupKey);
            conflictRows.push({
              contact_id: existing.id, workspace_id: ws.id, field_key: field, field_label: FIELD_LABELS[field] || field,
              existing_value: existingStr, new_value: incomingStr,
              source_system: sourceSystem || null, batch_label: batchLabel || null,
            });
          }
        }
      }
      if (rowTags.length > 0) {
        fill.tags = Array.from(new Set([...(existing.tags || []), ...rowTags]));
      }
      if (row.additionalPhones?.length) {
        const { data: extraPhoneRows } = await supabase.from('contact_phones').select('phone').eq('contact_id', existing.id);
        const phonePatch = await routeAdditionalPhones(
          existing.id, fill.phone || existing.phone, fill.phone2 || existing.phone2,
          (extraPhoneRows || []).map((r) => r.phone), row
        );
        Object.assign(fill, phonePatch);
      }
      if (Object.keys(fill).length > 0) {
        await supabase.from('contacts').update(fill).eq('id', existing.id);
      }
      if (conflictRows.length > 0) {
        await supabase.from('import_conflicts').insert(conflictRows);
        conflictsFound += conflictRows.length;
      }
      conflictsFound += await upsertDepartmentMembership(supabase, existing.id, ws, reason, row.note || null, sourceSystem, row.extraFields, { ...membershipOptions, stage: row.stage || null });
      await attachCommitment(existing.id, row);
      trackTransactionResult(await insertDonationTransaction(supabase, existing.id, ws.id, sourceSystem, row.donationTransaction));
      await attachCourseEnrollment(existing.id, row);
      await attachRelations(existing.id, row);
      await attachSeminarParticipation(existing.id, row);
      await attachCoupleLink(existing.id, row);
      await upsertContactExternalId(supabase, existing.id, sourceSystem, externalId);
      if (campaignName) await enrollInCampaign(supabase, ws.id, existing.id, userId, campaignName);
      enriched++;
      continue;
    }

    const phone2Value = (row.phone2 || '').toString().trim() || null;
    const initialPhonePlan = row.additionalPhones?.length
      ? planAdditionalPhones(phone, phone2Value, [], row.additionalPhones)
      : null;

    const { data: createdContact, error: createError } = await supabase.from('contacts').insert({
      first,
      last: (row.last || '').toString().trim(), // contacts.last היא NOT NULL
      phone: initialPhonePlan?.patch.phone || phone, idnum, email,
      phone2: initialPhonePlan?.patch.phone2 || phone2Value,
      email2: (row.email2 || '').toString().trim() || null,
      birth_date: toIsoDate(row.birth_date) || null,
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
      if (initialPhonePlan?.toInsert.length > 0) {
        await supabase.from('contact_phones').upsert(
          initialPhonePlan.toInsert.map((p) => ({ contact_id: createdContact.id, phone: p.phone, label: p.label, source: sourceSystem || null })),
          { onConflict: 'contact_id,phone', ignoreDuplicates: true }
        );
        additionalPhonesCreated += initialPhonePlan.toInsert.length;
      }
      await upsertDepartmentMembership(supabase, createdContact.id, ws, reason, row.note || null, sourceSystem, row.extraFields, { ...membershipOptions, stage: row.stage || null });
      await attachCommitment(createdContact.id, row);
      trackTransactionResult(await insertDonationTransaction(supabase, createdContact.id, ws.id, sourceSystem, row.donationTransaction));
      await attachCourseEnrollment(createdContact.id, row);
      await attachRelations(createdContact.id, row);
      await attachSeminarParticipation(createdContact.id, row);
      await attachCoupleLink(createdContact.id, row);
      await upsertContactExternalId(supabase, createdContact.id, sourceSystem, externalId);
      if (campaignName) await enrollInCampaign(supabase, ws.id, createdContact.id, userId, campaignName);
      created++;
    } else {
      // כותב-הכרטיס נכשל (למשל אילוץ DB) - במקום להיבלע בשקט (כמו
      // שקרה עם birth_date לפני התיקון - ר' toIsoDate למעלה) נספר
      // ומדווח בפירוט, כדי שאף שורה לא "תיעלם" מבלי שהמשתמש ידע.
      rowsFailed++;
      if (failedRowDetails.length < 30) {
        failedRowDetails.push({ first, last: (row.last || '').toString().trim(), error: createError?.message || 'שגיאה לא ידועה' });
      }
    }
  }

  const multiValueByField = new Map();
  for (const c of multiValueTracker) {
    if (!multiValueByField.has(c.fieldKey)) multiValueByField.set(c.fieldKey, { fieldKey: c.fieldKey, label: c.label, conflictIds: [] });
    multiValueByField.get(c.fieldKey).conflictIds.push(c.id);
  }

  return {
    success: true, created, enriched, transactionsAdded, transactionsSkipped, conflictsFound, count: created + enriched,
    commitmentsCreated, commitmentsUpdated,
    commitmentsAutoDetected, bouncedAttached, bouncedOrphanCommitmentsCreated, bouncedRowsSkippedNoCommitment,
    additionalPhonesCreated, courseEnrollmentsCreated, relationsCreated, rowsFailed, failedRowDetails,
    seminarParticipationsCreated, couplesLinked,
    multiValueFieldConflicts: Array.from(multiValueByField.values()),
  };
}
