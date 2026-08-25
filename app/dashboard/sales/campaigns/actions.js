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

// בונה משפט-סיכום חוצה-מחלקות לאיש קשר - לא רק ההקשר הצר של הקטגוריה
// שהוא נכנס דרכה, אלא תמונה כוללת: "השתתף ב-2 קורסים והשתתף בסמינר".
// שאילתות זולות (רק ספירה), מספיק להקשר-מהיר בכרטיסון-המיפוי.
async function buildContactSummarySentence(supabase, contactId) {
  const [{ count: courseCount }, { count: seminarCount }, { count: activeCommitments }, { data: txns }] = await Promise.all([
    supabase.from('contact_course_enrollments').select('id', { count: 'exact', head: true }).eq('contact_id', contactId),
    supabase.from('contact_seminar_participations').select('id', { count: 'exact', head: true }).eq('contact_id', contactId),
    supabase.from('commitments').select('id', { count: 'exact', head: true }).eq('contact_id', contactId).eq('status', 'active'),
    supabase.from('donation_transactions').select('amount, transaction_date').eq('contact_id', contactId),
  ]);

  const parts = [];
  if (courseCount > 0) parts.push(`השתתף ב-${courseCount} קורס${courseCount > 1 ? 'ים' : ''}`);
  if (seminarCount > 0) parts.push(`השתתף בסמינר${seminarCount > 1 ? 'ים' : ''}`);
  if (activeCommitments > 0) parts.push('הוראת קבע פעילה');
  const rows = txns || [];
  if (rows.length > 0) {
    const total = rows.reduce((s, t) => s + Number(t.amount || 0), 0);
    const lastDate = rows.map((t) => t.transaction_date).filter(Boolean).sort().slice(-1)[0];
    parts.push(`${rows.length} תרומות (סה"כ ₪${Math.round(total).toLocaleString('he-IL')}${lastDate ? `, אחרונה ${new Date(lastDate).toLocaleDateString('he-IL')}` : ''})`);
  }
  return parts.length ? parts.join(' · ') : 'אין היסטוריה נוספת רשומה';
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

// שולף כרטיסון-מיפוי אחד - השורה הראשונה (לפי סדר-קטגוריות שכבר בקמפיין)
// עם mapping_decision ריק. מחזיר null כשאין יותר מה למפות.
// skipIds - שורות שהממפה כבר "דילג" עליהן בסבב הנוכחי (בצד-לקוח, ר'
// MappingQueue.js). דילוג לא שומר שום החלטה ב-DB (בכוונה - זה ההבדל
// בין "דלג" ל"לא רלוונטי") - הן "עוברות לסוף התור": קודם מציגים את כל
// מי שעדיין לא נראה בכלל בסבב הזה, ורק אחרי שאלה נגמרים חוזרים למי
// שדולג עליו (לפי הסדר שדולג בו). ברענון-עמוד/סשן חדש הדילוגים "נשכחים"
// לגמרי והתור חוזר למצב המקורי.
export async function getNextMappingCard(campaignId, skipIds = []) {
  const { supabase } = await requireUser();

  const { data: campaign } = await supabase.from('campaigns').select('workspace_id').eq('id', campaignId).single();
  if (!campaign) return null;

  const baseQuery = () => supabase
    .from('campaign_contacts')
    .select('id, category, contacts:contact_id (id, first, last, phone, email, city, street, related_contact_id)')
    .eq('campaign_id', campaignId)
    .is('mapping_decision', null)
    .order('created_at', { ascending: true })
    .limit(1);

  let row = null;
  if (skipIds.length > 0) {
    const { data: fresh } = await baseQuery().not('id', 'in', `(${skipIds.join(',')})`).maybeSingle();
    row = fresh;
    if (!row) {
      // אין יותר "טריים" - חוזרים למי שדולג עליו, לפי סדר-הדילוג (סוף
      // התור). PostgREST לא תומך במיון-לפי-סדר-מערך שרירותי, אז שולפים
      // את כולם (רשימה קטנה, כבר מוגבלת ל-skipIds) וממיינים בג'אווהסקריפט
      // לפי המיקום המקורי ב-skipIds.
      const { data: skippedRows } = await supabase
        .from('campaign_contacts')
        .select('id, category, contacts:contact_id (id, first, last, phone, email, city, street, related_contact_id)')
        .eq('campaign_id', campaignId)
        .is('mapping_decision', null)
        .in('id', skipIds);
      row = (skippedRows || []).sort((a, b) => skipIds.indexOf(a.id) - skipIds.indexOf(b.id))[0] || null;
    }
  } else {
    const { data } = await baseQuery().maybeSingle();
    row = data;
  }
  if (!row || !row.contacts) return null;

  const contact = row.contacts;
  const [summary, spouseMatches, decisionOptions] = await Promise.all([
    buildContactSummarySentence(supabase, contact.id),
    findPossibleSpouseMatches(supabase, contact),
    getMappingDecisionOptions(campaign.workspace_id),
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
    rowId: row.id,
    category: row.category,
    contact,
    summary,
    linkedSpouse,
    spouseAlsoInCampaign,
    spouseRowId,
    possibleSpouses: spouseMatches,
    decisionOptions,
  };
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
