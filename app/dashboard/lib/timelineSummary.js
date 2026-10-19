import { summarizeTimeline } from '../../../lib/ai/summarizeTimeline';

// סיכום-AI קצר לתיבת "סיכום" מעל ציר-הזמן המתומצת (ר' תוכנית עיצוב-
// מחדש) - קאשינג דומה ל-aiActionChip.js, אבל "מתיישן" לא ע"י טריגר-DB
// (ציר-הזמן מורכב מ-7 טבלאות שונות, אי-אפשר טריגר אחד שמכסה את כולן)
// אלא ע"י השוואת מספר-הפריטים-הכולל שכבר נטען-ממילא לרינדור ציר-הזמן
// (currentItemCount) מול המספר ששמור בקאש - שינוי = נוסף פריט חדש.
// fail-soft תמיד: בכישלון/חוסר-שינוי, מחזיר את הערך השמור בלי לשבור רינדור.
async function ensureTimelineSummary(supabase, { table, id, cachedSummary, cachedItemCount, currentItemCount, contactName, communication }) {
  if (cachedSummary && cachedItemCount === currentItemCount) return cachedSummary;
  if (currentItemCount === 0) return null;
  try {
    const text = await summarizeTimeline({ name: contactName, ...communication });
    if (!text) return cachedSummary;
    await supabase.from(table).update({
      ai_timeline_summary: text,
      ai_timeline_summary_item_count: currentItemCount,
    }).eq('id', id);
    return text;
  } catch {
    return cachedSummary;
  }
}

export async function ensureLeadTimelineSummary(supabase, args) {
  return ensureTimelineSummary(supabase, { ...args, table: 'contact_departments' });
}

export async function ensureCaseTimelineSummary(supabase, args) {
  return ensureTimelineSummary(supabase, { ...args, table: 'service_cases' });
}
