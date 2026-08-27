'use server';

import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfWorkspace } from '../../lib/contactGuards';

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
  if (row.assigned_to !== user.id || changes.category !== undefined || changes.assignedTo !== undefined) {
    const denied = await requireManager(supabase, user.id, row.campaigns?.workspace_id);
    if (denied) return denied;
  }

  const update = {};
  if (changes.category !== undefined) update.category = changes.category || null;
  if (changes.assignedTo !== undefined) update.assigned_to = changes.assignedTo || null;
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
    supabase.from('contact_departments').select('workspace_id, workspaces:workspace_id (name)').eq('contact_id', contactId),
    supabase.from('contact_seminar_participations').select('event_type, year').eq('contact_id', contactId),
    supabase.from('contact_course_enrollments').select('course_name, year_label').eq('contact_id', contactId),
    supabase.from('commitments').select('id', { count: 'exact', head: true }).eq('contact_id', contactId).eq('status', 'active'),
    supabase.from('donation_transactions').select('amount, transaction_date').eq('contact_id', contactId),
    supabase.from('meetings').select('meeting_date').eq('contact_id', contactId),
  ]);

  const departments = Array.from(new Set((deptRows || []).map((d) => d.workspaces?.name).filter(Boolean)));

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
  });
  if (error) return { error: error.message };
  return { success: true, rows: data || [], total: data?.[0]?.total_row_count || 0 };
}

export async function getContactDonationsByYear(contactId) {
  const { supabase } = await requireUser();
  const { data } = await supabase.rpc('contact_donations_by_year', { p_contact_id: contactId });
  return data || [];
}

export async function addContactsToCampaignWithCategory(campaignId, contactIds, category) {
  const { supabase, user } = await requireUser();
  if (!campaignId || !Array.isArray(contactIds) || contactIds.length === 0) {
    return { error: 'לא נבחרו אנשי קשר' };
  }
  const { data: campaign } = await supabase.from('campaigns').select('id, workspace_id').eq('id', campaignId).single();
  if (!campaign) return { error: 'הקמפיין לא נמצא' };
  const denied = await requireManager(supabase, user.id, campaign.workspace_id);
  if (denied) return denied;

  const { error } = await supabase.from('campaign_contacts').upsert(
    contactIds.map((contactId) => ({ campaign_id: campaignId, contact_id: contactId, category: category || null })),
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
    if (Object.keys(patch).length === 0) { skipped++; continue; }
    const { error } = await supabase.from('campaign_contacts').update(patch).eq('id', u.rowId).eq('campaign_id', campaignId);
    if (error) { skipped++; continue; }
    updated++;
  }
  return { success: true, updated, skipped };
}
