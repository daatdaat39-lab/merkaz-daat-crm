import NotConnectedButton from '../components/NotConnectedButton';

export default function WhatsappPage() {
  return (
    <div style={{ maxWidth: 700, margin: '60px auto', padding: '0 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>אינבוקס וואטסאפ</div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
        שליחה וקבלת הודעות מתוך המערכת, עם שיוך אוטומטי לכרטיס איש הקשר.
        <br />
        דורש חיבור ל-WhatsApp Business API — עדיין לא בוצע.
      </p>
      <NotConnectedButton label="חיבור וואטסאפ עסקי" icon="🔗" variant="primary" message="חיבור WhatsApp Business API — עדיין לא מחובר" />
    </div>
  );
}
