import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfAnyWorkspace } from '../../lib/contactGuards';
import ReferenceContentClient from './ReferenceContentClient';

// ניהול תוכן-עזר (תסריטי-מכירה + מאגר-ידע) - שלב 2 ממודול מכירות/שירות.
// טבלה אחת (reference_content, migration 0149) עם kind שמבדיל בין שני
// השימושים - owner/admin בלבד, אותו דפוס בדיוק כמו settings/picklists.
export default async function ReferenceContentPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const allowed = await isManagerOfAnyWorkspace(supabase, user.id);
  if (!allowed) {
    return (
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '28px 24px' }}>
        <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
        <div style={{ marginTop: 20, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', fontSize: 12.5, color: '#92400e' }}>
          רק owner/admin יכול לערוך תוכן-עזר.
        </div>
      </div>
    );
  }

  const [{ data: items }, { data: courses }] = await Promise.all([
    supabase.from('reference_content').select('id, kind, course_id, tag, title, body, sort_order, is_active, trigger_condition, suggested_action, auto_suggested, approved, rejected').order('kind').order('sort_order'),
    supabase.from('courses').select('id, name').eq('is_active', true).order('sort_order').order('name'),
  ]);

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '28px 24px' }}>
      <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
      <h1 style={{ fontFamily: 'var(--font-heading)', margin: '14px 0 4px', fontSize: 20 }}>תוכן-עזר למכירות ושירות</h1>
      <p style={{ margin: '0 0 20px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
        תסריטי-שיחה וטיפול-בהתנגדויות למסך-המכירות, הצעות-פתרון למסך-השירות, וכללים שה-AI מתבסס עליהם בהמלצות - נטענים דינמית לפי קורס.
      </p>
      <ReferenceContentClient items={items || []} courses={courses || []} />
    </div>
  );
}
