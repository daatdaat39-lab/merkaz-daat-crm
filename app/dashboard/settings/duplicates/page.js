import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfAnyWorkspace } from '../../lib/contactGuards';
import { detectCoupleCandidates } from '../../lib/findDuplicates';
import { loadDuplicateCandidatesWithMoneyCounts } from '../../lib/duplicateCandidates';
import DuplicateQueueClient from './DuplicateQueueClient';
import CoupleCandidatesSection from './CoupleCandidatesSection';
import BulkAutoMergeSection from './BulkAutoMergeSection';

// תור בדיקת כפליות - סורק את כל אנשי הקשר במערכת (לא רק מחלקה אחת),
// מאתר זוגות עם ת"ז/טלפון/מייל זהים או שם דומה מאוד (ר' findDuplicates.js),
// ומאפשר לעבור עליהם זוג-זוג ולמזג (משתמש שוב ב-MergeFieldsPicker/
// mergeContacts הקיימים) או לסמן "לא כפילות". BulkAutoMergeSection מוסיף
// מעליו אפשרות מיזוג-אוטומטי לזוגות ודאיים (ת"ז/טלפון/מייל/אותם רכיבי
// שם, בלי נתונים כספיים בסיכון) - ר' "תוכנית: ניקוי תור קונפליקטי-ייבוא...".
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

  const [{ candidatesWithCounts, namePairsError }, { data: dismissedCoupleRows }] = await Promise.all([
    loadDuplicateCandidatesWithMoneyCounts(supabase),
    supabase.from('dismissed_couple_candidates').select('contact_id'),
  ]);

  // detectCoupleCandidates צריך את רשימת אנשי-הקשר עצמה, לא את זוגות-
  // הכפילות - loadDuplicateCandidatesWithMoneyCounts לא מחזיר אותה (רק
  // את הזוגות), אז שולפים כאן בנפרד (זולה, בלי הצטרפות מחלקות/כסף).
  const { data: contactRowsForCouples } = await supabase.from('contacts').select('id, first, last');

  const coupleCandidates = detectCoupleCandidates(contactRowsForCouples || [], new Set((dismissedCoupleRows || []).map((r) => r.contact_id)));

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>
      <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
      <h1 style={{ fontFamily: 'var(--font-heading)', margin: '14px 0 6px', fontSize: 20 }}>בדיקת כפליות</h1>
      <p style={{ margin: '0 0 4px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
        סריקה של כל אנשי הקשר במערכת — זוגות עם ת"ז/טלפון/מייל זהים, או שם דומה מאוד. עברו זוג-זוג ומזגו, או סמנו "לא כפילות".
      </p>
      {namePairsError && (
        <div style={{ margin: '10px 0', background: 'var(--amber-bg, #fffbeb)', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, color: '#92400e' }}>
          ⚠ בדיקת "שם דומה" נכשלה זמנית (שגיאת שרת) - התור למטה מציג רק התאמות מדויקות (ת"ז/טלפון/מייל/אותם רכיבי שם). רעננו את העמוד כדי לנסות שוב.
        </div>
      )}
      <CoupleCandidatesSection initialCandidates={coupleCandidates} />
      <BulkAutoMergeSection />
      <DuplicateQueueClient initialCandidates={candidatesWithCounts} />
    </div>
  );
}
