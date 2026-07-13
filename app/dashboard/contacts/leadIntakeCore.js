// לוגיקת ליבה משותפת ליצירת/עדכון ליד - בשימוש גם מטופס יצירת ליד ידני
// (actions.js) וגם מנקודת הקליטה האוטומטית של לידים חיצוניים
// (api/leads/intake) - כדי ששני הנתיבים יתנהגו זהה לגמרי (זיהוי כפילויות,
// פתיחה מחדש של ליד סגור, רישום היסטוריית פניות). קובץ רגיל בלי 'use
// server' כדי שיהיה ניתן לייבוא גם מ-Route Handler.
import { getPipeline } from '../components/pipelines';

// מחפש איש קשר קיים לפי ת"ז/טלפון/מייל (זיהוי כפילויות לפי האפיון)
export async function findExistingMatch(supabase, { idnum, phone, email }) {
  const clauses = [];
  if (idnum) clauses.push(`idnum.eq.${idnum}`);
  if (phone) clauses.push(`phone.eq.${phone}`);
  if (email) clauses.push(`email.eq.${email}`);
  if (clauses.length === 0) return null;

  const { data } = await supabase
    .from('contacts')
    .select('id, tags')
    .or(clauses.join(','))
    .limit(1);

  return data?.[0] || null;
}

// מוסיף איש קשר למחלקה נתונה (contact_departments) בלי לגעת בשיוך שלו
// לשאר המחלקות - אדם יכול להיות פעיל בכמה מחלקות בו-זמנית, כל אחת עם
// שלב משלה. כל קריאה (גם לשיוך קיים) רושמת "פנייה" חדשה בהיסטוריה -
// כדי שאם מישהו יוצר קשר שוב, זה יישמר ולא יידרס. אם השיוך הקיים כבר
// "סגור" - הפנייה החדשה פותחת אותו מחדש מהשלב הראשון של ה-pipeline;
// אחרת השלב הנוכחי נשאר, רק "טיפול אחרון" מתעדכן (כך שהליד קופץ לראש
// רשימת הלידים, ממוינת לפי last_activity_at).
export async function upsertDepartmentMembership(supabase, contactId, workspace, reason, note) {
  const { data: existingRow } = await supabase
    .from('contact_departments')
    .select('id, stage')
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
    await supabase.from('contact_departments').update(update).eq('id', rowId);
  } else {
    const pipeline = getPipeline(workspace.name);
    const { data: created } = await supabase.from('contact_departments').insert({
      contact_id: contactId, workspace_id: workspace.id, stage: pipeline.order[0], last_activity_at: new Date().toISOString(),
    }).select('id').single();
    rowId = created?.id;
  }

  if (rowId && reason) {
    await supabase.from('lead_inquiries').insert({ contact_department_id: rowId, reason, note: note || null });
  }
}
