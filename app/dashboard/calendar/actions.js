'use server';

import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { createZoomMeeting, isZoomConfigured } from '../../../lib/zoom/client';
import { requireNotFrozen } from '../lib/contactGuards';

// יוצר קישור Zoom לפגישה מסוג "זום" אם החיבור מוגדר - בכשל לא מפיל את
// שמירת הפגישה עצמה, רק משאיר את הקישור ריק (כמו כל אינטגרציה אחרת
// שעדיין לא מחוברת במערכת)
async function maybeCreateZoomLink(type, contactName, date, time) {
  if (type !== 'זום' || !isZoomConfigured()) return null;
  try {
    return await createZoomMeeting({ topic: `פגישה עם ${contactName || ''}`.trim(), startDate: date, startTime: time });
  } catch {
    return null;
  }
}

async function requireWorkspace() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('current_workspace_id').eq('id', user.id).single();
  return { supabase, user, workspaceId: profile?.current_workspace_id || null };
}

async function createMeetingFromForm(formData) {
  const { supabase, user, workspaceId } = await requireWorkspace();
  const contactId = formData.get('contact_id');
  const date = formData.get('meeting_date');
  const time = formData.get('meeting_time');
  const type = formData.get('type') || 'פרונטלי';
  if (!workspaceId || !contactId || !date || !time) return { error: 'חסרים פרטים' };

  const frozenError = await requireNotFrozen(supabase, contactId);
  if (frozenError) return frozenError;

  const { data: contact } = await supabase.from('contacts').select('first, last').eq('id', contactId).single();
  const zoomJoinUrl = await maybeCreateZoomLink(type, contact ? `${contact.first} ${contact.last}` : null, date, time);

  const { error } = await supabase.from('meetings').insert({
    workspace_id: workspaceId,
    contact_id: contactId,
    meeting_date: date,
    meeting_time: time,
    type,
    location: formData.get('location') || null,
    agent_id: user.id,
    zoom_join_url: zoomJoinUrl,
  });
  if (error) return { error: error.message };
  return { success: true };
}

export async function addMeeting(formData) {
  const res = await createMeetingFromForm(formData);
  if (res?.error) return res;
  redirect('/dashboard/calendar');
}

// זהה ל-addMeeting אבל בלי redirect - לשימוש מ-EventModal כשהוא נפתח
// מחוץ לדף היומן המלא (חלון צף מעל כרטיס איש קשר, ר' FloatingCalendar.js).
// redirect מתוך server action ינווט את כל הדף שמתחת לחלון הצף, לא רק
// יסגור את המודל - חוויה שבורה שם.
export async function addMeetingNoRedirect(formData) {
  return createMeetingFromForm(formData);
}

export async function updateMeeting(meetingId, formData) {
  const { supabase } = await requireWorkspace();

  const update = {
    meeting_date: formData.get('meeting_date'),
    meeting_time: formData.get('meeting_time'),
    type: formData.get('type') || 'פרונטלי',
    location: formData.get('location') || null,
    notes: formData.get('notes') || null,
  };
  if (!update.meeting_date || !update.meeting_time) return { error: 'יש להזין תאריך ושעה' };

  // אם הפגישה עברה לסוג "זום" ועדיין אין לה קישור - יוצרים אחד עכשיו
  const { data: existing } = await supabase.from('meetings').select('contact_id, type, zoom_join_url, contacts(first, last)').eq('id', meetingId).single();
  if (existing?.contact_id) {
    const frozenError = await requireNotFrozen(supabase, existing.contact_id);
    if (frozenError) return frozenError;
  }
  if (update.type === 'זום' && !existing?.zoom_join_url) {
    const name = existing?.contacts ? `${existing.contacts.first} ${existing.contacts.last}` : null;
    update.zoom_join_url = await maybeCreateZoomLink(update.type, name, update.meeting_date, update.meeting_time);
  }

  const { error } = await supabase.from('meetings').update(update).eq('id', meetingId);
  if (error) return { error: error.message };

  redirect('/dashboard/calendar');
}

export async function deleteMeeting(meetingId) {
  const { supabase } = await requireWorkspace();
  const { data: existing } = await supabase.from('meetings').select('contact_id').eq('id', meetingId).single();
  if (existing?.contact_id) {
    const frozenError = await requireNotFrozen(supabase, existing.contact_id);
    if (frozenError) return frozenError;
  }
  const { error } = await supabase.from('meetings').delete().eq('id', meetingId);
  if (error) return { error: error.message };
  redirect('/dashboard/calendar');
}
