// שורת סיכום קריאה-בלבד ל"לוח שנה והקדשות" - מוצג רק אם לאיש הקשר יש
// שורת חברות בקמפיין ההקדשות (dedicationCampaignId לא null). הוספה/הסרה/
// נעילה של תאריכים עברו לגמרי לעמוד הקמפיין (CampaignDetailClient.js) -
// זו כרטיסיית "לוח שנה והקדשות" הכללית תחת מחלקת תרומות, לא טבלה שטוחה
// גלובלית. אם לאיש הקשר אין חברות, לא מוצג כלום (לא רק בתרומות).
import Link from 'next/link';

export default function CalendarDedicationsCard({ dedications = [], dedicationCampaignId }) {
  if (!dedicationCampaignId) return null;

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid #e5e5e5', borderRadius: 8, padding: '12px 14px', marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase' }}>
          📅 לוח שנה והקדשות
        </span>
        <Link href={`/dashboard/sales/campaigns/${dedicationCampaignId}`} style={{ fontSize: 11.5, color: '#0a0a0a', textDecoration: 'none' }}>
          לצפייה בקמפיין ←
        </Link>
      </div>
      <div style={{ fontSize: 12.5, marginTop: 6, color: dedications.length ? '#333' : '#9b9b9b' }}>
        {dedications.length === 0
          ? 'אין תאריכי הקדשה עדיין'
          : `${dedications.length} ${dedications.length === 1 ? 'תאריך הקדשה' : 'תאריכי הקדשה'}`}
      </div>
    </div>
  );
}
