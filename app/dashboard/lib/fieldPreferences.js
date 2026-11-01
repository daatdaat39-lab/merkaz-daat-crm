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

// אילו-שדות-משניים-ב"פרטים-אישיים" מוצגים-לנציג-הזה תמיד-פתוחים (לא
// מאחורי "+ עוד פרטים") - חריגה-אישית-לברירת-המחדל-הגלובלית
// (ALWAYS_OPEN_DEFAULT ב-PersonalInfoCard.js: טלפון/מייל/עיר). בניגוד
// ל-hidden_extra_fields (jsonb per-workspace) - זה array פשוט, כי
// "פרטים אישיים" אינו-מחלקתי (אותם-שדות לכל-אנשי-הקשר בכל-המחלקות).
export async function togglePersonalInfoAlwaysOpen(fieldKey) {
  const { supabase, user } = await requireUser();
  if (!fieldKey) return { error: 'חסר שם שדה' };

  const { data: profile } = await supabase
    .from('profiles').select('personal_info_always_open').eq('id', user.id).single();
  const current = new Set(profile?.personal_info_always_open || []);

  if (current.has(fieldKey)) current.delete(fieldKey);
  else current.add(fieldKey);
  const next = Array.from(current);

  const { error } = await supabase.from('profiles').update({ personal_info_always_open: next }).eq('id', user.id);
  if (error) return { error: error.message };
  return { success: true, alwaysOpen: next };
}

// ערכת נושא (בהיר/כהה/לפי מערכת) - אותו דפוס בדיוק, נקרא ב-app/layout.js
// (root, מחוץ ל-dashboard) כדי לקבוע data-theme על ה-<html> לפני הרינדור
export async function setThemePreference(theme) {
  const { supabase, user } = await requireUser();
  if (!['light', 'dark', 'system'].includes(theme)) return { error: 'ערך לא תקין' };

  const { error } = await supabase.from('profiles').update({ theme_preference: theme }).eq('id', user.id);
  if (error) return { error: error.message };
  return { success: true };
}
