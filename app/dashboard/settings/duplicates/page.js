import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfAnyWorkspace } from '../../lib/contactGuards';
import { findDuplicateCandidates } from '../../lib/findDuplicates';
import DuplicateQueueClient from './DuplicateQueueClient';

// תור בדיקת כפליות - סורק את כל אנשי הקשר במערכת (לא רק מחלקה אחת),
// מאתר זוגות עם ת"ז/טלפון/מייל זהים או שם דומה מאוד (ר' findDuplicates.js),
// ומאפשר לעבור עליהם זוג-זוג ולמזג (משתמש שוב ב-MergeFieldsPicker/
// mergeContacts הקיימים) או לסמן "לא כפילות".
export default async function DuplicatesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const allowed = await isManagerOfAnyWorkspace(supabase, user.id);
  if (!allowed) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 24px' }}>
        <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
        <div style={{ marginTop: 20, background: 'var(--amber-bg, #fffbeb)', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', fontSize: 12.5, color: '#92400e' }}>
          רק owner או admin יכולים לגשת לבדיקת כפליות.
        </div>
      </div>
    );
  }

  const [{ data: contactRows }, { data: dismissedPairs }] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, first, last, phone, phone2, email, email2, idnum, source, dept, tags, notes, frozen, created_at, contact_departments (stage, workspaces:workspace_id (name))'),
    supabase.from('dismissed_duplicate_pairs').select('contact_id_a, contact_id_b'),
  ]);

  const contacts = (contactRows || []).map((c) => ({
    ...c,
    departments: (c.contact_departments || []).map((d) => ({ stage: d.stage, workspaceName: d.workspaces?.name || 'מחלקה' })),
  }));

  const { candidates, nameMatchSkipped } = findDuplicateCandidates(contacts, dismissedPairs || []);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>
      <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
      <h1 style={{ fontFamily: 'var(--font-heading)', margin: '14px 0 6px', fontSize: 20 }}>בדיקת כפליות</h1>
      <p style={{ margin: '0 0 4px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
        סריקה של כל אנשי הקשר במערכת — זוגות עם ת"ז/טלפון/מייל זהים, או שם דומה מאוד. עברו זוג-זוג ומזגו, או סמנו "לא כפילות".
      </p>
      {nameMatchSkipped && (
        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#c2760f' }}>
          ⚠ יש יותר מדי אנשי קשר לבדיקת דמיון שמות מלאה — הוצגו רק התאמות מדויקות (ת"ז/טלפון/מייל).
        </p>
      )}
      <DuplicateQueueClient initialCandidates={candidates} />
    </div>
  );
}
