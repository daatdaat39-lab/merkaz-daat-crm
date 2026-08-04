'use server';

import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';

async function requireUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

// העדפת תצוגה אישית בלבד - לא נתון משותף, לכן אין כאן שום בדיקת
// owner/admin (בניגוד לפעולות על pipeline_stages/campaign_stages
// שהן נתון משותף לכל הצוות). אותו דפוס בדיוק כמו כתיבת
// profiles.current_workspace_id הקיימת (contacts/actions.js,
// layout.js) - המשתמש כותב רק על עצמו, לפי auth.uid().
export async function toggleExtraFieldVisibility(workspaceId, fieldKey) {
  const { supabase, user } = await requireUser();
  if (!workspaceId || !fieldKey) return { error: 'חסרים פרטים' };

  const { data: profile } = await supabase
    .from('profiles').select('hidden_extra_fields').eq('id', user.id).single();
  const hidden = { ...(profile?.hidden_extra_fields || {}) };
  const forWorkspace = new Set(hidden[workspaceId] || []);

  if (forWorkspace.has(fieldKey)) forWorkspace.delete(fieldKey);
  else forWorkspace.add(fieldKey);
  hidden[workspaceId] = Array.from(forWorkspace);

  const { error } = await supabase.from('profiles').update({ hidden_extra_fields: hidden }).eq('id', user.id);
  if (error) return { error: error.message };
  return { success: true, hidden: hidden[workspaceId] };
}

// אותו דפוס בדיוק, הפעם לא לשדה בודד בתוך קובייה אלא לקובייה שלמה
// (donor_stats/student_stats/tasks_meetings_card/activity_tab) - איזה
// widgets מוצגים בכלל בכרטיס איש הקשר, לכל מחלקה בנפרד
export async function toggleWidgetVisibility(workspaceId, widgetKey) {
  const { supabase, user } = await requireUser();
  if (!workspaceId || !widgetKey) return { error: 'חסרים פרטים' };

  const { data: profile } = await supabase
    .from('profiles').select('hidden_widgets').eq('id', user.id).single();
  const hidden = { ...(profile?.hidden_widgets || {}) };
  const forWorkspace = new Set(hidden[workspaceId] || []);

  if (forWorkspace.has(widgetKey)) forWorkspace.delete(widgetKey);
  else forWorkspace.add(widgetKey);
  hidden[workspaceId] = Array.from(forWorkspace);

  const { error } = await supabase.from('profiles').update({ hidden_widgets: hidden }).eq('id', user.id);
  if (error) return { error: error.message };
  return { success: true, hidden: hidden[workspaceId] };
}
