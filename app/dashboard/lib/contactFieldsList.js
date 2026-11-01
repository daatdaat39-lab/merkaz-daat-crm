// רשימת השדות הניתנים לעריכה על contacts - קובץ רגיל (לא 'use server')
// כי קובצי server-action יכולים לייצא רק פונקציות אסינכרוניות; המערך
// הזה משותף בין contacts/actions.js (updateContact/applyContactFieldChanges)
// לבין contactEditSuggestions.js (בדיקת ה-whitelist בהגשה ובאישור).
export const EDITABLE_FIELDS = [
  'first', 'last', 'phone', 'phone2', 'email', 'email2', 'dept', 'source', 'idnum', 'birth_date', 'gender', 'related_contact_id', 'relation_label',
  'city', 'street', 'house_number', 'apartment', 'zip_code', 'neighborhood', 'country', 'children_count', 'occupation',
];

// רשימת-הערכים-הקבועה לשדה gender - משותפת בין טופס-העריכה-המלא
// (PersonalInfoCard.js) לבין צ'יפי FillSection, כדי שלא תישכפל.
export const GENDER_OPTIONS = [
  { value: 'זכר', label: 'זכר' },
  { value: 'נקבה', label: 'נקבה' },
];

// השדות-המשניים-שניתנים-להצגה-אישית "תמיד-פתוחים" ב"פרטים אישיים"
// (profiles.personal_info_always_open) - משותף בין PersonalInfoCard.js
// (רינדור) לבין my-preferences (בחירה). כל key מתאים לבלוק-תצוגה
// אחד בתוך "+ עוד פרטים" (לא תמיד שדה-DB יחיד - "תאריך לידה" למשל
// מכסה גם גיל/תאריך-עברי-הנגזרים-ממנו, "כתובת" מכסה 4 שדות יחד).
export const PERSONAL_INFO_ALWAYS_OPEN_CANDIDATES = [
  { key: 'idnum', label: 'ת.ז / מזהה' },
  { key: 'birth_date', label: 'תאריך לידה (+ גיל, תאריך עברי)' },
  { key: 'gender', label: 'מגדר' },
  { key: 'children_count', label: 'מספר ילדים' },
  { key: 'source', label: 'מקור' },
  { key: 'created_at', label: 'נוצר בתאריך' },
  { key: 'phone2', label: 'טלפון נוסף' },
  { key: 'email2', label: 'מייל נוסף' },
  { key: 'address', label: 'כתובת מלאה' },
  { key: 'external_ids', label: 'מזהים במערכות חיצוניות' },
  { key: 'last_activity', label: 'פעילות אחרונה' },
  { key: 'next_meeting', label: 'פגישה קרובה' },
  { key: 'agent', label: 'נציג מטפל' },
];
