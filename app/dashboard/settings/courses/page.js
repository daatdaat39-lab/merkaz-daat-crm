import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfAnyWorkspace } from '../../lib/contactGuards';
import CoursesClient from './CoursesClient';

// מסך "קטלוג קורסים" (courses, migration 0148) - עד-היום רק נתוני-דמה
// (DEMO1/DEMO2 ממיגרציה 0154) היו בטבלה, בלי שום ממשק-ניהול. owner/admin
// בלבד, אותו דפוס כמו settings/lead-sources ו-settings/reference-content.
export default async function CoursesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const allowed = await isManagerOfAnyWorkspace(supabase, user.id);
  if (!allowed) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>
        <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
        <div style={{ marginTop: 20, background: 'var(--amber-bg)', border: '1px solid var(--amber)', borderRadius: 8, padding: '12px 16px', fontSize: 12.5, color: 'var(--amber)' }}>
          רק owner/admin יכול לנהל את קטלוג הקורסים.
        </div>
      </div>
    );
  }

  const { data: courses } = await supabase.from('courses').select('*').order('sort_order', { ascending: true });

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>
      <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
      <h1 style={{ fontFamily: 'var(--font-heading)', margin: '14px 0 4px', fontSize: 20 }}>קטלוג קורסים</h1>
      <p style={{ margin: '0 0 20px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
        קטלוג גלובלי (לא לפי מחלקה) - משמש גם במסך-הטיפול-בליד (בחירת קורס להמרה) וגם בכרטיס-איש-קשר (הרשמות לקורסים).
      </p>
      <CoursesClient courses={courses || []} />
    </div>
  );
}
