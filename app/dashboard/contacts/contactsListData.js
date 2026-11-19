// לוגיקה-משותפת לטעינת-רשימת-אנשי-הקשר - משמשת גם את page.js (טעינה-
// ראשונה, מצומצמת-למחלקה-הפעילה) וגם את fetchAllContactsAction.js
// (הרחבה-לכל-המערכת, מופעלת-מהלקוח כש-מחפשים/מסננים). שתי-הנקודות
// חייבות-להחזיר-בדיוק-אותה-צורת-נתונים כדי ש-ContactsBoard.js יוכל
// להחליף-ביניהן-בלי-קוד-נוסף.
export const CONTACTS_SELECT =
  'id, first, last, phone, phone2, email, dept, tags, source, frozen, created_at, contact_departments (workspace_id, stage, extra_fields, opened_process, course_id, courses:course_id (name), workspaces:workspace_id (name))';

export function shapeContacts(rows) {
  return (rows || []).map((c) => ({
    ...c,
    departments: (c.contact_departments || []).map((d) => ({
      workspaceId: d.workspace_id,
      name: d.workspaces?.name || 'מחלקה',
      stage: d.stage,
      extraFields: d.extra_fields || {},
      openedProcess: d.opened_process !== false,
      courseId: d.course_id || null,
      courseName: d.courses?.name || null,
    })),
  }));
}

// שולף אנשי-קשר - בלי idsFilter: כולם, בעמודים-של-1000 (מגבלת-ברירת-
// המחדל-של-PostgREST), כמו-שהיה-תמיד. עם idsFilter (רשימה-מצומצמת, למשל
// אנשי-הקשר-של-מחלקה-אחת): שולפים ב-batches-של-500 **במקביל** במקום
// בלולאת-pages - גם ככה כל batch קטן-מ-1000, וגם נמנעים-מ-.in() ענק-אחד
// (אלפי-UUIDs) שעלול-לחרוג-ממגבלת-אורך-URL. סדר-התוצאות לא-משנה כאן -
// ContactsBoard.js ממיין-מחדש בצד-הלקוח בכל-מקרה.
export async function fetchContactsPaged(supabase, idsFilter) {
  if (idsFilter) {
    const chunkSize = 500;
    const chunks = [];
    for (let i = 0; i < idsFilter.length; i += chunkSize) chunks.push(idsFilter.slice(i, i + chunkSize));
    if (chunks.length === 0) return [];
    const results = await Promise.all(
      chunks.map((chunk) => supabase.from('contacts').select(CONTACTS_SELECT).in('id', chunk))
    );
    return results.flatMap((r) => r.data || []);
  }

  const pageSize = 1000;
  let page = 0;
  let all = [];
  while (true) {
    const { data: pageData } = await supabase
      .from('contacts')
      .select(CONTACTS_SELECT)
      .order('created_at', { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (!pageData || pageData.length === 0) break;
    all = all.concat(pageData);
    if (pageData.length < pageSize) break;
    page++;
  }
  return all;
}

// אילו contact_id-ים שייכים-למחלקה-נתונה - שאילתה-קטנה-ונפרדת (לא-
// יודעת-כלום-על-contacts-עצמם), בעמודים-של-1000 (contact_departments
// של-מחלקה-בודדת יכולה-לעבור-1000, ר' "תרומות" ~3,620).
export async function fetchWorkspaceContactIds(supabase, workspaceId) {
  const pageSize = 1000;
  let page = 0;
  let all = [];
  while (true) {
    const { data: pageData } = await supabase
      .from('contact_departments')
      .select('contact_id')
      .eq('workspace_id', workspaceId)
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (!pageData || pageData.length === 0) break;
    all = all.concat(pageData.map((r) => r.contact_id));
    if (pageData.length < pageSize) break;
    page++;
  }
  return Array.from(new Set(all));
}
