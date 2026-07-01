import NotConnectedButton from '../components/NotConnectedButton';

export default function EmailPage() {
  return (
    <div style={{ maxWidth: 700, margin: '60px auto', padding: '0 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>✉️</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>תיבת מייל</div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
        שליחה וקבלה מתוך המערכת, עם שיוך אוטומטי לכרטיס איש הקשר. תיבה נפרדת לכל workspace.
        <br />
        דורש חיבור ל-Google Workspace — עדיין לא בוצע.
      </p>
      <NotConnectedButton label="חיבור Google Workspace" icon="🔗" variant="primary" message="חיבור Google Workspace (Email) — עדיין לא מחובר" />
    </div>
  );
}
