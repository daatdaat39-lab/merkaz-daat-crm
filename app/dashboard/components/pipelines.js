// קבועים סטטיים per-מחלקה שנשארו כאן אחרי המעבר ל-pipeline דינמי
// (ר' app/dashboard/lib/pipelines.js ל-getPipeline/getAllPipelines,
// שמבוססים על טבלת pipeline_stages ולא על אובייקט קבוע בקוד).

// סיבות סגירת ליד (לפי האפיון - דעת למדני; משמש כברירת מחדל לכל המחלקות)
export const CLOSE_REASONS = [
  'לא מעוניין',
  'גיל לא מתאים',
  'גר באזור מרוחק',
  'לא עומד בתנאי קבלה',
  'בחר מוסד אחר',
  'אין מענה',
  'אחר',
];

// מהות הפנייה - למה הליד יצר קשר, לפי מחלקה (יופיע בטופס יצירת ליד/איש קשר,
// ונשמר כהיסטוריה - כל פנייה חדשה של אותו איש קשר נרשמת בנפרד ולא מוחקת קודמות)
export const INQUIRY_REASONS = {
  'דעת למדני': ['התעניינות ברישום לקורס', 'שאלה על תוכן הלימודים', 'שאלה על מחיר/תשלום', 'שאלה על מלגה', 'אחר'],
  'דעת ותבונה': ['התעניינות ברישום ללימודים', 'שאלה על תוכן הלימודים', 'שאלה על מחיר/תשלום', 'שאלה על מלגה', 'אחר'],
  'תרומות': ['רצון לתרום', 'שאלה על אופן התרומה', 'בקשת מידע על הארגון', 'עדכון פרטי תרומה קיימת', 'אחר'],
};
const DEFAULT_INQUIRY_REASONS = ['פנייה כללית', 'אחר'];

export function getInquiryReasons(workspaceName) {
  return INQUIRY_REASONS[workspaceName] || DEFAULT_INQUIRY_REASONS;
}

// עמודות נוספות ייעודיות לכל מחלקה בטבלת הלידים - נשמרות ב-extra_fields
// (jsonb) על שיוך המחלקה, כדי לא לדרוש מיגרציה חדשה בכל פעם שמוסיפים שדה.
// אלה הצעות ברירת מחדל - ניתן להתאים/להוסיף/להסיר שדות בקלות כאן.
export const EXTRA_FIELDS = {
  'דעת למדני': [
    { key: 'study_track', label: 'מסלול לימודים מבוקש', type: 'text' },
    { key: 'initial_payment_stage', label: 'שלב תשלום ראשוני', type: 'select', options: ['טרם שולם', 'מקדמה שולמה', 'שולם במלואו'] },
  ],
  'דעת ותבונה': [
    { key: 'study_track', label: 'מסלול לימודים מבוקש', type: 'text' },
    { key: 'initial_payment_stage', label: 'שלב תשלום ראשוני', type: 'select', options: ['טרם שולם', 'מקדמה שולמה', 'שולם במלואו'] },
    // שדות מצב לימודים - מוצגים בקוביית התלמיד בכרטיס (StudentStatsTile)
    { key: 'current_course', label: 'קורס נוכחי', type: 'text' },
    { key: 'graduate_of', label: 'בוגר הקורסים', type: 'text' },
    { key: 'graduation_year', label: 'שנת סיום', type: 'number' },
    { key: 'short_course_purchased', label: 'רכש קורס קצר לצפייה עצמית', type: 'select', options: ['כן', 'לא'] },
  ],
  'תרומות': [
    { key: 'expected_donation_amount', label: 'סכום תרומה', type: 'number' },
    { key: 'donation_type', label: 'סוג תרומה', type: 'select', options: ['חד פעמי', 'הוראת קבע'] },
    { key: 'donation_date', label: 'תאריך התרומה', type: 'date' },
    { key: 'standing_order_start_date', label: 'תאריך התחלה', type: 'date' },
    { key: 'standing_order_next_charge_date', label: 'תאריך חיוב הבא', type: 'date' },
    // סך התשלומים בהוראת הקבע - ריק פירושו "ללא תאריך סיום" (בקשר: 9999).
    // משמש לתצוגת "שילם X מתוך Y" בקוביית נתוני התרומה.
    { key: 'standing_order_total_payments', label: 'סה"כ תשלומים בהוראה', type: 'number' },
    { key: 'donor_type', label: 'תורם חוזר או חדש', type: 'select', options: ['חדש', 'חוזר'] },
    { key: 'pledge_fulfillment_date', label: 'תאריך מימוש הבטחת תרומה', type: 'date' },
    { key: 'donation_paused', label: 'תרומה מוקפאת זמנית', type: 'select', options: ['כן', 'לא'] },
    { key: 'paused_until', label: 'הקפאה עד תאריך', type: 'date' },
  ],
};

export function getExtraFields(workspaceName) {
  return EXTRA_FIELDS[workspaceName] || [];
}

// נוסחי הקדשה ללוח השנה - איש קשר "זכאי ליום בלוח שנה" (חבר בקמפיין
// ההקדשות, ר' sales/campaigns/actions.js) בוחר תאריך ואחד מהנוסחים האלה
// (או נוסח חופשי). מוגדרים כאן כדי שקל יהיה להוסיף/לשנות בלי לגעת
// בקומפוננטה - ר' CampaignDetailClient.js.
export const DEDICATION_TEMPLATES = [
  'לזכות',
  'לעילוי נשמת',
  'לרפואה שלמה',
  'להצלחת',
  'נוסח חופשי',
];
