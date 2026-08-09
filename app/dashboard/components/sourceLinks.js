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
  if (!rawLink) return null;
  const { decoded, path } = pathOnly(rawLink);

  if (workspaceId) {
    const { data: sources } = await supabase
      .from('lead_sources')
      .select('name, link_pattern')
      .eq('workspace_id', workspaceId)
      .not('link_pattern', 'is', null);
    const match = (sources || []).find((s) => s.link_pattern && (path.includes(s.link_pattern) || decoded.includes(s.link_pattern)));
    if (match) return match.name;
  }

  return SOURCE_LINK_MAP[path] || SOURCE_LINK_MAP[decoded] || rawLink;
}
