// Pipeline (שלבי ליד) שונה לכל מחלקה, לפי אפיון CRM מרכז דעת.
// "closed" הוא סטטוס נפרד מכל funnel - "נסגר/לא רלוונטי", עם סיבת סגירה חופשית.

export const PIPELINES = {
  'דעת למדני': {
    order: ['new_lead', 'open', 'meeting', 'registering', 'registered', 'started', 'graduate'],
    leadStages: ['new_lead', 'open', 'meeting'],
    wonStage: 'graduate',
  },
  'דעת ותבונה': {
    order: ['new_lead', 'open', 'meeting', 'registering', 'registered', 'active_student', 'graduate'],
    leadStages: ['new_lead', 'open', 'meeting'],
    wonStage: 'graduate',
  },
  'תרומות': {
    order: ['potential', 'no_contact_yet', 'contacted', 'call', 'offer', 'committed', 'donated', 'active_donor'],
    leadStages: ['potential', 'no_contact_yet', 'contacted'],
    wonStage: 'active_donor',
  },
};

const DEFAULT_PIPELINE = PIPELINES['דעת למדני'];

export function getPipeline(workspaceName) {
  return PIPELINES[workspaceName] || DEFAULT_PIPELINE;
}

export const STAGE_LABELS = {
  new_lead: 'ליד חדש',
  open: 'פתוח',
  meeting: 'פגישה',
  registering: 'בתהליך הרשמה',
  registered: 'נרשם',
  started: 'התחיל לימודים',
  active_student: 'תלמיד פעיל',
  graduate: 'בוגר',
  potential: 'פוטנציאל',
  no_contact_yet: 'טרם נוצר קשר',
  contacted: 'נוצר קשר',
  call: 'שיחה',
  offer: 'הצעה',
  committed: 'התחייבות לתרומה',
  donated: 'תרם',
  active_donor: 'תורם פעיל',
  closed: 'סגור / לא רלוונטי',
  credit_issue: 'תקלה בחיוב / אשראי נכשל',
};

export const STAGE_COLORS = {
  new_lead: { bg: '#eff6ff', color: '#2563eb' },
  open: { bg: '#eff6ff', color: '#2563eb' },
  meeting: { bg: '#f5f3ff', color: '#7c3aed' },
  registering: { bg: '#fffbeb', color: '#d97706' },
  registered: { bg: '#f0fdf4', color: '#16a34a' },
  started: { bg: '#f0fdf4', color: '#16a34a' },
  active_student: { bg: '#f0fdf4', color: '#16a34a' },
  graduate: { bg: '#ecfdf5', color: '#0d9488' },
  potential: { bg: '#f4f4f5', color: '#52525b' },
  no_contact_yet: { bg: '#f4f4f5', color: '#52525b' },
  contacted: { bg: '#f5f3ff', color: '#7c3aed' },
  call: { bg: '#f5f3ff', color: '#7c3aed' },
  offer: { bg: '#fffbeb', color: '#d97706' },
  committed: { bg: '#fffbeb', color: '#d97706' },
  donated: { bg: '#f0fdf4', color: '#16a34a' },
  active_donor: { bg: '#ecfdf5', color: '#0d9488' },
  closed: { bg: '#fef2f2', color: '#dc2626' },
  credit_issue: { bg: '#fef2f2', color: '#dc2626' },
};

// תגית תפקיד/מעמד של איש קשר במחלקה נתונה, לפי השלב שלו - לשימוש כשהוא עובר
// למחלקה אחרת (כדי שההיסטוריה שלו תישאר גלויה, לפי האפיון: "בוגר דעת למדני" וכו')
export function roleTag(workspaceName, stage) {
  const p = getPipeline(workspaceName);
  if (stage === 'closed') return null;
  if (stage === p.wonStage) {
    return workspaceName === 'תרומות' ? `תורם פעיל (${workspaceName})` : `בוגר ${workspaceName}`;
  }
  if (p.leadStages.includes(stage)) {
    return `מתעניין ${workspaceName}`;
  }
  return workspaceName === 'תרומות' ? `בתהליך תרומה (${workspaceName})` : `תלמיד ${workspaceName}`;
}

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

// נוסחי הקדשה ללוח השנה - איש קשר "זכאי ליום בלוח שנה" בוחר תאריך ואחד
// מהנוסחים האלה (או נוסח חופשי). מוגדרים כאן כדי שקל יהיה להוסיף/לשנות
// בלי לגעת בקומפוננטה - ר' CalendarDedicationsCard.js.
export const DEDICATION_TEMPLATES = [
  'לזכות',
  'לעילוי נשמת',
  'לרפואה שלמה',
  'להצלחת',
  'נוסח חופשי',
];

// תגית הזכאות ל"יום בלוח שנה" - רק איש קשר עם התגית הזו יכול לקבל תאריך
// הקדשה חדש (ר' CalendarDedicationsCard.js). נבחרה תגית רגילה (לא שדה
// נפרד) כי כל מנגנוני הסימון/סינון/הוספה-בכמות של תגיות כבר קיימים
// במערכת (TagPicker, QuickTagAdd, סינון קמפיינים) - אין צורך לבנות שום
// דבר חדש כדי לסמן/להסיר זכאות, כולל בכמות דרך קמפיין.
export const CALENDAR_ELIGIBLE_TAG = 'לוח שנה';
