import { getMyContactShares } from '../contacts/actions';
import InboxClient from './InboxClient';

// תיבת הודעות - אנשי קשר ששיתפו איתי עמיתים (contact_shares, מיגרציה
// 0033). getMyContactShares עצמה כבר דואגת להפניה ל-login אם אין משתמש.
export default async function InboxPage() {
  const shares = await getMyContactShares();

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 24px' }}>
      <h1 style={{ fontSize: 18, margin: '0 0 4px' }}>הודעות</h1>
      <p style={{ fontSize: 12.5, color: '#6b6b6b', margin: '0 0 20px' }}>אנשי קשר ששותפו איתך על ידי עמיתים</p>
      <InboxClient shares={shares} />
    </div>
  );
}
