import ContactModalShell from '../../../contacts/[id]/ContactModalShell';
import ContactDetailContent from '../../../contacts/[id]/ContactDetailContent';

// גרסת ה"חלון צף" של כרטיס איש קשר - נתפסת אוטומטית ע"י Next.js כשלוחצים
// על קישור לאיש קשר מתוך האתר (לא בכניסה ישירה/רענון - אז מוצג העמוד
// המלא הרגיל ב-contacts/[id]/page.js).
export default async function ContactDetailModal({ params }) {
  return (
    <ContactModalShell>
      <ContactDetailContent contactId={params.id} isModal={true} />
    </ContactModalShell>
  );
}
