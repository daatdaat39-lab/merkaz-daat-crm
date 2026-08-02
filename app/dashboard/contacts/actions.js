'use server';

import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { redirect } from 'next/navigation';
import { getPipeline, STAGE_LABELS } from '../components/pipelines';
import { findExistingMatch, upsertDepartmentMembership, bulkImportContactRows } from './leadIntakeCore';
import { isManagerOfAnyDepartment, isManagerOfWorkspace, isManagerOfAnyWorkspace, requireNotFrozen } from '../lib/contactGuards';
import { getAccessToken } from '../../../lib/gmail/client';
import { sendEmail } from '../../../lib/gmail/send';
import { sendWhatsAppTemplate, sendWhatsAppChat } from '../../../lib/inforu/whatsapp';
import { summarizeContact } from '../../../lib/ai/summarizeContact';

const EDITABLE_FIELDS = ['first', 'last', 'phone', 'phone2', 'email', 'email2', 'dept', 'source', 'idnum', 'birth_date', 'gender', 'related_contact_id', 'relation_label'];

function parseTags(raw) {
  if (typeof raw !== 'string') return [];
  return raw.split(',').map((t) => t.trim()).filter(Boolean);
}

async function requireUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

// רישום שורה ביומן השינויים (audit log) של פעולות ניהול על איש קשר -
// contact_name הוא צילום מצב של השם בזמן הפעולה, כי contact_id לבדו
// לא מספיק לזיהוי אחרי שהכרטיס עצמו כבר נמחק
async function logContactAudit(supabase, userId, contactId, contactName, action, detail) {
  await supabase.from('contact_audit_log').insert({
    contact_id: contactId, contact_name: contactName, action, detail: detail || null, performed_by: userId,
  });
}

async function currentWorkspace(supabase, user) {
  const { data: profile } = await supabase
    .from('profiles').select('current_workspace_id, workspaces:current_workspace_id (name)').eq('id', user.id).single();
  return { id: profile?.current_workspace_id || null, name: profile?.workspaces?.name || null };
}

// מחלקה מפורשת שנבחרה בטופס (במקום להניח שזו תמיד ה-workspace הפעיל של היוצר)
async function resolveTargetWorkspace(supabase, user, explicitId) {
  if (!explicitId) return currentWorkspace(supabase, user);
  const { data } = await supabase.from('workspaces').select('id, name').eq('id', explicitId).single();
  return data ? { id: data.id, name: data.name } : currentWorkspace(supabase, user);
}

// אחרי הוספת/שיוך ליד למחלקה שונה מזו שהמשתמש נמצא בה כרגע, מעביר אותו
// אליה אוטומטית - אבל רק אם יש לו באמת חברות שם (אחרת הוא ייחסם עם
// "אין לך גישה למחלקה זו" כשהוא מגיע לשם)
async function maybeSwitchActiveWorkspace(supabase, user, targetWorkspaceId) {
  const { data: profile } = await supabase.from('profiles').select('current_workspace_id').eq('id', user.id).single();
  if (profile?.current_workspace_id === targetWorkspaceId) return;

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('workspace_id', targetWorkspaceId)
    .single();

  if (membership) {
    await supabase.from('profiles').update({ current_workspace_id: targetWorkspaceId }).eq('id', user.id);
  }
}

export async function listWorkspaces() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from('workspaces').select('id, name').order('created_at', { ascending: true });
  return data || [];
}

// כל התגיות שכבר בשימוש במערכת (לרשימה הנפתחת בטופס תגיות)
export async function listAllTags() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from('contacts').select('tags');
  const set = new Set();
  (data || []).forEach((c) => (c.tags || []).forEach((t) => set.add(t)));
  return Array.from(set).sort();
}

// בדיקה "רכה" לפני יצירה - מציגה למשתמש התאמות אפשריות (כולל שם דומה, לא
// רק התאמה מדויקת) כדי שהוא יאשר בעצמו אם זה אותו אדם, במקום מיזוג שקט
export async function checkPossibleDuplicates({ first, last, phone, email, idnum }) {
  const { supabase } = await requireUser();
  const selectCols = 'id, first, last, idnum, phone, phone2, email, source, dept, tags, contact_departments (stage, workspaces:workspace_id (name))';

  // שאילתות נפרדות ומפורמטות במקום .or() בנוי ממחרוזת - .or() מפרש
  // פסיקים/סוגריים בערך כתחביר, לא כתווים מילוליים, ולא בטוח כשהערך
  // מגיע מקלט חופשי
  const queries = [];
  if (idnum) queries.push(supabase.from('contacts').select(selectCols).eq('idnum', idnum).limit(5));
  if (phone) queries.push(supabase.from('contacts').select(selectCols).eq('phone', phone).limit(5));
  if (email) queries.push(supabase.from('contacts').select(selectCols).eq('email', email).limit(5));
  if (first && first.trim().length >= 2) {
    const f = first.trim();
    const l = (last || '').trim();
    let nameQuery = supabase.from('contacts').select(selectCols).ilike('first', `%${f}%`);
    if (l) nameQuery = nameQuery.ilike('last', `%${l}%`);
    queries.push(nameQuery.limit(5));
  }
  if (queries.length === 0) return [];

  const results = await Promise.all(queries);
  const byId = new Map();
  for (const { data } of results) {
    for (const row of data || []) {
      if (!byId.has(row.id)) byId.set(row.id, row);
    }
  }
  const data = Array.from(byId.values()).slice(0, 5);

  return data.map((c) => ({
    id: c.id, first: c.first, last: c.last, idnum: c.idnum, phone: c.phone, phone2: c.phone2,
    email: c.email, source: c.source, dept: c.dept, tags: c.tags || [],
    departments: (c.contact_departments || [])
      .filter((d) => d.workspaces?.name)
      .map((d) => ({ name: d.workspaces.name, stage: d.stage, stageLabel: STAGE_LABELS[d.stage] || d.stage })),
  }));
}

// שיוך ליד חדש לאיש קשר קיים, אחרי שהמשתמש בחר ידנית שדה-שדה מה להשאיר
// (resolvedFields: אובייקט רגיל עם הערכים הסופיים שנבחרו, לא FormData)
export async function mergeResolvedLead(existingId, resolvedFields, workspaceId, reason, reasonNote) {
  const { supabase, user } = await requireUser();
  const frozenError = await requireNotFrozen(supabase, existingId);
  if (frozenError) return frozenError;

  const workspace = await resolveTargetWorkspace(supabase, user, workspaceId);
  if (!workspace.id) return { error: 'לא נמצא workspace פעיל' };

  const update = { tags: resolvedFields.tags || [] };
  for (const field of EDITABLE_FIELDS) {
    if (field in resolvedFields) update[field] = resolvedFields[field] || null;
  }

  const { error } = await supabase.from('contacts').update(update).eq('id', existingId);
  if (error) return { error: error.message };

  await upsertDepartmentMembership(supabase, existingId, workspace, reason, reasonNote);
  await maybeSwitchActiveWorkspace(supabase, user, workspace.id);
  redirect(`/dashboard/contacts/${existingId}`);
}

// עדכון פרטי איש קשר - כל משתמש מחובר יכול (contacts משותפים לכולם)
export async function updateContact(contactId, formData) {
  const { supabase } = await requireUser();
  const frozenError = await requireNotFrozen(supabase, contactId);
  if (frozenError) return frozenError;

  const update = {};
  for (const field of EDITABLE_FIELDS) {
    if (formData.has(field)) update[field] = formData.get(field) || null;
  }
  if (formData.has('tags')) update.tags = parseTags(formData.get('tags'));

  const { error } = await supabase.from('contacts').update(update).eq('id', contactId);
  if (error) return { error: error.message };

  return { success: true };
}

// הוספת תגית בודדת מהתפריט הנפתח המהיר (מחוץ למצב עריכה מלא)
export async function addContactTag(contactId, tag) {
  const { supabase } = await requireUser();
  const frozenError = await requireNotFrozen(supabase, contactId);
  if (frozenError) return frozenError;

  const t = (tag || '').trim();
  if (!t) return { error: 'תגית ריקה' };

  const { data: existing, error: fetchError } = await supabase.from('contacts').select('tags').eq('id', contactId).single();
  if (fetchError) return { error: fetchError.message };

  const tags = Array.from(new Set([...(existing?.tags || []), t]));
  const { error } = await supabase.from('contacts').update({ tags }).eq('id', contactId);
  if (error) return { error: error.message };

  return { success: true, tags };
}

// סיכום AI של מצב איש הקשר - לפי הערות פנימיות והיסטוריית פעילות בפועל
// (במקום להמתין לחיבור הקלטות שיחה, שעדיין לא קיים במערכת)
export async function getAiContactSummary(contactId) {
  const { supabase } = await requireUser();

  const [{ data: contact }, { data: departmentRows }, { data: meetings }, { data: tasks }, { data: sentEmails }, { data: sentWhatsapp }] = await Promise.all([
    supabase.from('contacts').select('first, last, notes').eq('id', contactId).single(),
    supabase.from('contact_departments').select('lead_inquiries (reason, note)').eq('contact_id', contactId),
    supabase.from('meetings').select('title, notes').eq('contact_id', contactId),
    supabase.from('tasks').select('title, done').eq('contact_id', contactId),
    supabase.from('sent_emails').select('subject').eq('contact_id', contactId),
    supabase.from('sent_whatsapp').select('direction, kind, message, reason').eq('contact_id', contactId),
  ]);
  if (!contact) return { error: 'איש קשר לא נמצא' };

  const inquiryRows = (departmentRows || []).flatMap((d) => d.lead_inquiries || []);

  try {
    const summary = await summarizeContact({
      name: `${contact.first} ${contact.last}`,
      notes: contact.notes,
      inquiries: inquiryRows,
      meetings: meetings || [],
      tasks: tasks || [],
      sentEmails: sentEmails || [],
      sentWhatsapp: sentWhatsapp || [],
    });
    return { success: true, summary };
  } catch (e) {
    return { error: e.message };
  }
}

// עדכון הערות חופשיות על איש קשר - בלי redirect כדי שאפשר לקרוא לזה
// גם מתוך הכרטיס הצף (modal), לא רק מהעמוד המלא
export async function updateContactNotes(contactId, notes) {
  const { supabase } = await requireUser();
  const frozenError = await requireNotFrozen(supabase, contactId);
  if (frozenError) return frozenError;

  const { error } = await supabase.from('contacts').update({ notes, last_activity_at: new Date().toISOString() }).eq('id', contactId);
  if (error) return { error: error.message };

  return { success: true };
}

// האם המשתמש הנוכחי owner/admin באחת המחלקות של איש הקשר - קובע אם
// יראה את פריטי הניהול בתפריט ההגדרות (הקפאה/מיזוג/מחיקה)
export async function canManageContact(contactId) {
  const { supabase, user } = await requireUser();
  return isManagerOfAnyDepartment(supabase, user.id, contactId);
}

// הקפאה/הפשרה של איש קשר - רק owner/admin של אחת מהמחלקות שלו.
// בכוונה לא בודקים requireNotFrozen כאן - אחרת אף אחד לא יוכל להפשיר
export async function setContactFrozen(contactId, frozen) {
  const { supabase, user } = await requireUser();
  const allowed = await isManagerOfAnyDepartment(supabase, user.id, contactId);
  if (!allowed) return { error: 'רק מנהל של אחת ממחלקות איש הקשר יכול להקפיא/להפשיר' };

  const { data: contact } = await supabase.from('contacts').select('first, last').eq('id', contactId).single();
  const { error } = await supabase.from('contacts').update({ frozen }).eq('id', contactId);
  if (error) return { error: error.message };
  await logContactAudit(supabase, user.id, contactId, contact ? `${contact.first} ${contact.last}` : '', frozen ? 'הקפאה' : 'הפשרה');
  return { success: true, frozen };
}

// יצירת ליד/איש קשר חדש (ידני) - משויך למחלקה שנבחרה בטופס.
// לפני היצירה מחפש התאמה קיימת (ת"ז/טלפון/מייל) - אם נמצאה, לא נוצר כרטיס
// כפול: לאיש הקיים פשוט מתווסף שיוך למחלקה הזו (בלי לגעת בשיוכים אחרים
// שכבר יש לו - אדם יכול להיות פעיל בכמה מחלקות בו-זמנית).
export async function createContact(formData) {
  const { supabase, user } = await requireUser();
  const workspace = await resolveTargetWorkspace(supabase, user, formData.get('workspace_id'));
  if (!workspace.id) return { error: 'לא נמצא workspace פעיל' };

  const first = (formData.get('first') || '').toString().trim();
  if (!first) return { error: 'יש להזין שם פרטי' };

  const idnum = (formData.get('idnum') || '').toString().trim() || null;
  const phone = (formData.get('phone') || '').toString().trim() || null;
  const email = (formData.get('email') || '').toString().trim() || null;
  const newTags = formData.has('tags') ? parseTags(formData.get('tags')) : [];
  const forceNew = formData.get('force_new') === 'true';
  const reason = (formData.get('reason') || '').toString().trim() || null;
  const reasonNote = (formData.get('reason_note') || '').toString().trim() || null;

  const existing = forceNew ? null : await findExistingMatch(supabase, { idnum, phone, email });

  if (existing) {
    const frozenError = await requireNotFrozen(supabase, existing.id);
    if (frozenError) return frozenError;

    const mergedTags = Array.from(new Set([...(existing.tags || []), ...newTags]));
    const update = { tags: mergedTags };
    for (const field of EDITABLE_FIELDS) {
      if (formData.has(field) && formData.get(field)) update[field] = formData.get(field);
    }
    const { error } = await supabase.from('contacts').update(update).eq('id', existing.id);
    if (error) return { error: error.message };

    await upsertDepartmentMembership(supabase, existing.id, workspace, reason, reasonNote);
    await maybeSwitchActiveWorkspace(supabase, user, workspace.id);
    redirect(`/dashboard/contacts/${existing.id}`);
  }

  const insert = { idnum, phone, email, tags: newTags };
  for (const field of EDITABLE_FIELDS) {
    if (formData.has(field) && !(field in insert)) {
      // contacts.last היא NOT NULL - אם נשאר ריק, שולחים מחרוזת ריקה ולא null
      insert[field] = formData.get(field) || (field === 'last' ? '' : null);
    }
  }

  const { data, error } = await supabase.from('contacts').insert(insert).select('id').single();
  if (error) return { error: error.message };

  await upsertDepartmentMembership(supabase, data.id, workspace, reason, reasonNote);
  await maybeSwitchActiveWorkspace(supabase, user, workspace.id);
  redirect(`/dashboard/contacts/${data.id}`);
}

// מחיקת איש קשר - רק owner/admin של אחת ממחלקות איש הקשר
export async function deleteContact(contactId) {
  const { supabase, user } = await requireUser();
  const allowed = await isManagerOfAnyDepartment(supabase, user.id, contactId);
  if (!allowed) return { error: 'רק מנהל של אחת ממחלקות איש הקשר יכול למחוק' };

  const { data: contact } = await supabase.from('contacts').select('first, last').eq('id', contactId).single();
  const { error } = await supabase.from('contacts').delete().eq('id', contactId);
  if (error) return { error: error.message };
  await logContactAudit(supabase, user.id, contactId, contact ? `${contact.first} ${contact.last}` : '', 'מחיקה');
  return { success: true };
}

// הסרת שיוך איש קשר למחלקה ספציפית בלבד (לא מוחק את הכרטיס, רק את
// השיוך למחלקה הזו - שאר המחלקות שהוא פעיל בהן נשארות)
export async function removeDepartmentMembership(contactId, workspaceId) {
  const { supabase, user } = await requireUser();
  const frozenError = await requireNotFrozen(supabase, contactId);
  if (frozenError) return frozenError;

  const [{ data: contact }, { data: workspace }] = await Promise.all([
    supabase.from('contacts').select('first, last').eq('id', contactId).single(),
    supabase.from('workspaces').select('name').eq('id', workspaceId).single(),
  ]);
  const { error } = await supabase
    .from('contact_departments').delete().eq('contact_id', contactId).eq('workspace_id', workspaceId);
  if (error) return { error: error.message };
  await logContactAudit(supabase, user.id, contactId, contact ? `${contact.first} ${contact.last}` : '', 'הסרה ממחלקה', workspace?.name || null);
  return { success: true };
}

// הוספת שיוך למחלקה נוספת מתוך כרטיס איש הקשר עצמו
export async function addDepartmentMembership(contactId, workspaceId, reason, reasonNote) {
  const { supabase } = await requireUser();
  const frozenError = await requireNotFrozen(supabase, contactId);
  if (frozenError) return frozenError;

  const { data: workspace } = await supabase.from('workspaces').select('id, name').eq('id', workspaceId).single();
  if (!workspace) return { error: 'מחלקה לא נמצאה' };
  await upsertDepartmentMembership(supabase, contactId, workspace, reason, reasonNote);
  return { success: true };
}

// עדכון שלב/סיבת סגירה של איש קשר במחלקה ספציפית
export async function updateDepartmentStage(departmentRowId, stage, closedReason) {
  const { supabase } = await requireUser();
  const { data: row } = await supabase.from('contact_departments').select('contact_id').eq('id', departmentRowId).single();
  if (!row) return { error: 'שיוך לא נמצא' };

  const frozenError = await requireNotFrozen(supabase, row.contact_id);
  if (frozenError) return frozenError;

  const { error } = await supabase.from('contact_departments')
    .update({ stage, closed_reason: stage === 'closed' ? (closedReason || null) : null, last_activity_at: new Date().toISOString() })
    .eq('id', departmentRowId);
  if (error) return { error: error.message };

  return { success: true };
}

// כמו updateDepartmentStage - לשימוש במסכי לידים/תהליכים שבהם משנים
// סטטוס מבלי לעזוב את המסך (אותה טבלה, אז השינוי מסונכרן אוטומטית בין
// לידים לתהליכים - שניהם קוראים מאותה שורת contact_departments)
export async function updateLeadStage(departmentRowId, stage, closedReason) {
  const { supabase } = await requireUser();
  const { data: row } = await supabase.from('contact_departments').select('contact_id').eq('id', departmentRowId).single();
  if (!row) return { error: 'שיוך לא נמצא' };

  const frozenError = await requireNotFrozen(supabase, row.contact_id);
  if (frozenError) return frozenError;

  const { error } = await supabase.from('contact_departments')
    .update({ stage, closed_reason: stage === 'closed' ? (closedReason || null) : null, last_activity_at: new Date().toISOString() })
    .eq('id', departmentRowId);
  if (error) return { error: error.message };
  return { success: true };
}

// איחוד שני אנשי קשר כפולים: keepId נשאר, duplicateId נמחק אחרי שהפגישות/משימות
// והשיוכים למחלקות שלו עוברים אליו
export async function mergeContacts(keepId, duplicateId, resolvedFields) {
  const { supabase, user } = await requireUser();
  if (keepId === duplicateId) return { error: 'לא ניתן לאחד איש קשר עם עצמו' };

  const allowed = await isManagerOfAnyDepartment(supabase, user.id, keepId);
  if (!allowed) return { error: 'רק מנהל של אחת ממחלקות איש הקשר יכול למזג כפילויות' };
  const frozenError = await requireNotFrozen(supabase, keepId);
  if (frozenError) return frozenError;

  const [{ data: keepContactForLog }, { data: dupContactForLog }] = await Promise.all([
    supabase.from('contacts').select('first, last').eq('id', keepId).single(),
    supabase.from('contacts').select('first, last').eq('id', duplicateId).single(),
  ]);

  const { error: meetingsError } = await supabase
    .from('meetings').update({ contact_id: keepId }).eq('contact_id', duplicateId);
  if (meetingsError) return { error: meetingsError.message };

  const { error: tasksError } = await supabase
    .from('tasks').update({ contact_id: keepId }).eq('contact_id', duplicateId);
  if (tasksError) return { error: tasksError.message };

  // מעביר שיוכי מחלקה של הכפול לכרטיס הנשאר, כולל היסטוריית הפניות שלהם:
  // אם למחלקה הזו כבר יש שיוך אצל הנשאר - מעבירים רק את היסטוריית הפניות
  // לשורה הקיימת שלו; אחרת מעבירים את השורה עצמה (כדי לא לאבד את ההיסטוריה)
  const { data: dupDepartments } = await supabase.from('contact_departments').select('id, workspace_id').eq('contact_id', duplicateId);
  const { data: keepDepartments } = await supabase.from('contact_departments').select('id, workspace_id').eq('contact_id', keepId);
  const keepByWorkspace = new Map((keepDepartments || []).map((d) => [d.workspace_id, d.id]));
  for (const d of dupDepartments || []) {
    const keepRowId = keepByWorkspace.get(d.workspace_id);
    if (keepRowId) {
      await supabase.from('lead_inquiries').update({ contact_department_id: keepRowId }).eq('contact_department_id', d.id);
    } else {
      await supabase.from('contact_departments').update({ contact_id: keepId }).eq('id', d.id);
    }
  }

  if (resolvedFields) {
    // המשתמש בחר שדה-שדה מה להשאיר (כולל אפשרות "שניהם" לטלפון/מייל) -
    // מעדכן את הכרטיס הנשאר לפי הבחירות במקום פשוט להשאיר אותו כמו שהיה
    const update = {};
    for (const key of EDITABLE_FIELDS) {
      if (resolvedFields[key] !== undefined) update[key] = resolvedFields[key] || null;
    }
    if (resolvedFields.tags) update.tags = resolvedFields.tags;
    if (Object.keys(update).length > 0) await supabase.from('contacts').update(update).eq('id', keepId);
  } else {
    const { data: dup } = await supabase.from('contacts').select('tags').eq('id', duplicateId).single();
    const { data: keep } = await supabase.from('contacts').select('tags').eq('id', keepId).single();
    const mergedTags = Array.from(new Set([...(keep?.tags || []), ...(dup?.tags || [])]));
    await supabase.from('contacts').update({ tags: mergedTags }).eq('id', keepId);
  }

  // מעביר גם היסטוריית מיילים ו-WhatsApp (יוצא+נכנס) שנשלחו/התקבלו אצל הכפול -
  // אחרת ה-delete למטה היה מוחק אותם בפועל (contact_id ... on delete cascade
  // בשתי הטבלאות, מיגרציות 0014/0016/0019) ואיבוד היסטוריית תקשורת אמיתית
  const { error: emailsError } = await supabase
    .from('sent_emails').update({ contact_id: keepId }).eq('contact_id', duplicateId);
  if (emailsError) return { error: emailsError.message };
  const { error: whatsappError } = await supabase
    .from('sent_whatsapp').update({ contact_id: keepId }).eq('contact_id', duplicateId);
  if (whatsappError) return { error: whatsappError.message };

  // מצרף (לא דורס) הערות חופשיות - אלה לא בטבלת-בת נפרדת, אז בלי הצירוף
  // הזה הן היו נעלמות לגמרי עם מחיקת הכפול למטה
  const { data: dupNotes } = await supabase.from('contacts').select('notes').eq('id', duplicateId).single();
  if (dupNotes?.notes?.trim()) {
    const { data: keepNotes } = await supabase.from('contacts').select('notes').eq('id', keepId).single();
    const dupName = dupContactForLog ? `${dupContactForLog.first} ${dupContactForLog.last}` : 'הכפול';
    const combinedNotes = [keepNotes?.notes, `— הערות ממוזגות מ-${dupName}:\n${dupNotes.notes}`].filter(Boolean).join('\n\n');
    await supabase.from('contacts').update({ notes: combinedNotes }).eq('id', keepId);
  }

  const { error: deleteError } = await supabase.from('contacts').delete().eq('id', duplicateId);
  if (deleteError) return { error: deleteError.message };

  const keepName = keepContactForLog ? `${keepContactForLog.first} ${keepContactForLog.last}` : '';
  const dupName = dupContactForLog ? `${dupContactForLog.first} ${dupContactForLog.last}` : '';
  await logContactAudit(supabase, user.id, keepId, keepName, 'מיזוג כפילויות', `מוזג עם "${dupName}"`);

  return { success: true };
}

// ייבוא אנשי קשר בכמות (מקובץ CSV/אקסל) - משויכים למחלקה שנבחרה.
// כמו ביצירה ידנית: לכל שורה נבדקת התאמה קיימת (ת"ז/טלפון/מייל) לפני יצירה,
// כדי למנוע כרטיסים כפולים - למי שכבר קיים רק מתווסף שיוך למחלקה הזו.
export async function importContacts(rows, workspaceId) {
  const { supabase, user } = await requireUser();
  const workspace = await resolveTargetWorkspace(supabase, user, workspaceId);
  if (!workspace.id) return { error: 'לא נמצא workspace פעיל' };
  if (!Array.isArray(rows) || rows.length === 0) return { error: 'לא נמצאו שורות לייבוא' };

  const validRows = rows.filter((r) => (r.first || '').toString().trim());
  if (validRows.length === 0) return { error: 'אף שורה לא הכילה שם פרטי' };

  let created = 0;
  let merged = 0;

  for (const r of validRows) {
    const idnum = (r.idnum || '').toString().trim() || null;
    const phone = (r.phone || '').toString().trim() || null;
    const email = (r.email || '').toString().trim() || null;
    const rowTags = (r.tags || '').toString().split(',').map((t) => t.trim()).filter(Boolean);

    const existing = await findExistingMatch(supabase, { idnum, phone, email });

    const rowReason = (r.reason || '').toString().trim() || 'ייבוא אקסל';

    if (existing) {
      const frozenError = await requireNotFrozen(supabase, existing.id);
      if (frozenError) continue; // מדלגים על שורות של אנשי קשר מוקפאים, לא עוצרים את כל הייבוא

      const mergedTags = Array.from(new Set([...(existing.tags || []), ...rowTags]));
      await supabase.from('contacts').update({ tags: mergedTags }).eq('id', existing.id);
      await upsertDepartmentMembership(supabase, existing.id, workspace, rowReason);
      merged++;
      continue;
    }

    const { data: created_contact } = await supabase.from('contacts').insert({
      first: (r.first || '').toString().trim(),
      last: (r.last || '').toString().trim(), // contacts.last היא NOT NULL - לא לשלוח null
      phone, idnum, email,
      phone2: (r.phone2 || '').toString().trim() || null,
      dept: (r.dept || '').toString().trim() || null,
      source: (r.source || '').toString().trim() || 'ייבוא אקסל',
      tags: rowTags,
    }).select('id').single();
    if (created_contact) await upsertDepartmentMembership(supabase, created_contact.id, workspace, rowReason);
    created++;
  }

  return { success: true, count: created + merged, created, merged };
}

// ייבוא בכמות מאשף הייבוא הדו-מחלקתי (DepartmentImportWizard) - מיועד
// לקבצים ממערכות חיצוניות (כמו "קשר") שממופים לשדות המערכת מראש, עם
// תיוג מקור+תקופה על כל הקובץ. בשונה מ-importContacts למעלה (שמאחדת רק
// תגיות), כאן גם משלימים שדות ריקים אצל התאמה קיימת - ר' bulkImportContactRows
// ב-leadIntakeCore.js. מותר רק לבעלים/מנהל של המחלקה הספציפית שנבחרה.
export async function importDepartmentBatch(rows, workspaceId, sourceSystem, batchLabel) {
  const { supabase, user } = await requireUser();
  if (!workspaceId) return { error: 'לא נבחרה מחלקת יעד' };

  const allowed = await isManagerOfWorkspace(supabase, user.id, workspaceId);
  if (!allowed) return { error: 'רק בעלים/מנהל של המחלקה יכול לייבא אליה' };
  if (!Array.isArray(rows) || rows.length === 0) return { error: 'לא נמצאו שורות לייבוא' };

  const workspace = await resolveTargetWorkspace(supabase, user, workspaceId);
  if (!workspace.id) return { error: 'מחלקת היעד לא נמצאה' };

  // לידים חדשים במחלקת תרומות ממתינים לאישור המנהל (בחירת נציג ושיגור)
  // לפני שהם מופיעים לנציגים ברשימת הלידים - ר' sales/pending
  const requiresApproval = workspace.name === 'תרומות';

  return bulkImportContactRows(supabase, { rows, workspace, sourceSystem, batchLabel, requiresApproval });
}

// אישור ליד ממתין ושיגורו לנציג - מתוך תיבת ההמתנה של המנהל
// (sales/pending). מותר רק לבעלים/מנהל של אותה מחלקה.
export async function approveAndAssignLead(departmentRowId, agentId) {
  const { supabase, user } = await requireUser();
  if (!departmentRowId) return { error: 'לא נבחר ליד' };

  const { data: row } = await supabase
    .from('contact_departments').select('id, workspace_id').eq('id', departmentRowId).single();
  if (!row) return { error: 'הליד לא נמצא' };

  const allowed = await isManagerOfWorkspace(supabase, user.id, row.workspace_id);
  if (!allowed) return { error: 'רק בעלים/מנהל של המחלקה יכול לאשר לידים' };

  const { error } = await supabase
    .from('contact_departments')
    .update({
      approval_status: 'approved',
      agent_id: agentId || null,
      assigned_by: user.id,
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', departmentRowId);
  if (error) return { error: error.message };
  return { success: true };
}

// הפיכת איש קשר קיים ל"ליד יזום" ע"י המנהל - משייך אותו למחלקה (אם עוד
// לא משויך), מסמן created_by_manager כדי שיהיה ברור בעמודת המקור שזו
// הקצאה יזומה ולא פנייה של הלקוח, ומקצה נציג.
export async function createManagerLead(contactId, workspaceId, agentId, reason) {
  const { supabase, user } = await requireUser();
  if (!contactId || !workspaceId) return { error: 'חסרים פרטים' };

  const allowed = await isManagerOfWorkspace(supabase, user.id, workspaceId);
  if (!allowed) return { error: 'רק בעלים/מנהל של המחלקה יכול ליצור ליד יזום' };
  const frozenError = await requireNotFrozen(supabase, contactId);
  if (frozenError) return frozenError;

  const workspace = await resolveTargetWorkspace(supabase, user, workspaceId);
  if (!workspace.id) return { error: 'המחלקה לא נמצאה' };

  await upsertDepartmentMembership(
    supabase, contactId, workspace, reason || 'הקצאה יזומה של המנהל', null, 'מנהל', null,
    { createdByManager: true },
  );

  if (agentId) {
    await supabase.from('contact_departments')
      .update({ agent_id: agentId, assigned_by: user.id, created_by_manager: true })
      .eq('contact_id', contactId).eq('workspace_id', workspaceId);
  } else {
    await supabase.from('contact_departments')
      .update({ created_by_manager: true })
      .eq('contact_id', contactId).eq('workspace_id', workspaceId);
  }
  return { success: true };
}

// מסמן זוג אנשי קשר כ"לא כפילות" מתוך תור בדיקת הכפליות (הגדרות ←
// בדיקת כפליות) - כדי שהזוג לא יוצע שוב. ממיין את שני ה-id כדי שה-
// unique constraint על הטבלה יעבוד בלי תלות בסדר שבו הזוג הוצג.
export async function dismissDuplicatePair(contactIdA, contactIdB) {
  const { supabase, user } = await requireUser();
  const allowed = await isManagerOfAnyWorkspace(supabase, user.id);
  if (!allowed) return { error: 'רק בעלים/מנהל יכול לסמן כפילות' };
  if (!contactIdA || !contactIdB || contactIdA === contactIdB) return { error: 'זוג לא תקין' };

  const [idA, idB] = contactIdA < contactIdB ? [contactIdA, contactIdB] : [contactIdB, contactIdA];
  const { error } = await supabase
    .from('dismissed_duplicate_pairs')
    .upsert({ contact_id_a: idA, contact_id_b: idB, dismissed_by: user.id }, { onConflict: 'contact_id_a,contact_id_b', ignoreDuplicates: true });
  if (error) return { error: error.message };
  return { success: true };
}

// ---------- לוח שנה והקדשות ----------
// "זכאי ליום בלוח שנה" - איש קשר יכול לקבל כמה תאריכים, לכל אחד נוסח
// הקדשה משלו. נשמר בטבלה נפרדת (calendar_dedications, מיגרציה 0032) ולא
// בשדה בכרטיס, כי זו רשימה שגדלה ומוצגת גם בווידג'ט הדשבורד לפי תאריך.
export async function addDedication(contactId, dedicationDate, dedicationText, note) {
  const { supabase, user } = await requireUser();
  if (!contactId || !dedicationDate || !(dedicationText || '').trim()) {
    return { error: 'יש למלא תאריך ונוסח הקדשה' };
  }
  const frozenError = await requireNotFrozen(supabase, contactId);
  if (frozenError) return frozenError;

  const { error } = await supabase.from('calendar_dedications').insert({
    contact_id: contactId,
    dedication_date: dedicationDate,
    dedication_text: dedicationText.trim(),
    note: (note || '').trim() || null,
    created_by: user.id,
  });
  if (error) return { error: error.message };
  return { success: true };
}

export async function removeDedication(dedicationId) {
  const { supabase } = await requireUser();
  if (!dedicationId) return { error: 'לא נבחרה הקדשה' };

  const { data: row } = await supabase
    .from('calendar_dedications').select('contact_id').eq('id', dedicationId).single();
  if (!row) return { error: 'ההקדשה לא נמצאה' };
  const frozenError = await requireNotFrozen(supabase, row.contact_id);
  if (frozenError) return frozenError;

  const { error } = await supabase.from('calendar_dedications').delete().eq('id', dedicationId);
  if (error) return { error: error.message };
  return { success: true };
}

// יומן השינויים של איש קשר (הקפאה/הפשרה/מיזוג/הסרה ממחלקה/מחיקה) -
// לתפריט ⚙ ההגדרות בכרטיס. אין כאן בדיקת canManageContact נוספת כי
// מי שקורא לזה כבר עבר את אותה בדיקה בתפריט עצמו
export async function getContactAuditLog(contactId) {
  const { supabase } = await requireUser();
  const admin = createAdminClient();

  const { data: rows } = await supabase
    .from('contact_audit_log')
    .select('id, action, detail, performed_by, created_at')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(50);

  const userIds = Array.from(new Set((rows || []).map((r) => r.performed_by).filter(Boolean)));
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('id, name').in('id', userIds)
    : { data: [] };
  const { data: usersList } = userIds.length ? await admin.auth.admin.listUsers({ perPage: 1000 }) : { data: { users: [] } };
  const emailById = Object.fromEntries((usersList?.users || []).map((u) => [u.id, u.email]));
  const nameById = Object.fromEntries((profiles || []).map((p) => [p.id, p.name || emailById[p.id] || 'משתמש']));

  return (rows || []).map((r) => ({ ...r, performedByName: r.performed_by ? nameById[r.performed_by] || 'משתמש' : 'לא ידוע' }));
}

// חיפוש אנשי קשר (לצורך איחוד כפולים) - מחזיר עד 8 תוצאות, לא כולל את עצמו
export async function searchContacts(query, excludeId) {
  const { supabase } = await requireUser();
  if (!query || query.trim().length < 2) return [];

  const selectCols = 'id, first, last, phone, phone2, email, email2, idnum, source, dept, tags';
  const like = `%${query}%`;
  // שאילתות נפרדות ומפורמטות במקום .or() בנוי ממחרוזת - ר' הערה ב-checkPossibleDuplicates לעיל
  const results = await Promise.all([
    supabase.from('contacts').select(selectCols).neq('id', excludeId).ilike('first', like).limit(8),
    supabase.from('contacts').select(selectCols).neq('id', excludeId).ilike('last', like).limit(8),
    supabase.from('contacts').select(selectCols).neq('id', excludeId).ilike('phone', like).limit(8),
    supabase.from('contacts').select(selectCols).neq('id', excludeId).ilike('email', like).limit(8),
  ]);

  const byId = new Map();
  for (const { data } of results) {
    for (const row of data || []) {
      if (!byId.has(row.id)) byId.set(row.id, row);
    }
  }
  return Array.from(byId.values()).slice(0, 8);
}

// קביעת נציג מטפל בליד במחלקה ספציפית (לתצוגה בלבד - לא נועל את הליד)
export async function assignAgent(contactId, workspaceId, agentId) {
  const { supabase } = await requireUser();
  const frozenError = await requireNotFrozen(supabase, contactId);
  if (frozenError) return frozenError;

  const { error } = await supabase
    .from('contact_departments')
    .update({ agent_id: agentId || null, last_activity_at: new Date().toISOString() })
    .eq('contact_id', contactId)
    .eq('workspace_id', workspaceId);
  if (error) return { error: error.message };
  return { success: true };
}

// עדכון שדה נוסף ייעודי-מחלקה (extra_fields jsonb) על שיוך מחלקה - למשל
// "מסלול לימודים מבוקש" או "סכום צפוי לתרומה" (ראו pipelines.js EXTRA_FIELDS)
export async function updateDepartmentExtraField(departmentRowId, key, value) {
  const { supabase } = await requireUser();

  const { data: row } = await supabase.from('contact_departments').select('extra_fields, contact_id').eq('id', departmentRowId).single();
  if (!row) return { error: 'שיוך מחלקה לא נמצא' };
  const frozenError = await requireNotFrozen(supabase, row.contact_id);
  if (frozenError) return frozenError;

  const extra_fields = { ...(row.extra_fields || {}), [key]: value };
  const { error } = await supabase.from('contact_departments').update({ extra_fields }).eq('id', departmentRowId);
  if (error) return { error: error.message };
  return { success: true };
}

// שליחת מייל לאיש קשר מהתיבה המחוברת של המחלקה הפעילה - נשלח בפועל
// דרך Gmail API, ונרשם גם ב-sent_emails כדי שיוצג בטאב "פעילות"
export async function sendContactEmail(contactId, workspaceId, subject, body) {
  const { supabase, user } = await requireUser();
  const frozenError = await requireNotFrozen(supabase, contactId);
  if (frozenError) return frozenError;

  if (!subject?.trim() || !body?.trim()) return { error: 'יש למלא נושא ותוכן' };

  const { data: contact } = await supabase.from('contacts').select('email').eq('id', contactId).single();
  if (!contact?.email) return { error: 'לאיש הקשר אין כתובת מייל שמורה' };

  const { data: connection } = await supabase
    .from('email_connections').select('email_address, refresh_token').eq('workspace_id', workspaceId).eq('purpose', 'send').single();
  if (!connection) return { error: 'תיבת המייל לשליחה של המחלקה הזו עדיין לא מחוברת' };

  try {
    const accessToken = await getAccessToken(connection.refresh_token);
    await sendEmail(accessToken, { from: connection.email_address, to: contact.email, subject, body });
  } catch (err) {
    return { error: err.message };
  }

  await supabase.from('sent_emails').insert({
    contact_id: contactId, workspace_id: workspaceId, from_address: connection.email_address,
    subject, body, sent_by: user.id,
  });

  return { success: true };
}

// שליחת הודעת WhatsApp ראשונה (תבנית מאושרת) לאיש קשר, ורישום ב-sent_whatsapp
// כדי שיוצג בטאב "פעילות"
export async function sendContactWhatsApp(contactId, workspaceId, reason, templateId) {
  const { supabase, user } = await requireUser();
  const frozenError = await requireNotFrozen(supabase, contactId);
  if (frozenError) return frozenError;

  const { data: contact } = await supabase.from('contacts').select('first, phone').eq('id', contactId).single();
  if (!contact?.phone) return { error: 'לאיש הקשר אין מספר טלפון שמור' };

  try {
    await sendWhatsAppTemplate({ phone: contact.phone, firstName: contact.first, reason, templateId });
  } catch (err) {
    return { error: err.message };
  }

  await supabase.from('sent_whatsapp').insert({
    contact_id: contactId, workspace_id: workspaceId, phone: contact.phone, reason, sent_by: user.id,
  });

  return { success: true };
}

// שליחת הודעת WhatsApp חופשית (לא תבנית) - אפשרי רק בתוך 24 שעות
// מתשובת הלקוח האחרונה להודעת התבנית
export async function sendContactWhatsAppChatMessage(contactId, workspaceId, message) {
  const { supabase, user } = await requireUser();
  const frozenError = await requireNotFrozen(supabase, contactId);
  if (frozenError) return frozenError;

  if (!message?.trim()) return { error: 'יש להזין תוכן הודעה' };

  const { data: contact } = await supabase.from('contacts').select('phone').eq('id', contactId).single();
  if (!contact?.phone) return { error: 'לאיש הקשר אין מספר טלפון שמור' };

  try {
    await sendWhatsAppChat({ phone: contact.phone, message });
  } catch (err) {
    return { error: err.message };
  }

  await supabase.from('sent_whatsapp').insert({
    contact_id: contactId, workspace_id: workspaceId, phone: contact.phone, kind: 'chat', message, sent_by: user.id,
  });

  return { success: true };
}

// ניהול רשימת תבניות WhatsApp מאושרות - לבחירה בזמן שליחה (מספר
// תבניות אפשריות, לא רק אחת קבועה)
export async function addWhatsAppTemplate(formData) {
  const { supabase } = await requireUser();
  const name = formData.get('name')?.toString().trim();
  const templateId = formData.get('template_id')?.toString().trim();
  const previewText = formData.get('preview_text')?.toString().trim() || null;
  if (!name || !templateId) return { error: 'יש למלא שם ומספר תבנית' };

  const { error } = await supabase.from('whatsapp_templates').insert({ name, template_id: templateId, preview_text: previewText });
  if (error) return { error: error.message };
  return { success: true };
}

export async function deleteWhatsAppTemplate(id) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from('whatsapp_templates').delete().eq('id', id);
  if (error) return { error: error.message };
  return { success: true };
}

// ניהול תבניות מייל מוכנות - לשימוש חוזר בחלון שליחת מייל מהכרטיס
export async function addEmailTemplate(formData) {
  const { supabase } = await requireUser();
  const name = formData.get('name')?.toString().trim();
  const subject = formData.get('subject')?.toString().trim();
  const body = formData.get('body')?.toString().trim();
  if (!name || !subject || !body) return { error: 'יש למלא שם, נושא ותוכן' };

  const { error } = await supabase.from('email_templates').insert({ name, subject, body });
  if (error) return { error: error.message };
  return { success: true };
}

export async function deleteEmailTemplate(id) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from('email_templates').delete().eq('id', id);
  if (error) return { error: error.message };
  return { success: true };
}

// העלאת תמונת פרופיל לאיש קשר - נשמרת ב-Storage bucket ציבורי
// (contact-photos), עם admin client כדי לעקוף RLS על ה-bucket
export async function uploadContactPhoto(contactId, formData) {
  const { supabase } = await requireUser();
  const frozenError = await requireNotFrozen(supabase, contactId);
  if (frozenError) return frozenError;

  const file = formData.get('photo');
  if (!file || typeof file === 'string' || file.size === 0) return { error: 'יש לבחור קובץ תמונה' };
  if (!file.type?.startsWith('image/')) return { error: 'יש להעלות קובץ תמונה בלבד' };

  const admin = createAdminClient();
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase();
  const path = `${contactId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await admin.storage
    .from('contact-photos')
    .upload(path, file, { contentType: file.type, upsert: true });
  if (uploadError) return { error: uploadError.message };

  const { data: publicUrlData } = admin.storage.from('contact-photos').getPublicUrl(path);
  const { error: updateError } = await supabase.from('contacts').update({ photo_url: publicUrlData.publicUrl }).eq('id', contactId);
  if (updateError) return { error: updateError.message };

  return { success: true, url: publicUrlData.publicUrl };
}
