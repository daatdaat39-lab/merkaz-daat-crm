'use server';

import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { redirect } from 'next/navigation';
import { isManagerOfWorkspace } from '../../lib/contactGuards';
import { isGoogleSheetsConfigured, getAccessToken as getSheetsAccessToken, appendRows, getSheetValues, addCategoryViewTabs, getSpreadsheetSheetTitles, CAMPAIGN_SHEET_HEADER_ROW } from '../../../../lib/sheets/client';

// קמפיין תרומות: קבוצת אנשי קשר שמטופלת יחד, מחולקת לקטגוריות (חם/קר/
// תורם גדול), משויכת לנציגים, עם ערוץ פעולה מוגדר (שיחה/וואטסאפ/מייל/
// פגישה). כל הפעולות כאן מוגבלות לבעלים/מנהל של המחלקה.

async function requireUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

async function requireManager(supabase, userId, workspaceId) {
  const allowed = await isManagerOfWorkspace(supabase, userId, workspaceId);
  return allowed ? null : { error: 'רק בעלים/מנהל של המחלקה יכול לנהל קמפיינים' };
}

export async function createCampaign(workspaceId, name, channel) {
  const { supabase, user } = await requireUser();
  if (!workspaceId || !(name || '').trim()) return { error: 'יש למלא שם קמפיין' };

  const denied = await requireManager(supabase, user.id, workspaceId);
  if (denied) return denied;

  const { data, error } = await supabase.from('campaigns').insert({
    workspace_id: workspaceId,
    name: name.trim(),
    channel: channel || null,
    created_by: user.id,
  }).select('id').single();
  if (error) return { error: error.message };

  // זריעת שני שלבי ברירת המחדל (ר' migration 0039) - אותה התנהגות
  // בדיוק כמו הסטטוס הקבוע הישן, עד שמנהל בוחר להתאים אישית דרך
  // עמוד "שלבי הקמפיין". רק לקמפיינים רגילים (ברירת המחדל 'outreach') -
  // קמפיין הקדשות לא נוצר דרך הפונקציה הזו בכלל (ר' getOrCreateDedicationCampaign).
  await supabase.from('campaign_stages').insert([
    { campaign_id: data.id, stage_key: 'pending', label: 'ממתין', color_bg: '#fffbeb', color_fg: '#d97706', sort_order: 0 },
    { campaign_id: data.id, stage_key: 'done', label: 'טופל', color_bg: '#f0fdf4', color_fg: '#16a34a', sort_order: 1, is_won_stage: true },
  ]);

  return { success: true, id: data.id };
}

// מחיקת קמפיין - מנהל/בעלים בלבד. campaign_contacts/campaign_stages/
// email_connections.campaign_id כולן on delete cascade (מיגרציות 0032,
// 0039, 0057) - מחיקת השורה היחידה כאן מנקה את הכל, בלי צורך במחיקות
// ידניות נוספות. אנשי הקשר עצמם והתרומות/היסטוריה שלהם לא נוגעים בכלל -
// זו רק הסרת מסגרת-הקמפיין.
export async function deleteCampaign(campaignId) {
  const { supabase, user } = await requireUser();
  if (!campaignId) return { error: 'לא נבחר קמפיין' };
  const { data: campaign } = await supabase.from('campaigns').select('id, workspace_id, name').eq('id', campaignId).single();
  if (!campaign) return { error: 'הקמפיין לא נמצא' };
  const denied = await requireManager(supabase, user.id, campaign.workspace_id);
  if (denied) return denied;

  const { error } = await supabase.from('campaigns').delete().eq('id', campaignId);
  if (error) return { error: error.message };
  return { success: true };
}

// שער-קמפיין לטלפניה - מנהל בלבד. ברירת המחדל false (ר' migration 0096)
// אז כל קמפיין קיים סגור לטלפנים עד שמנהל פותח אותו כאן במפורש.
export async function setCampaignOpenForTelemarketing(campaignId, open) {
  const { supabase, user } = await requireUser();
  const { data: campaign } = await supabase.from('campaigns').select('id, workspace_id').eq('id', campaignId).single();
  if (!campaign) return { error: 'הקמפיין לא נמצא' };
  const denied = await requireManager(supabase, user.id, campaign.workspace_id);
  if (denied) return denied;

  const { error } = await supabase.from('campaigns').update({ open_for_telemarketing: !!open }).eq('id', campaignId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function addContactsToCampaign(campaignId, contactIds) {
  const { supabase, user } = await requireUser();
  if (!campaignId || !Array.isArray(contactIds) || contactIds.length === 0) {
    return { error: 'לא נבחרו אנשי קשר' };
  }

  const { data: campaign } = await supabase
    .from('campaigns').select('id, workspace_id').eq('id', campaignId).single();
  if (!campaign) return { error: 'הקמפיין לא נמצא' };
  const denied = await requireManager(supabase, user.id, campaign.workspace_id);
  if (denied) return denied;

  // ignoreDuplicates - הוספה חוזרת של אותו איש קשר לקמפיין לא יוצרת כפילות
  const { error } = await supabase.from('campaign_contacts').upsert(
    contactIds.map((contactId) => ({ campaign_id: campaignId, contact_id: contactId })),
    { onConflict: 'campaign_id,contact_id', ignoreDuplicates: true },
  );
  if (error) return { error: error.message };
  return { success: true };
}

export async function updateCampaignContact(rowId, changes) {
  const { supabase, user } = await requireUser();
  if (!rowId) return { error: 'לא נבחרה שורה' };

  const { data: row } = await supabase
    .from('campaign_contacts').select('id, campaign_id, assigned_to, campaigns:campaign_id (workspace_id)').eq('id', rowId).single();
  if (!row) return { error: 'השורה לא נמצאה' };
  // נציג שהקמפיין הוקצה לו מותר לו לקדם שלב מכרטיס איש הקשר, לא רק מנהל -
  // בדיוק כמו updateDepartmentStage/updateLeadStage שאין להן guard מנהל
  // בכלל. עדכון category/assignedTo עדיין דורש מנהל (נשלטים דרך עמוד
  // הקמפיין המנוהל-מנהל בלבד).
  if (row.assigned_to !== user.id || changes.category !== undefined || changes.assignedTo !== undefined || changes.inCallQueue !== undefined) {
    const denied = await requireManager(supabase, user.id, row.campaigns?.workspace_id);
    if (denied) return denied;
  }

  const update = {};
  if (changes.category !== undefined) update.category = changes.category || null;
  if (changes.assignedTo !== undefined) update.assigned_to = changes.assignedTo || null;
  if (changes.note !== undefined) update.note = changes.note || null;
  if (changes.responsiblePerson !== undefined) update.responsible_person = changes.responsiblePerson || null;
  if (changes.inCallQueue !== undefined) update.in_call_queue = !!changes.inCallQueue;
  if (changes.status !== undefined) {
    // מוודאים שהערך קיים בפועל כשלב של הקמפיין הזה - מונע "תקיעת" סטטוס
    // יתום אם שלב נמחק/שונה בכרטיסיה אחרת שנשארה פתוחה (campaign_stages
    // הוא free text, לא FK - ר' migration 0039)
    const { count } = await supabase.from('campaign_stages')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', row.campaign_id).eq('stage_key', changes.status);
    if (!count) return { error: 'השלב הזה כבר לא קיים בקמפיין - רענן את העמוד' };
    update.status = changes.status;
  }
  if (Object.keys(update).length === 0) return { success: true };

  const { error } = await supabase.from('campaign_contacts').update(update).eq('id', rowId);
  if (error) return { error: error.message };
  return { success: true };
}

// עדכון-בכמות אמיתי (שאילתת update.in(...) אחת) - בניגוד להרצת
// updateCampaignContact פר-שורה (שקרה בטעות בפועל בכפתורי ה-bulk
// בעבר: Promise.all על handleChange, שהיא פונקציה סינכרונית שלא
// מחזירה promise אמיתי - ה-Promise.all היה נגמר כמעט מיד בלי לחכות
// לשמירה בפועל, ואלפי קריאות-fetch כמעט-בו-זמניות נכשלו בשקט ברובן.
// אומת בפועל: לחיצה על "הוצא מהתור" על 6,174 שורות עדכנה בפועל רק 160
// (קטגוריה אחת קטנה) - שאר הבקשות נעלמו). כאן זו שאילתה יחידה, אמינה.
export async function bulkUpdateCampaignContactsField(campaignId, rowIds, changes) {
  const { supabase, user } = await requireUser();
  if (!campaignId || !Array.isArray(rowIds) || rowIds.length === 0) return { error: 'לא נבחרו שורות' };

  const { data: campaign } = await supabase.from('campaigns').select('id, workspace_id').eq('id', campaignId).single();
  if (!campaign) return { error: 'הקמפיין לא נמצא' };
  const denied = await requireManager(supabase, user.id, campaign.workspace_id);
  if (denied) return denied;

  const hasAny = changes.category !== undefined || changes.assignedTo !== undefined
    || changes.inCallQueue !== undefined || changes.responsiblePerson !== undefined;
  if (!hasAny) return { success: true, updated: 0 };

  // קריאה ל-RPC (0104) ולא update().in('id', rowIds) ישיר - אומת בפועל
  // ש-.in() עם רשימת UUIDs נשלח ב-query string ב-URL ונכשל ("Bad Request")
  // כבר סביב כמה מאות-אלף מזהים, בגלל מגבלת אורך-URL - ה-RPC מקבל את
  // הרשימה במערך בגוף הבקשה (JSON), בלי מגבלת-אורך מעשית.
  const { data: updated, error } = await supabase.rpc('bulk_update_campaign_contacts', {
    p_campaign_id: campaignId,
    p_row_ids: rowIds,
    p_category: changes.category || null, p_has_category: changes.category !== undefined,
    p_assigned_to: changes.assignedTo || null, p_has_assigned_to: changes.assignedTo !== undefined,
    p_in_call_queue: !!changes.inCallQueue, p_has_in_call_queue: changes.inCallQueue !== undefined,
    p_responsible_person: changes.responsiblePerson || null, p_has_responsible_person: changes.responsiblePerson !== undefined,
  });
  if (error) return { error: error.message };
  return { success: true, updated };
}

// ערכים קיימים (לא-ריקים) של הערה/אחראי בקמפיין - לבורר "בחר מתוך רשימה"
// בסינון, בנוסף לחיפוש-טקסט-חופשי הקיים. מוגבל ל-200 ערכים ייחודיים
// כדי לא להציג רשימה בלתי-שמישה על קמפיין עם אלפי הערות שונות.
export async function getDistinctNotesAndResponsible(campaignId) {
  const { supabase, user } = await requireUser();
  const { data: campaign } = await supabase.from('campaigns').select('id, workspace_id').eq('id', campaignId).single();
  if (!campaign) return { error: 'הקמפיין לא נמצא' };
  const denied = await requireManager(supabase, user.id, campaign.workspace_id);
  if (denied) return denied;

  let rows = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.from('campaign_contacts')
      .select('note, responsible_person').eq('campaign_id', campaignId).order('id').range(offset, offset + PAGE - 1);
    if (error) return { error: error.message };
    rows = rows.concat(data || []);
    if (!data || data.length < PAGE) break;
  }
  const notes = Array.from(new Set(rows.map((r) => r.note).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'he')).slice(0, 200);
  const responsiblePeople = Array.from(new Set(rows.map((r) => r.responsible_person).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'he')).slice(0, 200);
  return { success: true, notes, responsiblePeople };
}

export async function removeContactFromCampaign(rowId) {
  const { supabase, user } = await requireUser();
  if (!rowId) return { error: 'לא נבחרה שורה' };

  const { data: row } = await supabase
    .from('campaign_contacts').select('id, campaigns:campaign_id (workspace_id)').eq('id', rowId).single();
  if (!row) return { error: 'השורה לא נמצאה' };
  const denied = await requireManager(supabase, user.id, row.campaigns?.workspace_id);
  if (denied) return denied;

  // הסרה מהקמפיין בלבד - איש הקשר עצמו וכל ההיסטוריה שלו נשארים
  const { error } = await supabase.from('campaign_contacts').delete().eq('id', rowId);
  if (error) return { error: error.message };
  return { success: true };
}

// ============================================================
// מיפוי אנושי - צוות/מתנדבים עוברים על מי שכבר בקמפיין ומסמנים ידע-
// יחסים שהמערכת לא יכולה לדעת לבד (מכיר/לא רלוונטי, קבוצת-אב, הערות,
// הצפי). "גישה מלאה למערכת, בלי בעיה" הוחלט במפורש למיפוי - לכן רק
// requireUser (לא requireManager) על שמירת-החלטה; דף הקמפיין עצמו עדיין
// manager-only ברמת ה-page (page.js) - אם ירצו ממפים שאינם מנהלים,
// זה ידרוש בנפרד לפתוח מסלול-גישה נפרד לטאב המיפוי.
//
// כרטיס-מיפוי אחד בכל פעם: התור הוא כל שורת campaign_contacts עם
// mapping_decision ריק - זו גם מנגנון-מניעת-כפילות בין כמה ממפים
// שעובדים בו-זמנית (ברגע שמישהו שומר החלטה, השורה לא ריקה יותר ונעלמת
// מהתור של האחרים - בלי צורך בנעילה מפורשת).
// ============================================================

export async function getMappingDecisionOptions(workspaceId) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from('picklists').select('id, value, sort_order')
    .eq('list_key', 'mapping_decision').eq('workspace_id', workspaceId).order('sort_order');
  return data || [];
}

// המרה גסה של תווית שנה עברית (כמו תשפ"ה) לתאריך-קצה גרגוריאני משוער -
// לצורך "מתי הייתה האינטראקציה האחרונה" כשכל מה שיש זו שנה עברית טקסטואלית
// (contact_seminar_participations.year / contact_course_enrollments.year_label,
// לא תאריך אמיתי). מנורמל בלי גרש/גרשיים (כל וריאציות הפיסוק) כדי לא
// להיות תלוי באיזה תו-גרש בדיוק נשמר במקור. טווח מכוסה: כל מה שהופיע
// בפועל בייבוא הקורסים/סמינרים עד כה (תשע"ו–תשפ"ח) + שוליים.
const HEBREW_YEAR_APPROX_END = {
  'תשעד': 2014, 'תשעה': 2015, 'תשעו': 2016, 'תשעז': 2017, 'תשעח': 2018, 'תשעט': 2019,
  'תשף': 2020, 'תשפא': 2021, 'תשפב': 2022, 'תשפג': 2023, 'תשפד': 2024, 'תשפה': 2025,
  'תשפו': 2026, 'תשפז': 2027, 'תשפח': 2028, 'תשפט': 2029, 'תשץ': 2030,
};
function approxDateFromHebrewYear(label) {
  const normalized = (label || '').replace(/[""'׳״]/g, '');
  const year = HEBREW_YEAR_APPROX_END[normalized];
  return year ? `${year}-01-01` : null;
}

// אוסף תמונה מלאה חוצת-מחלקות לאיש קשר לצורך כרטיסון-המיפוי - לא משפט
// מכווץ, אלא נתונים גולמיים שהעמוד מציג כשורות נפרדות: מאיזה מחלקות
// הוא מוכר לנו, שנת-השיא שלו (השנה עם סכום התרומה הגבוה ביותר, לא ממוצע -
// אותה הגדרה בדיוק כמו find_campaign_segment_candidates), תאריך תרומה
// אחרונה, וה"אינטראקציה האחרונה" מכל סוג (תרומה/פגישה/פנייה בתאריך
// מדויק, או קורס/סמינר בתאריך משוער משנה עברית - כי אין תאריך מדויק
// לשני אלה במקור).
async function buildContactInsights(supabase, contactId) {
  const [
    { data: deptRows }, { data: seminarRows }, { data: courseRows },
    { count: activeCommitments }, { data: txns }, { data: meetingRows },
  ] = await Promise.all([
    supabase.from('contact_departments').select('workspace_id, extra_fields, workspaces:workspace_id (name)').eq('contact_id', contactId),
    supabase.from('contact_seminar_participations').select('event_type, year').eq('contact_id', contactId),
    supabase.from('contact_course_enrollments').select('course_name, year_label').eq('contact_id', contactId),
    supabase.from('commitments').select('id', { count: 'exact', head: true }).eq('contact_id', contactId).eq('status', 'active'),
    supabase.from('donation_transactions').select('amount, transaction_date').eq('contact_id', contactId),
    supabase.from('meetings').select('meeting_date').eq('contact_id', contactId),
  ]);

  const departments = Array.from(new Set((deptRows || []).map((d) => d.workspaces?.name).filter(Boolean)));
  // מחזור/שנות-לימוד - שדות נוספים ייעודיים למחלקת "ישיבת דעת" בלבד
  // (extra_fields.cohort/study_years, ר' migrations 0073-0075) - "מחזור"
  // עדיין ריק אצל רוב הבוגרים (משימת-השלמה נפרדת, טרם בוצעה), אז מציגים
  // גם "שנות לימוד" (אם יש) כדי שאפשר יהיה להשלים ידנית לפי זה בגיליון.
  const yeshivaDept = (deptRows || []).find((d) => d.workspaces?.name === 'ישיבת דעת');
  const yeshivaCohort = yeshivaDept?.extra_fields?.cohort || '';
  const yeshivaStudyYears = yeshivaDept?.extra_fields?.study_years || '';
  const has5786Course = (courseRows || []).some((c) => c.year_label === 'תשפ"ו');

  const rows = txns || [];
  const totalDonations = { count: rows.length, total: rows.reduce((s, t) => s + Number(t.amount || 0), 0) };
  const lastDonationDate = rows.map((t) => t.transaction_date).filter(Boolean).sort().slice(-1)[0] || null;

  // שנת-שיא - מקבצים סכום לפי שנה קלנדרית, לוקחים את השנה עם הסכום
  // הגבוה ביותר (לא ממוצע-כל-השנים) - עקבי עם ההגדרה שכבר אושרה בבניית-קבוצה.
  const byYear = new Map();
  for (const t of rows) {
    if (!t.transaction_date || !(Number(t.amount) > 0)) continue;
    const year = t.transaction_date.slice(0, 4);
    byYear.set(year, (byYear.get(year) || 0) + Number(t.amount));
  }
  let peakDonation = null;
  for (const [year, amount] of byYear.entries()) {
    if (!peakDonation || amount > peakDonation.amount) peakDonation = { year, amount };
  }

  // כל מועמדי "אינטראקציה" - כל אחד עם תאריך (מדויק או משוער) ותווית.
  const candidates = [];
  if (lastDonationDate) candidates.push({ date: lastDonationDate, label: 'תרומה', exact: true });
  for (const m of meetingRows || []) {
    if (m.meeting_date) candidates.push({ date: m.meeting_date, label: 'פגישה', exact: true });
  }
  for (const s of seminarRows || []) {
    const approx = approxDateFromHebrewYear(s.year);
    if (approx) candidates.push({ date: approx, label: `סמינר (${s.year})`, exact: false });
  }
  for (const c of courseRows || []) {
    const approx = approxDateFromHebrewYear(c.year_label);
    if (approx) candidates.push({ date: approx, label: `קורס${c.course_name ? ` - ${c.course_name}` : ''} (${c.year_label})`, exact: false });
  }
  candidates.sort((a, b) => new Date(b.date) - new Date(a.date));
  const lastInteraction = candidates[0] || null;

  return {
    departments,
    peakDonation,
    lastDonationDate,
    totalDonations,
    hasActiveCommitment: (activeCommitments || 0) > 0,
    coursesCount: (courseRows || []).length,
    seminarsCount: (seminarRows || []).length,
    lastInteraction,
    has5786Course,
    yeshivaCohort,
    yeshivaStudyYears,
  };
}

// עוטפת את buildContactInsights לקריאה ישירה מהלקוח (בניית-קבוצה,
// SegmentFinder.js) - נטענת בעצלנות (lazy) רק כשמרחיבים שורה, בדיוק
// כמו "פירוט שנתי" הקיים - כי בניית-קבוצה יכולה להחזיר עד 500 תוצאות
// בבת אחת, ואי אפשר לחשב את זה (6 שאילתות) לכל השורות מראש.
export async function getSegmentRowInsights(contactId) {
  const { supabase } = await requireUser();
  return buildContactInsights(supabase, contactId);
}

// גרסה-בכמות של buildContactInsights לייצוא-למיפוי-ידני (CSV) - קמפיין
// יכול להכיל 500+ אנשי קשר, אז במקום buildContactInsights פר-איש-קשר
// (6 שאילתות × N, יכול לחטוף timeout/URL-ענק על .in() עם מאות מזהים),
// שולפת הכל בכמה שאילתות-אצווה (chunked ל-150 בכל פעם) ומקבצת ב-JS.
// שולף את כל השורות התואמות ל-contact_id ברשימת ids, בעימוד מלא - בלי
// זה, כל שאילתת .in() עם הרבה contact_id-ים חוזרת חתוכה בשקט ב-1000
// שורות (ברירת המחדל של PostgREST), וכשכמה מהאנשים ב-chunk הזה ביחד
// יש להם הרבה תנועות (donation_transactions בעיקר - נראה בפועל אנשים
// עם עשרות תנועות כל אחד), אנשים אחרים באותו chunk "מאבדים" בשקט את כל
// הנתונים שלהם - בדיוק התופעה שגילינו ("שנת-שיא"/"סה\"כ תרומות" מציגים
// 0 לאנשים שבפירוש תרמו). מסודר לפי id כדי שהעימוד יהיה יציב.
// שולף את כל ערכי-הקטגוריה הקיימים בפועל בקמפיין (לצורך יצירת טאבים) -
// חייב עימוד: קמפיין עם אלפי שורות יכול להחזיר את אותו הערך שוב ושוב
// ב-1000 השורות הראשונות ולפספס קטגוריות שמופיעות רק מאוחר יותר בטבלה.
export async function fetchDistinctCampaignCategories(supabase, campaignId) {
  const categories = new Set();
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.from('campaign_contacts')
      .select('category').eq('campaign_id', campaignId).not('category', 'is', null)
      .order('id').range(offset, offset + PAGE - 1);
    if (error) throw error;
    (data || []).forEach((r) => { if (r.category) categories.add(r.category); });
    if (!data || data.length < PAGE) break;
  }
  return Array.from(categories);
}

async function fetchAllForContactIds(supabase, table, selectStr, ids, extraFilter) {
  let all = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase.from(table).select(selectStr).in('contact_id', ids).order('id').range(offset, offset + PAGE - 1);
    if (extraFilter) q = extraFilter(q);
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await q;
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < PAGE) break;
  }
  return all;
}

async function buildBulkContactInsights(supabase, contactIds) {
  const CHUNK = 150;
  const chunks = [];
  for (let i = 0; i < contactIds.length; i += CHUNK) chunks.push(contactIds.slice(i, i + CHUNK));

  const byContact = {};
  const ensure = (id) => {
    if (!byContact[id]) byContact[id] = { departments: new Set(), seminars: [], courses: [], activeCommitment: false, txns: [], meetings: [], yeshivaExtraFields: null };
    return byContact[id];
  };

  for (const ids of chunks) {
    // eslint-disable-next-line no-await-in-loop
    const [deptRows, seminarRows, courseRows, activeCommitmentRows, txns, meetingRows] = await Promise.all([
      fetchAllForContactIds(supabase, 'contact_departments', 'id, contact_id, extra_fields, workspaces:workspace_id (name)', ids),
      fetchAllForContactIds(supabase, 'contact_seminar_participations', 'id, contact_id, year', ids),
      fetchAllForContactIds(supabase, 'contact_course_enrollments', 'id, contact_id, course_name, year_label', ids),
      fetchAllForContactIds(supabase, 'commitments', 'id, contact_id', ids, (q) => q.eq('status', 'active')),
      fetchAllForContactIds(supabase, 'donation_transactions', 'id, contact_id, amount, transaction_date', ids),
      fetchAllForContactIds(supabase, 'meetings', 'id, contact_id, meeting_date', ids),
    ]);
    for (const d of deptRows || []) {
      if (!d.workspaces?.name) continue;
      const b = ensure(d.contact_id);
      b.departments.add(d.workspaces.name);
      if (d.workspaces.name === 'ישיבת דעת') b.yeshivaExtraFields = d.extra_fields || {};
    }
    for (const s of seminarRows || []) ensure(s.contact_id).seminars.push(s);
    for (const c of courseRows || []) ensure(c.contact_id).courses.push(c);
    for (const c of activeCommitmentRows || []) ensure(c.contact_id).activeCommitment = true;
    for (const t of txns || []) ensure(t.contact_id).txns.push(t);
    for (const m of meetingRows || []) ensure(m.contact_id).meetings.push(m);
  }

  const result = {};
  for (const id of contactIds) {
    const bucket = byContact[id] || { departments: new Set(), seminars: [], courses: [], activeCommitment: false, txns: [], meetings: [], yeshivaExtraFields: null };
    const rows = bucket.txns;
    const totalDonations = { count: rows.length, total: rows.reduce((s, t) => s + Number(t.amount || 0), 0) };
    const lastDonationDate = rows.map((t) => t.transaction_date).filter(Boolean).sort().slice(-1)[0] || null;

    const byYear = new Map();
    for (const t of rows) {
      if (!t.transaction_date || !(Number(t.amount) > 0)) continue;
      const year = t.transaction_date.slice(0, 4);
      byYear.set(year, (byYear.get(year) || 0) + Number(t.amount));
    }
    let peakDonation = null;
    for (const [year, amount] of byYear.entries()) {
      if (!peakDonation || amount > peakDonation.amount) peakDonation = { year, amount };
    }

    const candidates = [];
    if (lastDonationDate) candidates.push({ date: lastDonationDate, label: 'תרומה', exact: true });
    for (const m of bucket.meetings) if (m.meeting_date) candidates.push({ date: m.meeting_date, label: 'פגישה', exact: true });
    for (const s of bucket.seminars) {
      const approx = approxDateFromHebrewYear(s.year);
      if (approx) candidates.push({ date: approx, label: `סמינר (${s.year})`, exact: false });
    }
    for (const c of bucket.courses) {
      const approx = approxDateFromHebrewYear(c.year_label);
      if (approx) candidates.push({ date: approx, label: `קורס${c.course_name ? ` - ${c.course_name}` : ''} (${c.year_label})`, exact: false });
    }
    candidates.sort((a, b) => new Date(b.date) - new Date(a.date));

    result[id] = {
      departments: Array.from(bucket.departments),
      peakDonation,
      lastDonationDate,
      totalDonations,
      hasActiveCommitment: bucket.activeCommitment,
      coursesCount: bucket.courses.length,
      seminarsCount: bucket.seminars.length,
      lastInteraction: candidates[0] || null,
      has5786Course: bucket.courses.some((c) => c.year_label === 'תשפ"ו'),
      yeshivaCohort: bucket.yeshivaExtraFields?.cohort || '',
      yeshivaStudyYears: bucket.yeshivaExtraFields?.study_years || '',
    };
  }
  return result;
}

// עוטפת את buildBulkContactInsights לקריאה מהלקוח - ייצוא-למיפוי-ידני
// (CampaignDetailClient.js, "ייצוא למיפוי ידני") - מחזיר אותה תמונה בדיוק
// שרואים במסך המיפוי, לכל אנשי-הקשר בקמפיין בבת אחת.
export async function getBulkContactInsightsForExport(contactIds) {
  const { supabase } = await requireUser();
  if (!Array.isArray(contactIds) || contactIds.length === 0) return {};
  return buildBulkContactInsights(supabase, contactIds);
}

// כמה אנשי-קשר דומים (שם-משפחה זהה + טלפון/כתובת זהים) שעדיין לא
// מקושרים כבני-זוג - אותו עיקרון-זיהוי שכבר קיים למשפחות ששיתפו טלפון
// (ר' findDuplicates.js), כאן ממוקד לצורך הצעת-קישור בזמן-אמת בתוך המיפוי.
async function findPossibleSpouseMatches(supabase, contact) {
  if (!contact.last) return [];
  const phoneDigits = (contact.phone || '').replace(/\D/g, '').slice(-9);
  const { data: sameLastName } = await supabase
    .from('contacts').select('id, first, last, phone, city, street, related_contact_id')
    .eq('last', contact.last).neq('id', contact.id).is('related_contact_id', null).limit(10);

  return (sameLastName || []).filter((c) => {
    const cDigits = (c.phone || '').replace(/\D/g, '').slice(-9);
    const samePhone = phoneDigits && cDigits && cDigits === phoneDigits;
    const sameAddress = contact.street && c.street && contact.city === c.city && contact.street === c.street;
    return samePhone || sameAddress;
  });
}

// שולף עמוד שלם של כרטיסוני-מיפוי (עד limit, לפי created_at) - כל שורה
// עם mapping_decision ריק, בדיוק כמו שהיה בגרסת "כרטיס אחד בכל פעם" (ר'
// היסטוריית git) אבל בכמות, לטבלה. mapping_decision IS NULL הוא-עצמו
// מנגנון מניעת-הכפילות בין ממפים: ברגע שמישהו שומר החלטה, השורה יוצאת
// מהעמוד של כולם באיטרציה הבאה (עדיין אין נעילה בזמן-אמת בתוך אותו טעינה).
export async function getMappingCards(campaignId, { limit = 30, offset = 0 } = {}) {
  const { supabase } = await requireUser();

  const { data: campaign } = await supabase.from('campaigns').select('workspace_id').eq('id', campaignId).single();
  if (!campaign) return { cards: [], total: 0, decisionOptions: [] };

  const { data: rows, count } = await supabase
    .from('campaign_contacts')
    .select('id, category, contacts:contact_id (id, first, last, phone, email, city, street, related_contact_id)', { count: 'exact' })
    .eq('campaign_id', campaignId)
    .is('mapping_decision', null)
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);

  const validRows = (rows || []).filter((r) => r.contacts);
  const decisionOptions = await getMappingDecisionOptions(campaign.workspace_id);

  const cards = await Promise.all(validRows.map(async (row) => {
    const contact = row.contacts;
    const [insights, possibleSpouses] = await Promise.all([
      buildContactInsights(supabase, contact.id),
      findPossibleSpouseMatches(supabase, contact),
    ]);

    let linkedSpouse = null;
    let spouseAlsoInCampaign = false;
    let spouseRowId = null;
    if (contact.related_contact_id) {
      const { data: spouse } = await supabase.from('contacts').select('id, first, last').eq('id', contact.related_contact_id).maybeSingle();
      linkedSpouse = spouse;
      if (spouse) {
        const { data: spouseRow } = await supabase.from('campaign_contacts').select('id')
          .eq('campaign_id', campaignId).eq('contact_id', spouse.id).maybeSingle();
        spouseAlsoInCampaign = !!spouseRow;
        spouseRowId = spouseRow?.id || null;
      }
    }

    return {
      rowId: row.id, category: row.category, contact, insights,
      linkedSpouse, spouseAlsoInCampaign, spouseRowId, possibleSpouses,
    };
  }));

  return { cards, total: count || 0, decisionOptions };
}

export async function saveMappingDecision(rowId, fields) {
  const { supabase, user } = await requireUser();
  if (!rowId) return { error: 'לא נבחרה שורה' };

  const update = { mapped_by: user.id, mapped_at: new Date().toISOString() };
  if (fields.decision !== undefined) update.mapping_decision = fields.decision || null;
  if (fields.category !== undefined) update.category = fields.category || null;
  if (fields.parentGroup !== undefined) update.mapping_parent_group = fields.parentGroup || null;
  if (fields.noteOwner !== undefined) update.mapping_note_owner = fields.noteOwner || null;
  if (fields.noteRep !== undefined) update.mapping_note_rep = fields.noteRep || null;
  if (fields.expectationBucket !== undefined) update.mapping_expectation_bucket = fields.expectationBucket || null;
  if (fields.expectationNote !== undefined) update.mapping_expectation_note = fields.expectationNote || null;

  const { error } = await supabase.from('campaign_contacts').update(update).eq('id', rowId);
  if (error) return { error: error.message };
  return { success: true };
}

// מקשר שני אנשי-קשר כבני-זוג (related_contact_id דו-כיווני) - אותו
// מנגנון-קישור שכבר קיים ("פיצול כרטיסי-זוג"), כאן עבור זוגות שזוהו
// כדומים אבל מעולם לא קושרו. לא יוצר/מוחק שום כרטיס - רק מקשר קיימים.
export async function linkContactsAsCouple(contactIdA, contactIdB) {
  const { supabase } = await requireUser();
  if (!contactIdA || !contactIdB) return { error: 'חסר איש קשר' };

  const [r1, r2] = await Promise.all([
    supabase.from('contacts').update({ related_contact_id: contactIdB, relation_label: 'בן/בת זוג' }).eq('id', contactIdA),
    supabase.from('contacts').update({ related_contact_id: contactIdA, relation_label: 'בן/בת זוג' }).eq('id', contactIdB),
  ]);
  if (r1.error || r2.error) return { error: (r1.error || r2.error).message };
  return { success: true };
}

// "טיפול משותף" לזוג מקושר - לקמפיין הזה בלבד (לא נוגע בכרטיסים עצמם).
// דו-כיווני: שתי שורות ה-campaign_contacts מצביעות זו על זו, עם אותה הערה.
export async function setJointHandling(rowIdA, rowIdB, note) {
  const { supabase } = await requireUser();
  if (!rowIdA || !rowIdB) return { error: 'חסרה שורת קמפיין' };

  const [r1, r2] = await Promise.all([
    supabase.from('campaign_contacts').update({ joint_handling_with: rowIdB, joint_handling_note: note || null }).eq('id', rowIdA),
    supabase.from('campaign_contacts').update({ joint_handling_with: rowIdA, joint_handling_note: note || null }).eq('id', rowIdB),
  ]);
  if (r1.error || r2.error) return { error: (r1.error || r2.error).message };
  return { success: true };
}

// ============================================================
// בניית קבוצה - מוצא מועמדים לפי הקריטריונים שסוכמו (7 הקבוצות + מיון +
// חיתוך-לפי-כמות), מחריג אוטומטית כל מי שכבר בקמפיין (מנגנון מניעת-
// כפילות), ומוסיף בבחירה-מרובה עם קטגוריה. כל הלוגיקה הכבדה (שנת-שיא,
// הוראת קבע, קורסים/סמינרים) חיה ב-RPC (migration 0083) - PostgREST לא
// יודע לעשות GROUP BY/HAVING מהסוג הזה דרך query builder רגיל.
// ============================================================

export async function getWorkspacesForSegmentFilter() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from('workspaces').select('id, name').order('name');
  return data || [];
}

export async function searchCampaignSegment(campaignId, params) {
  const { supabase, user } = await requireUser();
  const { data: campaign } = await supabase.from('campaigns').select('workspace_id').eq('id', campaignId).single();
  if (!campaign) return { error: 'הקמפיין לא נמצא' };
  const denied = await requireManager(supabase, user.id, campaign.workspace_id);
  if (denied) return denied;

  const { data, error } = await supabase.rpc('find_campaign_segment_candidates', {
    p_source: params.source || null,
    p_stage_workspace_id: params.stageWorkspaceId || null,
    p_stages: Array.isArray(params.stages) && params.stages.length ? params.stages : null,
    p_min_peak_donation: params.minPeakDonation ?? null,
    p_max_peak_donation: params.maxPeakDonation ?? null,
    p_has_active_commitment: params.hasActiveCommitment ?? null,
    p_has_course_enrollment: params.hasCourseEnrollment ?? null,
    p_has_seminar_participation: params.hasSeminarParticipation ?? null,
    p_exclude_donated_within_days: params.excludeDonatedWithinDays ?? null,
    p_donation_date_from: params.donationDateFrom || null,
    p_donation_date_to: params.donationDateTo || null,
    p_exclude_campaign_id: campaignId,
    p_sort_by: params.sortBy || 'name',
    p_sort_dir: params.sortDir || 'asc',
    p_limit: params.limit || 100,
    p_offset: params.offset || 0,
    p_dedupe_couples: !!params.dedupeCouples,
  });
  if (error) return { error: error.message };
  return { success: true, rows: data || [], total: data?.[0]?.total_row_count || 0 };
}

export async function getContactDonationsByYear(contactId) {
  const { supabase } = await requireUser();
  const { data } = await supabase.rpc('contact_donations_by_year', { p_contact_id: contactId });
  return data || [];
}

export async function addContactsToCampaignWithCategory(campaignId, contactIds, category, notesByContactId = {}) {
  const { supabase, user } = await requireUser();
  if (!campaignId || !Array.isArray(contactIds) || contactIds.length === 0) {
    return { error: 'לא נבחרו אנשי קשר' };
  }
  const { data: campaign } = await supabase.from('campaigns').select('id, workspace_id').eq('id', campaignId).single();
  if (!campaign) return { error: 'הקמפיין לא נמצא' };
  const denied = await requireManager(supabase, user.id, campaign.workspace_id);
  if (denied) return denied;

  const { error } = await supabase.from('campaign_contacts').upsert(
    contactIds.map((contactId) => ({
      campaign_id: campaignId,
      contact_id: contactId,
      category: category || null,
      note: notesByContactId[contactId] || null,
    })),
    { onConflict: 'campaign_id,contact_id', ignoreDuplicates: true },
  );
  if (error) return { error: error.message };
  return { success: true };
}

// עדכון-בכמות אחרי מיפוי ידני חיצוני (ייצוא ל-CSV, עריכה ביד/באקסל,
// חזרה לכאן) - כל updates[i] הוא {rowId, category?, assignedTo?, status?}
// (rowId הוא המפתח היחיד שסומכים עליו, לא שם/טלפון - נשלף מתוך הקובץ
// שכבר יוצא ממערכת זו). בדיקת הרשאה אחת בתחילת הפעולה (לא לכל שורה,
// בשונה מ-updateCampaignContact שנקראת מהטבלה האינטראקטיבית שורה-שורה).
export async function bulkUpdateCampaignContactsFromImport(campaignId, updates) {
  const { supabase, user } = await requireUser();
  if (!campaignId || !Array.isArray(updates) || updates.length === 0) return { error: 'אין נתונים לעדכון' };

  const { data: campaign } = await supabase.from('campaigns').select('id, workspace_id').eq('id', campaignId).single();
  if (!campaign) return { error: 'הקמפיין לא נמצא' };
  const denied = await requireManager(supabase, user.id, campaign.workspace_id);
  if (denied) return denied;

  const { data: validStages } = await supabase.from('campaign_stages').select('stage_key').eq('campaign_id', campaignId);
  const validStageKeys = new Set((validStages || []).map((s) => s.stage_key));

  let updated = 0;
  let skipped = 0;
  for (const u of updates) {
    if (!u || !u.rowId) { skipped++; continue; }
    const patch = {};
    if (u.category !== undefined) patch.category = u.category || null;
    if (u.assignedTo !== undefined) patch.assigned_to = u.assignedTo || null;
    if (u.status !== undefined && validStageKeys.has(u.status)) patch.status = u.status;
    if (u.note !== undefined) patch.note = u.note || null;
    if (u.responsiblePerson !== undefined) patch.responsible_person = u.responsiblePerson || null;
    // עדכון-מיפוי (מגיע מסנכרון-גיליון, ר' pullCampaignUpdatesFromSheet) -
    // אותם ערכים בדיוק שכבר נשמרים דרך saveMappingDecision.
    if (u.mappingDecision !== undefined && u.mappingDecision) {
      patch.mapping_decision = u.mappingDecision;
      patch.mapped_by = user.id;
      patch.mapped_at = new Date().toISOString();
    }
    if (Object.keys(patch).length === 0) { skipped++; continue; }
    const { error } = await supabase.from('campaign_contacts').update(patch).eq('id', u.rowId).eq('campaign_id', campaignId);
    if (error) { skipped++; continue; }
    updated++;
  }
  return { success: true, updated, skipped };
}

// ============================================================
// חיבור Google Sheet לקמפיין - שיתוף-חי דרך הגיליון עצמו (Google כבר
// תומך בעריכה-משותפת-בזמן-אמת), בלי cron/webhook אוטומטי - שני כפתורים:
// "דחוף" (מוסיף שורות חדשות לגיליון, לעולם לא דורס שורה קיימת - כדי לא
// לאבד עריכות שכבר נעשו שם) ו-"משוך" (קורא את כל הגיליון ומעדכן את
// הקמפיין, דרך אותה bulkUpdateCampaignContactsFromImport בדיוק כמו ייבוא-
// CSV, רק עם מקור-נתונים שונה).
// ============================================================

async function loadAgentsForWorkspace(supabase, workspaceId) {
  const { data: members } = await supabase.from('workspace_members').select('user_id').eq('workspace_id', workspaceId);
  const ids = (members || []).map((m) => m.user_id);
  if (ids.length === 0) return [];
  const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', ids);
  return profiles || [];
}

export async function getCampaignSheetConnection(campaignId) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from('campaign_sheet_connections')
    .select('spreadsheet_url, last_pushed_at, last_pulled_at').eq('campaign_id', campaignId).maybeSingle();
  return { configured: isGoogleSheetsConfigured(), connection: data || null };
}

export async function disconnectCampaignSheet(campaignId) {
  const { supabase, user } = await requireUser();
  const { data: campaign } = await supabase.from('campaigns').select('workspace_id').eq('id', campaignId).single();
  if (!campaign) return { error: 'הקמפיין לא נמצא' };
  const denied = await requireManager(supabase, user.id, campaign.workspace_id);
  if (denied) return denied;
  await supabase.from('campaign_sheet_connections').delete().eq('campaign_id', campaignId);
  return { success: true };
}

function insightsToSheetCells(insights) {
  if (!insights) return ['', '', '', '', '', '', '', '', '', '', '', ''];
  const {
    departments, peakDonation, lastDonationDate, totalDonations, hasActiveCommitment, coursesCount, seminarsCount, lastInteraction,
    has5786Course, yeshivaCohort, yeshivaStudyYears,
  } = insights;
  return [
    departments.join(', '),
    peakDonation ? peakDonation.year : '',
    peakDonation ? Math.round(peakDonation.amount) : '',
    totalDonations.count || 0,
    totalDonations.total ? Math.round(totalDonations.total) : 0,
    lastDonationDate ? new Date(lastDonationDate).toLocaleDateString('he-IL') : '',
    lastInteraction ? `${lastInteraction.label}${lastInteraction.exact ? '' : ' (משוער)'} · ${new Date(lastInteraction.date).toLocaleDateString('he-IL')}` : '',
    hasActiveCommitment ? 'כן' : 'לא',
    `${coursesCount || 0} קורסים, ${seminarsCount || 0} סמינרים`,
    has5786Course ? 'כן' : 'לא',
    yeshivaCohort || '',
    yeshivaStudyYears || '',
  ];
}

// יוצר לשוניות-תצוגה חדשות לכל קטגוריה בפועל של הקמפיין שעדיין אין לה
// טאב (למשל אחרי שנבנו קבוצות נוספות אחרי החיבור הראשוני לגיליון) -
// אידמפוטנטי, אפשר להריץ שוב ושוב בלי לשכפל טאבים קיימים.
export async function regenerateCategoryTabs(campaignId) {
  const { supabase, user } = await requireUser();
  const { data: campaign } = await supabase.from('campaigns').select('workspace_id').eq('id', campaignId).single();
  if (!campaign) return { error: 'הקמפיין לא נמצא' };
  const denied = await requireManager(supabase, user.id, campaign.workspace_id);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data: conn } = await admin.from('campaign_sheet_connections').select('*').eq('campaign_id', campaignId).maybeSingle();
  if (!conn) return { error: 'אין גיליון מחובר לקמפיין הזה' };

  let accessToken;
  try { accessToken = await getSheetsAccessToken(conn.refresh_token); } catch (e) { return { error: e.message }; }

  const categoryOptions = await fetchDistinctCampaignCategories(supabase, campaignId);
  if (categoryOptions.length === 0) return { success: true, created: 0 };

  try {
    const existingTitles = await getSpreadsheetSheetTitles(accessToken, conn.spreadsheet_id);
    const before = existingTitles.size;
    await addCategoryViewTabs(accessToken, conn.spreadsheet_id, conn.sheet_title, categoryOptions, existingTitles);
    const after = await getSpreadsheetSheetTitles(accessToken, conn.spreadsheet_id);
    return { success: true, created: after.size - before };
  } catch (e) {
    return { error: e.message };
  }
}

export async function pushCampaignRowsToSheet(campaignId) {
  const { supabase, user } = await requireUser();
  const { data: campaign } = await supabase.from('campaigns').select('workspace_id').eq('id', campaignId).single();
  if (!campaign) return { error: 'הקמפיין לא נמצא' };
  const denied = await requireManager(supabase, user.id, campaign.workspace_id);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data: conn } = await admin.from('campaign_sheet_connections').select('*').eq('campaign_id', campaignId).maybeSingle();
  if (!conn) return { error: 'אין גיליון מחובר לקמפיין הזה' };

  let accessToken;
  try { accessToken = await getSheetsAccessToken(conn.refresh_token); } catch (e) { return { error: e.message }; }

  // שולף את כל השורות שכבר בגיליון (מזהה-שורה בעמודה הראשונה) - כדי
  // לדעת מה לדלג עליו, ולא לשכפל שורות/לדרוס עריכות שכבר שם.
  let existingIds;
  try {
    const values = await getSheetValues(accessToken, conn.spreadsheet_id, conn.sheet_title);
    existingIds = new Set(values.slice(1).map((r) => r[0]).filter(Boolean));
  } catch (e) { return { error: e.message }; }

  // ה-select הזה נוגע בפוטנציאל בכל שורות הקמפיין (יכול לעבור בקלות 1000
  // אנשי-קשר) - חייב עימוד מפורש, אחרת PostgREST חותך שקט ב-1000 ורק חלק
  // מהקמפיין נדחף לגיליון (זו בדיוק התקלה שדווחה: רק 1000 שורות בגיליון).
  let rows = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.from('campaign_contacts')
      .select('id, category, assigned_to, status, note, in_call_queue, responsible_person, contacts:contact_id (id, first, last, phone, email, related_contact_id)')
      .eq('campaign_id', campaignId)
      .order('id')
      .range(offset, offset + PAGE - 1);
    if (error) return { error: error.message };
    rows = rows.concat(data || []);
    if (!data || data.length < PAGE) break;
  }
  const newRows = rows.filter((r) => r.contacts && !existingIds.has(r.id));
  if (newRows.length === 0) return { success: true, pushed: 0 };

  const spouseIds = Array.from(new Set(newRows.map((r) => r.contacts.related_contact_id).filter(Boolean)));
  const [agents, { data: stages }, insightsByContact, spouseNameById] = await Promise.all([
    loadAgentsForWorkspace(supabase, campaign.workspace_id),
    supabase.from('campaign_stages').select('stage_key, label').eq('campaign_id', campaignId),
    buildBulkContactInsights(supabase, newRows.map((r) => r.contacts.id)),
    spouseIds.length
      ? supabase.from('contacts').select('id, first, last').in('id', spouseIds)
        .then(({ data }) => Object.fromEntries((data || []).map((c) => [c.id, `${c.first || ''} ${c.last || ''}`.trim()])))
      : Promise.resolve({}),
  ]);
  const agentNameById = Object.fromEntries(agents.map((a) => [a.id, a.name]));
  const stageLabelByKey = Object.fromEntries((stages || []).map((s) => [s.stage_key, s.label]));

  const sheetRows = newRows.map((r) => [
    r.id, `${r.contacts.first || ''} ${r.contacts.last || ''}`.trim(), r.contacts.phone || '', r.contacts.email || '',
    r.category || '', r.assigned_to ? (agentNameById[r.assigned_to] || '') : '', stageLabelByKey[r.status] || r.status || '',
    r.in_call_queue !== false ? 'כן' : 'לא', '',
    ...insightsToSheetCells(insightsByContact[r.contacts.id]),
    r.note || '', r.responsible_person || '', r.contacts.related_contact_id ? (spouseNameById[r.contacts.related_contact_id] || '') : '',
  ]);

  try {
    await appendRows(accessToken, conn.spreadsheet_id, conn.sheet_title, sheetRows);
  } catch (e) { return { error: e.message }; }

  await admin.from('campaign_sheet_connections').update({ last_pushed_at: new Date().toISOString() }).eq('id', conn.id);
  return { success: true, pushed: sheetRows.length };
}

export async function pullCampaignUpdatesFromSheet(campaignId) {
  const { supabase, user } = await requireUser();
  const { data: campaign } = await supabase.from('campaigns').select('workspace_id').eq('id', campaignId).single();
  if (!campaign) return { error: 'הקמפיין לא נמצא' };
  const denied = await requireManager(supabase, user.id, campaign.workspace_id);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data: conn } = await admin.from('campaign_sheet_connections').select('*').eq('campaign_id', campaignId).maybeSingle();
  if (!conn) return { error: 'אין גיליון מחובר לקמפיין הזה' };

  let accessToken;
  try { accessToken = await getSheetsAccessToken(conn.refresh_token); } catch (e) { return { error: e.message }; }

  let values;
  try { values = await getSheetValues(accessToken, conn.spreadsheet_id, conn.sheet_title); } catch (e) { return { error: e.message }; }
  if (values.length < 2) return { success: true, updated: 0, skipped: 0 };

  const header = values[0];
  const idx = {
    rowId: header.indexOf(CAMPAIGN_SHEET_HEADER_ROW[0]),
    category: header.indexOf('קטגוריה'),
    assignedTo: header.indexOf('נציג מטפל'),
    status: header.indexOf('סטטוס'),
    mappingDecision: header.indexOf('החלטת מיפוי'),
    note: header.indexOf('הערה'),
    responsiblePerson: header.indexOf('אחראי'),
  };

  const [agents, { data: stages }] = await Promise.all([
    loadAgentsForWorkspace(supabase, campaign.workspace_id),
    supabase.from('campaign_stages').select('stage_key, label').eq('campaign_id', campaignId),
  ]);
  const agentIdByName = Object.fromEntries(agents.map((a) => [a.name, a.id]));
  const stageKeyByLabel = Object.fromEntries((stages || []).map((s) => [s.label, s.stage_key]));

  const updates = values.slice(1).map((cells) => {
    const rowId = (cells[idx.rowId] || '').trim();
    if (!rowId) return null;
    const patch = { rowId };
    if (idx.category !== -1) patch.category = (cells[idx.category] || '').trim();
    if (idx.assignedTo !== -1) {
      const name = (cells[idx.assignedTo] || '').trim();
      patch.assignedTo = name ? (agentIdByName[name] || null) : null;
    }
    if (idx.status !== -1) {
      const label = (cells[idx.status] || '').trim();
      const stageKey = stageKeyByLabel[label];
      if (stageKey) patch.status = stageKey;
    }
    if (idx.mappingDecision !== -1) {
      const decision = (cells[idx.mappingDecision] || '').trim();
      if (decision) patch.mappingDecision = decision;
    }
    if (idx.note !== -1) patch.note = (cells[idx.note] || '').trim();
    if (idx.responsiblePerson !== -1) patch.responsiblePerson = (cells[idx.responsiblePerson] || '').trim();
    return patch;
  }).filter(Boolean);

  if (updates.length === 0) return { success: true, updated: 0, skipped: 0 };
  const res = await bulkUpdateCampaignContactsFromImport(campaignId, updates);
  if (res?.error) return res;
  await admin.from('campaign_sheet_connections').update({ last_pulled_at: new Date().toISOString() }).eq('id', conn.id);
  return res;
}
