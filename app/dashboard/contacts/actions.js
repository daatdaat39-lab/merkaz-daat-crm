'use server';

import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { getPipeline, STAGE_LABELS } from '../components/pipelines';
import { findExistingMatch, upsertDepartmentMembership } from './leadIntakeCore';
import { isManagerOfAnyDepartment, requireNotFrozen } from '../lib/contactGuards';
import { getAccessToken } from '../../../lib/gmail/client';
import { sendEmail } from '../../../lib/gmail/send';
import { sendWhatsAppTemplate, sendWhatsAppChat } from '../../../lib/inforu/whatsapp';

const EDITABLE_FIELDS = ['first', 'last', 'phone', 'phone2', 'email', 'email2', 'dept', 'source', 'idnum', 'birth_date', 'gender'];

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
  const clauses = [];
  if (idnum) clauses.push(`idnum.eq.${idnum}`);
  if (phone) clauses.push(`phone.eq.${phone}`);
  if (email) clauses.push(`email.eq.${email}`);
  if (first && first.trim().length >= 2) {
    const f = first.trim();
    const l = (last || '').trim();
    clauses.push(l ? `and(first.ilike.%${f}%,last.ilike.%${l}%)` : `first.ilike.%${f}%`);
  }
  if (clauses.length === 0) return [];

  const { data } = await supabase
    .from('contacts')
    .select('id, first, last, idnum, phone, phone2, email, source, dept, tags, contact_departments (stage, workspaces:workspace_id (name))')
    .or(clauses.join(','))
    .limit(5);

  return (data || []).map((c) => ({
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

  const { error } = await supabase.from('contacts').update({ frozen }).eq('id', contactId);
  if (error) return { error: error.message };
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

  const { error } = await supabase.from('contacts').delete().eq('id', contactId);
  if (error) return { error: error.message };
  return { success: true };
}

// הסרת שיוך איש קשר למחלקה ספציפית בלבד (לא מוחק את הכרטיס, רק את
// השיוך למחלקה הזו - שאר המחלקות שהוא פעיל בהן נשארות)
export async function removeDepartmentMembership(contactId, workspaceId) {
  const { supabase } = await requireUser();
  const frozenError = await requireNotFrozen(supabase, contactId);
  if (frozenError) return frozenError;

  const { error } = await supabase
    .from('contact_departments').delete().eq('contact_id', contactId).eq('workspace_id', workspaceId);
  if (error) return { error: error.message };
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

  const { error: deleteError } = await supabase.from('contacts').delete().eq('id', duplicateId);
  if (deleteError) return { error: deleteError.message };

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

// חיפוש אנשי קשר (לצורך איחוד כפולים) - מחזיר עד 8 תוצאות, לא כולל את עצמו
export async function searchContacts(query, excludeId) {
  const { supabase } = await requireUser();
  if (!query || query.trim().length < 2) return [];

  const { data } = await supabase
    .from('contacts')
    .select('id, first, last, phone, phone2, email, email2, idnum, source, dept, tags')
    .neq('id', excludeId)
    .or(`first.ilike.%${query}%,last.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%`)
    .limit(8);

  return data || [];
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
