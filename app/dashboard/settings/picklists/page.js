import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfAnyWorkspace } from '../../lib/contactGuards';
import { getPicklistValues } from '../../lib/picklists';
import PicklistsClient from './PicklistsClient';

// ניהול רשימות בחירה דינמיות (מיגרציה 0034) - כרגע שתי רשימות מחוברות
// בפועל למקומות שמשתמשים בהן: סיבות סגירה (גלובלי, כל המחלקות) וקטגוריות
// קמפיין (מחלקת תרומות). owner/admin בלבד.
export default async function PicklistsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const allowed = await isManagerOfAnyWorkspace(supabase, user.id);
  if (!allowed) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 24px' }}>
        <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
        <div style={{ marginTop: 20, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', fontSize: 12.5, color: '#92400e' }}>
          רק owner/admin יכול לערוך רשימות בחירה.
        </div>
      </div>
    );
  }

  const { data: donationsWs } = await supabase.from('workspaces').select('id').eq('name', 'תרומות').single();

  const [closeReasons, campaignCategories] = await Promise.all([
    getPicklistValues(supabase, 'close_reason', null),
    donationsWs ? getPicklistValues(supabase, 'campaign_category', donationsWs.id) : [],
  ]);

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 24px' }}>
      <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
      <h1 style={{ fontFamily: 'var(--font-heading)', margin: '14px 0 4px', fontSize: 20 }}>רשימות בחירה</h1>
      <p style={{ margin: '0 0 20px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
        עריכת ערכי רשימות שמופיעות בטפסים במערכת - בלי לשנות קוד.
      </p>
      <PicklistsClient
        closeReasons={closeReasons}
        campaignCategories={campaignCategories}
        donationsWorkspaceId={donationsWs?.id || null}
      />
    </div>
  );
}
