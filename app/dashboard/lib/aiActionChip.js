import { suggestActionChip } from '../../../lib/ai/suggestActionChip';

// כללים פעילים (reference_content kind='rule') - מסוננים לפי קורס
// באותו עיקרון בדיוק כמו תסריטי-המכירה/מאגר-הידע (course_id=null=כללי).
async function fetchActiveRules(supabase, courseId) {
  const { data } = await supabase.from('reference_content')
    .select('id, title, body, trigger_condition, suggested_action, course_id')
    .eq('kind', 'rule').eq('approved', true).eq('is_active', true);
  return (data || [])
    .filter((r) => !r.course_id || r.course_id === courseId)
    .map((r) => ({ id: r.id, title: r.title, triggerCondition: r.trigger_condition, suggestedAction: r.suggested_action, body: r.body }));
}

// יוצר/מרענן צ'יפ-AI ושומר בקאש - נקרא משני המקומות (מסך-טיפול-בודד
// בטעינת-עמוד, וכפתור-הרענון-הידני ברשימה) עם אותה לוגיקה בדיוק, רק
// טבלת-היעד שונה. fail-soft תמיד: בכישלון, משאיר stale=true (ינסה
// שוב בפעם הבאה) ומחזיר את הערך-הקודם-מהקאש בלי לשבור רינדור.
async function ensureActionChip(supabase, { table, id, stale, cachedSummary, contactName, courseId, communication }) {
  if (!stale) return cachedSummary;
  try {
    const rules = await fetchActiveRules(supabase, courseId);
    const result = await suggestActionChip({ name: contactName, ...communication, rules });
    if (!result) return cachedSummary;
    await supabase.from(table).update({
      ai_action_summary: result.actionText,
      ai_action_summary_updated_at: new Date().toISOString(),
      ai_action_summary_stale: false,
    }).eq('id', id);

    // אירועי "לא נמצא כלל מתאים" - תיעוד-קל-משקל ל-ai_unmatched_events,
    // לניתוח-תבניות מאוחר יותר (settings/reference-content, "נתח כללים
    // חדשים מה-AI"). fire-and-forget מכוון: כישלון כאן לעולם לא אמור
    // לחסום את כתיבת ה-actionText שכבר הצליחה למעלה.
    if (result.noMatchingRule) {
      supabase.from('ai_unmatched_events').insert({
        source_table: table, source_id: id, contact_name: contactName,
        course_id: courseId || null, action_text: result.actionText,
      }).then(() => {}, () => {});
    }

    return result.actionText;
  } catch {
    return cachedSummary;
  }
}

export async function ensureLeadActionChip(supabase, args) {
  return ensureActionChip(supabase, { ...args, table: 'contact_departments' });
}

export async function ensureCaseActionChip(supabase, args) {
  return ensureActionChip(supabase, { ...args, table: 'service_cases' });
}
