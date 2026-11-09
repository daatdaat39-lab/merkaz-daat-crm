// בחירת תבניות לפי מחלקה ושלב בתהליך - כדי שהנציג לא יתמודד עם רשימה אחת ארוכה.
//
// כל תבנית (וואטסאפ/מייל) יכולה להיות משויכת (מיגרציה 0188):
//   workspace_id - מחלקה (ריק = כל המחלקות)
//   stage_key    - שלב בתהליך (ריק = כל השלבים)
//   category     - קטגוריה לקיבוץ ברשימה
//   course_id    - קורס (ריק = כל הקורסים)
//   is_active    - false = מוסתרת
// תבנית בלי שום שיוך מתנהגת בדיוק כמו קודם: מופיעה בכל מקום.
//
// הפלט:
//   suggested - עד MAX_SUGGESTED תבניות שהוגדרו במפורש לשלב הנוכחי (המומלצות)
//   groups    - כל שאר התבניות המתאימות למחלקה/לקורס, מקובצות לפי קטגוריה
//   all       - שתיהן ברצף אחד (לבדיקות "כמה תבניות יש")
// תבניות של מחלקה אחרת, או של קורס אחר, לא מוצעות כלל.

export const MAX_SUGGESTED = 4;
export const DEFAULT_CATEGORY = 'כללי';
// קטגוריות מוצעות בטופס ההגדרות (טקסט חופשי בכל זאת - זו רק הצעה להתחלה)
export const TEMPLATE_CATEGORIES = ['פתיחה', 'מעקב', 'מידע', 'הרשמה ותשלום', 'תזכורת', 'תודה וסיכום'];

function bySortThenName(a, b) {
  const sa = a.sort_order ?? 1000;
  const sb = b.sort_order ?? 1000;
  if (sa !== sb) return sa - sb;
  return String(a.name || '').localeCompare(String(b.name || ''), 'he');
}

export function splitTemplates(templates, { workspaceId = null, stageKey = null, courseId = null } = {}) {
  const eligible = (templates || []).filter((t) => {
    if (t.is_active === false) return false;
    if (t.workspace_id && workspaceId && t.workspace_id !== workspaceId) return false;
    if (t.course_id && courseId && t.course_id !== courseId) return false;
    return true;
  });

  // מומלצות = מוגדרות במפורש לשלב הזה. קודם אלה שגם ספציפיות למחלקה.
  const stageMatches = stageKey ? eligible.filter((t) => t.stage_key && t.stage_key === stageKey) : [];
  stageMatches.sort((a, b) => (Number(Boolean(b.workspace_id)) - Number(Boolean(a.workspace_id))) || bySortThenName(a, b));
  const suggested = stageMatches.slice(0, MAX_SUGGESTED);
  const suggestedIds = new Set(suggested.map((t) => t.id));

  // השאר: תבניות שמיועדות לשלב אחר מופיעות כאן (לא מוסתרות - נציג יכול להזדקק להן)
  const rest = eligible.filter((t) => !suggestedIds.has(t.id)).sort(bySortThenName);
  const byCategory = new Map();
  for (const t of rest) {
    const key = (t.category || '').trim() || DEFAULT_CATEGORY;
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(t);
  }
  const groups = [...byCategory.entries()]
    .sort(([a], [b]) => (a === DEFAULT_CATEGORY) - (b === DEFAULT_CATEGORY) || a.localeCompare(b, 'he'))
    .map(([category, items]) => ({ category, items }));

  return { suggested, groups, all: [...suggested, ...groups.flatMap((g) => g.items)] };
}

// כמה תבניות פעילות מוגדרות במפורש לשלב הנתון במחלקה הנתונה (כולל תבניות
// "כל המחלקות" עם אותו מפתח שלב). אותם כללי התאמה כמו ב-splitTemplates, כדי
// שמסך הכיסוי בהגדרות יראה בדיוק את מה שהנציג יקבל כהמלצה.
export function countTemplatesForStage(templates, { workspaceId, stageKey }) {
  return (templates || []).filter((t) =>
    t.is_active !== false
    && t.stage_key === stageKey
    && (!t.workspace_id || t.workspace_id === workspaceId)
  ).length;
}

// האם צריך להציג כותרות-קבוצה, או שמספיק רשימה שטוחה (כשאין שום סיווג - כמו היום)
export function needsGrouping({ suggested, groups }) {
  if (suggested.length > 0) return true;
  return !(groups.length <= 1 && (groups[0]?.category ?? DEFAULT_CATEGORY) === DEFAULT_CATEGORY);
}
