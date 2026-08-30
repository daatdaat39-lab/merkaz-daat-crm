'use server';

// הצעות-תיקון לאיש-קשר: כל משתמש מחובר יכול "להציע" שינוי (למשל טלפן
// שרואה טלפון שגוי תוך כדי שיחה), אבל זה לעולם לא כותב ישירות ל-contacts -
// רק מנהל שמאשר במסך הייעודי מפעיל את הכתיבה בפועל, דרך אותה
// applyContactFieldChanges שמשמשת גם עריכה ידנית רגילה (contacts/actions.js).
import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfAnyWorkspace } from './contactGuards';
import { EDITABLE_FIELDS } from './contactFieldsList';
import { applyContactFieldChanges } from '../contacts/actions';

async function requireUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

export async function submitContactEditSuggestion(contactId, changes, campaignContactId) {
  const { supabase, user } = await requireUser();
  if (!contactId || !changes || typeof changes !== 'object') return { error: 'נתונים חסרים' };

  // מסננים בשרת כל שדה שלא ברשימת ההרשאה - לא סומכים על מה שהלקוח שלח
  const filtered = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in changes && changes[field] !== undefined && changes[field] !== null && String(changes[field]).trim() !== '') {
      filtered[field] = changes[field];
    }
  }
  if (Object.keys(filtered).length === 0) return { error: 'לא הוזן שום תיקון' };

  const { error } = await supabase.from('contact_edit_suggestions').insert({
    contact_id: contactId, submitted_by: user.id, changes: filtered, campaign_contact_id: campaignContactId || null,
  });
  if (error) return { error: error.message };
  return { success: true };
}

export async function getPendingContactEditSuggestions() {
  const { supabase, user } = await requireUser();
  const allowed = await isManagerOfAnyWorkspace(supabase, user.id);
  if (!allowed) return { error: 'רק מנהל יכול לראות מסך זה' };

  const { data: suggestions, error } = await supabase.from('contact_edit_suggestions')
    .select('id, contact_id, submitted_by, changes, created_at, contacts:contact_id (first, last)')
    .eq('status', 'pending').order('created_at', { ascending: false });
  if (error) return { error: error.message };
  if (!suggestions || suggestions.length === 0) return { success: true, suggestions: [] };

  const contactIds = Array.from(new Set(suggestions.map((s) => s.contact_id)));
  const submitterIds = Array.from(new Set(suggestions.map((s) => s.submitted_by).filter(Boolean)));
  const [{ data: currentContacts }, { data: submitters }] = await Promise.all([
    supabase.from('contacts').select(['id', ...EDITABLE_FIELDS].join(',')).in('id', contactIds),
    submitterIds.length ? supabase.from('profiles').select('id, name').in('id', submitterIds) : Promise.resolve({ data: [] }),
  ]);
  const currentById = Object.fromEntries((currentContacts || []).map((c) => [c.id, c]));
  const nameById = Object.fromEntries((submitters || []).map((p) => [p.id, p.name]));

  return {
    success: true,
    suggestions: suggestions.map((s) => ({
      id: s.id, contactId: s.contact_id,
      contactName: `${s.contacts?.first || ''} ${s.contacts?.last || ''}`.trim(),
      submitterName: s.submitted_by ? (nameById[s.submitted_by] || 'נציג') : 'נציג',
      createdAt: s.created_at, changes: s.changes, currentValues: currentById[s.contact_id] || {},
    })),
  };
}

export async function approveContactEditSuggestion(id) {
  const { supabase, user } = await requireUser();
  const allowed = await isManagerOfAnyWorkspace(supabase, user.id);
  if (!allowed) return { error: 'רק מנהל יכול לאשר תיקונים' };

  const { data: suggestion } = await supabase.from('contact_edit_suggestions').select('id, contact_id, changes, status').eq('id', id).maybeSingle();
  if (!suggestion) return { error: 'ההצעה לא נמצאה' };
  if (suggestion.status !== 'pending') return { error: 'ההצעה הזו כבר טופלה' };

  // בדיקה כפולה מול ה-whitelist בזמן האישור, למקרה שהוא השתנה מאז ההגשה
  const safeChanges = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in suggestion.changes) safeChanges[field] = suggestion.changes[field];
  }

  const applyResult = await applyContactFieldChanges(supabase, suggestion.contact_id, safeChanges);
  if (applyResult.error) return applyResult;

  await supabase.from('contact_edit_suggestions')
    .update({ status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('id', id);
  return { success: true };
}

export async function rejectContactEditSuggestion(id) {
  const { supabase, user } = await requireUser();
  const allowed = await isManagerOfAnyWorkspace(supabase, user.id);
  if (!allowed) return { error: 'רק מנהל יכול לדחות תיקונים' };

  const { data: suggestion } = await supabase.from('contact_edit_suggestions').select('id, status').eq('id', id).maybeSingle();
  if (!suggestion) return { error: 'ההצעה לא נמצאה' };
  if (suggestion.status !== 'pending') return { error: 'ההצעה הזו כבר טופלה' };

  const { error } = await supabase.from('contact_edit_suggestions')
    .update({ status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { error: error.message };
  return { success: true };
}
