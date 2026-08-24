import { unstable_cache } from 'next/cache';
import { createAdminClient } from '../../../lib/supabase/admin';

// רשימת "כל התגיות הקיימות במערכת" (לצורך הצעות ב-TagFilterMultiSelect/
// TagPicker ובחישוב tagGroups) נדרשת בשלושה מקומות עצמאיים - שלד הדשבורד
// (layout.js, רץ בכל טעינת עמוד!), עמוד לידים, וכרטיס איש קשר - וכל אחד
// היה שולף בעצמו את tags+contact_departments של כל 6,500+ אנשי הקשר, שוב
// ושוב, בכל בקשה. זו לא רשימה שצריכה להיות עדכנית לשנייה (היא רק מזינה
// הצעות-אוטומטיות) - נשמרת במטמון ל-5 דקות במקום להישלף מחדש בכל טעינה.
// שולפת בדפים של 1000 (מגבלת ברירת המחדל של PostgREST) כדי לא לפספס
// תגיות שקיימות רק מעבר ל-1000 אנשי הקשר הראשונים.
//
// משתמשת ב-service-role client (לא בלקוח המבוסס-cookies של הבקשה) - כי
// unstable_cache אוסר להשתמש ב-cookies()/headers() בתוך פונקציה שנשמרת
// במטמון (הנתונים חייבים להיות זהים לכל בקשה, לא תלויי-משתמש). זה בטוח
// כאן: RLS על contacts היא ממילא "כל משתמש מחובר" גורף - אין כאן מידע
// שמשתמש רגיל לא כבר רואה בעצמו.
async function fetchAllContactTagsUncached() {
  const admin = createAdminClient();
  const pageSize = 1000;
  let from = 0;
  let all = [];
  while (true) {
    const { data: pageData } = await admin
      .from('contacts')
      .select('tags, contact_departments (workspaces:workspace_id (name))')
      .range(from, from + pageSize - 1);
    if (!pageData || pageData.length === 0) break;
    all = all.concat(pageData);
    if (pageData.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export const getAllContactTagRows = unstable_cache(
  fetchAllContactTagsUncached,
  ['all-contact-tag-rows'],
  { revalidate: 300 }
);
