// מקור יחיד לזהות המותג בממשק. ברירת המחדל (BRAND) חלה על כל המערכת; לכל מחלקה
// אפשר להגדיר ערכת מותג משלה (WORKSPACE_BRANDS, לפי שם המחלקה) - כרגע היא
// משמשת רק את הדפים שהלקוח רואה (דף הרישום הציבורי), כך שהחלפת לוגו/צבע
// היא שינוי כאן ולא חיפוש בקבצים. לוגו כתמונה עדיין לא הוטמע (דורש קובץ
// מקור מהארגון) - עד אז מוצג סמל טקסטואלי בצבע המותג.
export const BRAND = {
  name: 'מרכז דעת',
  subtitle: 'CRM',
  mark: 'ד',
};

// ערכות ללקוחות: צבעים מתוך האתר של המחלקה (סגול #5D2B7B, כחול #293E8D, רקע
// שמנת #FAF4E9, גופן IBM Plex Sans Hebrew). הערכה מלאה (גם טקסט/גבולות/מצבים)
// כדי שהדף יישאר קריא גם כשהדפדפן במצב כהה - הדף הציבורי תמיד בהיר.
export const WORKSPACE_BRANDS = {
  'דעת ותבונה': {
    name: 'דעת ותבונה',
    mark: 'ד',
    site: 'https://www.tvunah.com/',
    // הלוגו מהאתר של המחלקה (הורד באישור המשתמש, 479x109, PNG שקוף)
    logo: { src: '/brand/tvunah-logo.png', width: 479, height: 109 },
    fontFamily: "'IBM Plex Sans Hebrew', Heebo, -apple-system, 'Segoe UI', Arial, sans-serif",
    fontsHref: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Hebrew:wght@400;500;600;700&display=swap',
    theme: {
      '--k-accent': '#5D2B7B',
      '--k-bg': '#FAF4E9',
      '--k-surface': '#FFFFFF',
      '--k-pill-bg': '#F2E9F7',
      '--k-pill-text': '#5D2B7B',
      '--k-border': '#E3D8C6',
      '--k-text': '#2A2433',
      '--k-text-muted': '#6B6577',
      '--k-ok-bg': '#E8F4DC',
      '--k-ok-text': '#3E7410',
      '--k-danger-bg': '#FBE8EE',
      '--k-danger-text': '#A3244B',
      '--k-caution-bg': '#FFF3D6',
      '--k-caution-text': '#8A5A00',
    },
  },
};

export function getBrand(workspaceName) {
  return { ...BRAND, ...(WORKSPACE_BRANDS[workspaceName] || {}) };
}

// משתני CSS לשכבת-העטיפה של דף ללקוח (ריק כשאין ערכה מיוחדת למחלקה)
export function brandStyleVars(brand) {
  if (!brand?.theme) return {};
  return {
    ...brand.theme,
    '--k-font-display': brand.fontFamily,
    '--k-font-body': brand.fontFamily,
    fontFamily: brand.fontFamily,
    colorScheme: 'light',
  };
}
