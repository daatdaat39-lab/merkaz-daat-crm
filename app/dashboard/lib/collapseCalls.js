// מכווץ שיחות-עוקבות-זהות (אותה-זהות-מתקשר, אותו-כיוון, אותו-סטטוס)
// לשורה-אחת עם מונה "×N" - פותר הצפה-של-ring-group (015 מנסה כמה-שלוחות
// לאותה-שיחה-נכנסת, כל-ניסיון-שלוחה נרשם כשורת phone_calls נפרדת-משלו).
// רק-עוקבות (לא כל הרשימה) - כדי לא-לאחד שיחות-שונות-בזמנים-רחוקים
// שבמקרה חולקות אותו-מספר/סטטוס.
export function collapseConsecutiveCalls(calls, keyFn) {
  const result = [];
  for (const call of calls) {
    const key = keyFn(call);
    const prev = result[result.length - 1];
    if (prev && prev.__key === key) {
      prev.__count += 1;
      if (!prev.recording_url && call.recording_url) prev.recording_url = call.recording_url;
    } else {
      result.push({ ...call, __key: key, __count: 1 });
    }
  }
  return result;
}

export function phoneCallKey(c) {
  return [c.contact_id || c.snumber || c.dnumber || '', c.direction, c.answered ? 'answered' : 'unanswered'].join('|');
}
