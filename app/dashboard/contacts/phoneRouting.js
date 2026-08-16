// דדופ/ניתוב טלפונים "נוספים" (מיפויי phone3/phone4 באשף הייבוא) בין
// contacts.phone/phone2 (2 התאים הקבועים) לבין contact_phones (מיגרציה
// 0062, ללא הגבלת כמות). פונקציה טהורה, בלי גישה ל-DB - כדי שהלוגיקה
// תישאר קלה לבדיקה ונקייה מ-leadIntakeCore.js.
export function normalizePhoneDigits(p) {
  return (p || '').toString().replace(/\D/g, '').slice(-9);
}

// currentPhone/currentPhone2 - הערך האפקטיבי (אחרי מילוי משדות phone/
// phone2 הרגילים של השורה, אם היה). existingExtraPhones - מערך מחרוזות
// טלפון שכבר קיימות ב-contact_phones לאיש הקשר הזה (לא רלוונטי ליצירת
// כרטיס חדש - מערך ריק). candidates - row.additionalPhones
// ([{ phone, label }]). לעולם לא דורס phone/phone2 קיימים - רק ממלא אם
// ריקים. מחזיר { patch, toInsert }: patch למיזוג עם fill/insert של
// contacts, toInsert למה שנשאר ל-contact_phones.
export function planAdditionalPhones(currentPhone, currentPhone2, existingExtraPhones, candidates) {
  const known = new Set(
    [currentPhone, currentPhone2, ...(existingExtraPhones || [])].map(normalizePhoneDigits).filter(Boolean)
  );
  let phone = currentPhone;
  let phone2 = currentPhone2;
  const patch = {};
  const toInsert = [];

  for (const c of candidates || []) {
    const raw = (c?.phone || '').toString().trim();
    const norm = normalizePhoneDigits(raw);
    if (!raw || !norm || known.has(norm)) continue;
    known.add(norm);
    if (!phone) { phone = raw; patch.phone = raw; }
    else if (!phone2) { phone2 = raw; patch.phone2 = raw; }
    else toInsert.push({ phone: raw, label: (c.label || '').toString().trim() || null });
  }

  return { patch, toInsert };
}
