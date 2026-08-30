import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfAnyWorkspace } from '../../lib/contactGuards';
import { getPendingContactEditSuggestions } from '../../lib/contactEditSuggestions';
import ContactCorrectionsClient from './ContactCorrectionsClient';

// תיקוני-פרטים שהוצעו (בעיקר ע"י טלפנים תוך כדי שיחה, ר' ContactSummaryPanel.js
// בתור-השיחות) וממתינים לאישור מנהל - contact_edit_suggestions, migration
// 0097. לעולם לא כתיבה ישירה - ר' contactEditSuggestions.js.
export default async function ContactCorrectionsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const allowed = await isManagerOfAnyWorkspace(supabase, user.id);
  if (!allowed) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 24px' }}>
        <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
        <div style={{ marginTop: 20, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', fontSize: 12.5, color: '#92400e' }}>
          רק owner/admin יכול לאשר תיקוני-פרטים.
        </div>
      </div>
    );
  }

  const res = await getPendingContactEditSuggestions();

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 24px' }}>
      <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
      <h1 style={{ fontFamily: 'var(--font-heading)', margin: '14px 0 4px', fontSize: 20 }}>תיקוני פרטים ממתינים</h1>
      <p style={{ margin: '0 0 20px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
        תיקונים שהוצעו (למשל ע"י טלפנים תוך כדי שיחה) - לא נכנסו לתוקף עד שמאשרים כאן.
      </p>
      <ContactCorrectionsClient initialSuggestions={res.suggestions || []} />
    </div>
  );
}
