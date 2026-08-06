// מפתח טכני אוטומטי לשדה חדש - כדי שלא יצטרכו להקליד אנגלית ידנית.
// לוקח את המפתח הפנוי הבא בסדרה (field_1, field_2, ...) מול המפתחות
// הקיימים באותה מחלקה - כל לחיצה נותנת שם חדש שעדיין לא תפוס.
export function generateFieldKey(existingKeys = []) {
  const taken = new Set(existingKeys);
  let i = 1;
  while (taken.has(`field_${i}`)) i++;
  return `field_${i}`;
}
