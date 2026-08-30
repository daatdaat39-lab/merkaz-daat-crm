// אותה רשימת שדות בדיוק כמו EDITABLE_FIELDS ב-contacts/actions.js -
// קובץ נפרד (לא 'use server') כדי שקומפוננטת-לקוח (ContactSummaryPanel.js)
// תוכל לייבא את הרשימה בלי לגרור imports כבדים של קובץ-שרת.
export const EDITABLE_CONTACT_FIELDS = [
  { key: 'first', label: 'שם פרטי' },
  { key: 'last', label: 'שם משפחה' },
  { key: 'phone', label: 'טלפון' },
  { key: 'phone2', label: 'טלפון נוסף' },
  { key: 'email', label: 'מייל' },
  { key: 'email2', label: 'מייל נוסף' },
  { key: 'idnum', label: 'ת.ז' },
  { key: 'birth_date', label: 'תאריך לידה' },
  { key: 'gender', label: 'מגדר' },
  { key: 'city', label: 'עיר' },
  { key: 'street', label: 'רחוב' },
  { key: 'house_number', label: 'מספר בית' },
  { key: 'apartment', label: 'דירה' },
  { key: 'zip_code', label: 'מיקוד' },
  { key: 'neighborhood', label: 'שכונה' },
  { key: 'country', label: 'מדינה' },
  { key: 'children_count', label: 'מספר ילדים' },
];
