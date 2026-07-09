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
