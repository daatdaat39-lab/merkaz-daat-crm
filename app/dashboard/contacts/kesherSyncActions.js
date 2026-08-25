'use server';

// פעולות-שרת (Server Actions) לסנכרון קשר - הלוגיקה עצמה עברה ל-
// kesherSyncCore.js (מודול רגיל, לא 'use server') כדי שגם ה-cron
// האוטומטי (app/api/cron/sync-kesher) יוכל לקרוא לה ישירות בלי מגבלות
// serialization של Server Actions. הקובץ הזה נשאר רק שכבת-הרשאה דקה +
// שתי פעולות עזר קטנות (תאריך אחרון, הגדרות תזמון).
import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfAnyWorkspace } from '../lib/contactGuards';
import { runKesherSyncCore } from './kesherSyncCore';

async function requireUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

export async function syncKesherReports(fromDate, toDate, createNewContacts = true) {
  const { supabase, user } = await requireUser();
  const allowed = await isManagerOfAnyWorkspace(supabase, user.id);
  if (!allowed) return { error: 'רק בעלים/מנהל יכול להריץ סנכרון מקשר' };
  return runKesherSyncCore(supabase, user, fromDate, toDate, createNewContacts, 'manual');
}

// התאריך האחרון שסונכרן בהצלחה (to_date של הריצה האחרונה) - למילוי
// אוטומטי של "מתאריך" ב-KesherSyncButton, כדי שלא יצטרכו לזכור/לחשב
// ידנית מאיפה להמשיך. null אם אף פעם לא סונכרן.
export async function getLastKesherSyncDate() {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from('kesher_sync_runs').select('to_date').order('run_at', { ascending: false }).limit(1).maybeSingle();
  return data?.to_date || null;
}

// שורה יחידה קבועה (id=true) - קצב הרצת ה-cron האוטומטי (app/api/cron/
// sync-kesher) נשלט מכאן, לא מקובע בקוד - כדי שמנהל יוכל להאיץ מ"פעם
// ביום" ל"כל כמה דקות" (למשל בזמן קמפיין) בלי דיפלוי חדש.
export async function getKesherSyncSettings() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from('kesher_sync_settings').select('interval_minutes, enabled').eq('id', true).maybeSingle();
  return data || { interval_minutes: 1440, enabled: false };
}

export async function updateKesherSyncSettings(intervalMinutes, enabled) {
  const { supabase, user } = await requireUser();
  const allowed = await isManagerOfAnyWorkspace(supabase, user.id);
  if (!allowed) return { error: 'רק בעלים/מנהל יכול לשנות הגדרות סנכרון' };
  const validInterval = Number(intervalMinutes) >= 1 ? Number(intervalMinutes) : 1440;
  const { error } = await supabase.from('kesher_sync_settings')
    .update({ interval_minutes: validInterval, enabled: !!enabled, updated_at: new Date().toISOString(), updated_by: user.id })
    .eq('id', true);
  if (error) return { error: error.message };
  return { success: true };
}
