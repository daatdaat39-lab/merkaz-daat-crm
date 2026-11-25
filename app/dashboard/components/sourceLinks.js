// זיהוי מפרסם/מקור לפי קישור מלא שהתקבל ממייל/webhook - עד migration
// 0057 זה היה מיפוי קשיח בקוד (SOURCE_LINK_MAP למטה), עכשיו מנוהל דרך
// מסך הגדרות → מקורות לידים (טבלת lead_sources, לפי מחלקה). הערך הישן
// נשאר כאן כ-fallback גלובלי אחרון, כדי שהקישור האמיתי הזה ימשיך לעבוד
// גם לפני שמישהו יעביר אותו למסך החדש - ר' lead_sources.
const SOURCE_LINK_MAP = {
  'https://daat.org.il/דעת-למדני-תואר-ראשון-3/': 'עומרי',
};

function pathOnly(rawLink) {
  let decoded;
  try {
    decoded = decodeURIComponent(rawLink.trim());
  } catch {
    decoded = rawLink.trim();
  }
  return { decoded, path: decoded.split('?')[0].split('#')[0] };
}

// מנסה לזהות מפרסם לפי קישור מלא - קודם מול lead_sources של המחלקה
// (link_pattern, השוואת substring כדי שאפשר יהיה לשמור רק את החלק
// הקבוע ולהתעלם מ-utm/פרמטרים משתנים), ואז מול המיפוי הקשיח הישן,
// ואם לא נמצא - מחזיר את הקישור הגולמי (עדיף מידע חלקי על פני איבוד
// המידע לגמרי).
export async function resolveSourceFromLink(supabase, workspaceId, rawLink) {
  return (await resolveSourceAndCourse(supabase, workspaceId, rawLink)).name;
}

// כמו resolveSourceFromLink, אבל מחזיר גם את הקורס שהוגדר למקור
// (lead_sources.course_id, migration 0197) - לטפסי האתר, שבהם הדף
// קובע גם את המפרסם וגם את הקורס. כשכמה תבניות מתאימות, הארוכה
// (הספציפית) ביותר מנצחת. matched=false כשאף מקור לא הותאם.
export async function resolveSourceAndCourse(supabase, workspaceId, rawLink) {
  if (!rawLink) return { name: null, courseId: null, matched: false };
  const { decoded, path } = pathOnly(rawLink);

  if (workspaceId) {
    const { data: sources } = await supabase
      .from('lead_sources')
      .select('name, link_pattern, course_id')
      .eq('workspace_id', workspaceId)
      .not('link_pattern', 'is', null);
    const match = (sources || [])
      .filter((s) => s.link_pattern && (path.includes(s.link_pattern) || decoded.includes(s.link_pattern)))
      .sort((a, b) => b.link_pattern.length - a.link_pattern.length)[0];
    if (match) return { name: match.name, courseId: match.course_id || null, matched: true };
  }

  // בלי התאמה נשמרת הכתובת עצמה - מפוענחת, כדי שכתובת בעברית תהיה קריאה
  // ולא רצף של %D7%A7...
  return { name: SOURCE_LINK_MAP[path] || SOURCE_LINK_MAP[decoded] || decoded, courseId: null, matched: false };
}
