// רשימת השדות הניתנים לעריכה על contacts - קובץ רגיל (לא 'use server')
// כי קובצי server-action יכולים לייצא רק פונקציות אסינכרוניות; המערך
// הזה משותף בין contacts/actions.js (updateContact/applyContactFieldChanges)
// לבין contactEditSuggestions.js (בדיקת ה-whitelist בהגשה ובאישור).
export const EDITABLE_FIELDS = [
  'first', 'last', 'phone', 'phone2', 'email', 'email2', 'dept', 'source', 'idnum', 'birth_date', 'gender', 'related_contact_id', 'relation_label',
  'city', 'street', 'house_number', 'apartment', 'zip_code', 'neighborhood', 'country', 'children_count',
];
