import NotConnectedButton from '../components/NotConnectedButton';

export default function CallsPage() {
  return (
    <div style={{ maxWidth: 700, margin: '60px auto', padding: '0 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📞</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>טלפוניה</div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
        חיוג מתוך המערכת, שיחות נכנסות עם פתיחת כרטיס אוטומטית, הקלטות, תמלול וסיכום AI.
        <br />
        דורש חיבור לספק טלפוניה (ימות המשיח / 015 Hello) — עדיין לא בוצע.
      </p>
      <NotConnectedButton label="חיבור ספק טלפוניה" icon="🔗" variant="primary" message="חיבור טלפוניה — עדיין לא מחובר" />
    </div>
  );
}
