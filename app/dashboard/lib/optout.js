// "לא לפנות" לפי ערוץ (contacts.email_optout_at / whatsapp_optout_at, migration
// 0186) - קובץ רגיל משותף לפעולות השליחה, לביצוע אוטומציות ולקליטת הודעות נכנסות.

export const OPTOUT_MESSAGES = {
  email: 'איש הקשר ביקש לא לקבל הודעות במייל - אפשר לבטל את הסימון בכרטיס איש הקשר',
  whatsapp: 'איש הקשר ביקש לא לקבל הודעות בוואטסאפ - אפשר לבטל את הסימון בכרטיס איש הקשר',
};

// הודעה נכנסת שהיא *בדיוק* בקשת הסרה (לא משפט ארוך שבמקרה מכיל את המילה).
// זיהוי אוטומטי כבוי כברירת מחדל - מופעל רק עם WHATSAPP_OPTOUT_KEYWORDS_ENABLED=true,
// ורק מסמן את איש הקשר: אין שום תשובה אוטומטית ללקוח (ניסוח תשובה לא הוחלט).
const KEYWORDS = new Set([
  'הסר', 'הסירו', 'הסר אותי', 'הסירו אותי', 'הסרה', 'להסרה', 'הפסק', 'הפסיקו', 'stop', 'unsubscribe',
]);

export function isOptOutKeyword(text) {
  const t = String(text || '').trim().toLowerCase().replace(/[.!?,"'״׳]/g, '').replace(/\s+/g, ' ');
  return KEYWORDS.has(t);
}

// קוראים אחרי שהודעה נכנסת נשמרה (webhook / poll). מחזירה true אם סומן.
export async function flagOptOutIfKeyword(supabase, contactId, message) {
  if (process.env.WHATSAPP_OPTOUT_KEYWORDS_ENABLED !== 'true') return false;
  if (!contactId || !isOptOutKeyword(message)) return false;
  const { error } = await supabase
    .from('contacts')
    .update({
      whatsapp_optout_at: new Date().toISOString(),
      optout_source: 'customer_keyword',
      optout_note: `הלקוח כתב בוואטסאפ: ${String(message).trim().slice(0, 40)}`,
    })
    .eq('id', contactId)
    .is('whatsapp_optout_at', null);
  return !error;
}
