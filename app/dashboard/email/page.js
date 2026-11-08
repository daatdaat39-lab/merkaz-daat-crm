import NotConnectedButton from '../components/NotConnectedButton';
import { MailIcon } from '../components/icons';

// מסך המייל עדיין לא מחובר - המייל היוצא עצמו (שליחה מכרטיס איש קשר) עובד
// דרך תיבות Gmail שמוגדרות לכל מחלקה בהגדרות ← מקורות לידים; כאן יהיה
// בעתיד תיבת דואר מלאה בתוך המערכת.
export default function EmailPage() {
  return (
    <div style={{ maxWidth: 700, margin: '60px auto', padding: '0 24px', textAlign: 'center' }}>
      <MailIcon size={40} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>תיבת מייל</div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.7 }}>
        תיבת הדואר המלאה בתוך המערכת עדיין לא מחוברת (דורשת חיבור ל-Google Workspace).
        <br />
        שליחת מייל לאיש קשר מכרטיס איש הקשר ממשיכה לעבוד דרך התיבה של המחלקה, ומוגדרת בהגדרות, מקורות לידים.
      </p>
      <NotConnectedButton label="חיבור Google Workspace" variant="primary" message="חיבור Google Workspace (Email) — עדיין לא מחובר" />
    </div>
  );
}
