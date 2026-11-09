import { PageShell, MessageCard, cardStyle, IconCheckCircle } from './RegistrationChrome';

// אינדיקטור שלבים של הלקוח בקישור "הכול": שלב 1 פרטי הרשמה, שלב 2 תשלום.
// קובץ בלי hooks - משמש גם את העמוד (שרת) וגם את מסך הטופס (לקוח).
export function StepIndicator({ current }) {
  const labels = { 1: 'פרטי הרשמה', 2: 'תשלום' };
  return (
    <div style={{ ...cardStyle, padding: '12px 16px', marginBottom: 14 }} role="status">
      <div style={{ fontSize: 12.5, color: 'var(--k-text-muted)', marginBottom: 8 }}>שלב {current} מתוך 2 · {labels[current]}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ flex: 1, height: 5, borderRadius: 999, background: 'var(--k-accent)' }} />
        <div style={{ flex: 1, height: 5, borderRadius: 999, background: current === 2 ? 'var(--k-accent)' : 'var(--k-pill-bg)' }} />
      </div>
    </div>
  );
}

// "הפרטים נקלטו" ואחריו סיכום וכפתור אחד לעמוד התשלום של קשר. הכפתור הוא
// קישור לנתיב /register/<טוקן>/pay, שבונה בשרת את כתובת התשלום האישית.
export default function PaymentStepCard({ brand, firstName, token, summary = {} }) {
  const { courseName, amount, installments } = summary;
  const rows = [
    courseName ? ['קורס', courseName] : null,
    installments > 1 ? ['תשלומים', String(installments)] : null,
  ].filter(Boolean);

  return (
    <PageShell brand={brand}>
      <StepIndicator current={2} />
      <MessageCard tone="ok" icon={<IconCheckCircle size={34} />} title={`הפרטים נקלטו${firstName ? `, ${firstName}` : ''}`}>
        נשאר שלב אחד: התשלום.
        <div style={{ margin: '18px auto 0', maxWidth: 340, textAlign: 'right' }}>
          {(rows.length > 0 || amount > 0) && (
            <div style={{ border: '1px solid var(--k-border)', borderRadius: 12, padding: '12px 14px', fontSize: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rows.map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ color: 'var(--k-text-muted)' }}>{label}</span>
                  <span style={{ color: 'var(--k-text)' }}>{value}</span>
                </div>
              ))}
              {amount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontWeight: 700, color: 'var(--k-text)' }}>
                  <span>לתשלום</span>
                  <span>{Number(amount).toLocaleString('he-IL')} ₪</span>
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ marginTop: 22 }}>
          <a
            href={`/register/${token}/pay`}
            style={{
              display: 'inline-block', fontFamily: 'var(--k-font-display)', fontSize: 16, fontWeight: 700,
              color: '#fff', background: 'var(--k-accent)', borderRadius: 12, padding: '14px 36px', textDecoration: 'none',
            }}
          >
            מעבר לתשלום מאובטח
          </a>
        </div>
        <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--k-text-muted)' }}>התשלום מתבצע בעמוד מאובטח של קשר.</div>
      </MessageCard>
    </PageShell>
  );
}
