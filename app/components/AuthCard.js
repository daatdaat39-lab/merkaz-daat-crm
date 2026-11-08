import { BRAND } from '../../lib/brand';

// קלף משותף למסכי הכניסה (login / verify-otp / set-password) - עיצוב אחד על
// טוקני המערכת (--k-*) במקום שלושה עיצובים שונים עם צבעים קשיחים. הגודל
// 16px בשדות מונע זום אוטומטי ב-iOS, ו-aria-live מכריז שגיאות לקורא מסך.
export const authInputStyle = {
  width: '100%',
  padding: '11px 12px',
  margin: '6px 0 14px',
  borderRadius: 8,
  border: '1px solid var(--k-border)',
  background: 'var(--k-bg)',
  color: 'var(--k-text)',
  fontSize: 16,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

export const authLabelStyle = { fontSize: 12.5, color: 'var(--k-text-muted)' };

export const authPrimaryButtonStyle = (disabled) => ({
  width: '100%',
  padding: '12px 14px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--k-text)',
  color: 'var(--k-bg)',
  fontSize: 15,
  fontWeight: 600,
  cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.6 : 1,
});

export const authSecondaryButtonStyle = (disabled) => ({
  width: '100%',
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid var(--k-border)',
  background: 'none',
  color: 'var(--k-text-muted)',
  fontSize: 13.5,
  cursor: disabled ? 'default' : 'pointer',
});

export function AuthError({ message }) {
  return (
    <div role="alert" aria-live="polite" style={{ minHeight: message ? undefined : 0 }}>
      {message && (
        <div style={{
          color: 'var(--k-danger-text)', background: 'var(--k-danger-bg)', borderRadius: 8,
          padding: '9px 12px', fontSize: 13, marginBottom: 14, lineHeight: 1.5,
        }}>
          {message}
        </div>
      )}
    </div>
  );
}

export default function AuthCard({ title, subtitle, onSubmit, children }) {
  return (
    <div style={{
      display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center',
      padding: 16, background: 'var(--k-bg)',
    }}>
      <form onSubmit={onSubmit} style={{
        background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 14,
        padding: '28px 26px', width: '100%', maxWidth: 380, boxShadow: 'var(--shadow-soft)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 18 }}>
          <div
            aria-hidden="true"
            style={{
              width: 34, height: 34, borderRadius: 9, background: 'var(--k-accent)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16,
            }}
          >
            {BRAND.mark}
          </div>
          <div style={{ fontFamily: 'var(--k-font-display)', fontSize: 20, color: 'var(--k-text)' }}>{BRAND.name}</div>
        </div>
        <h1 style={{ fontFamily: 'var(--k-font-display)', textAlign: 'center', margin: '0 0 4px', fontSize: 20, color: 'var(--k-text)' }}>{title}</h1>
        {subtitle && <p style={{ textAlign: 'center', color: 'var(--k-text-muted)', fontSize: 13.5, margin: '0 0 20px', lineHeight: 1.5 }}>{subtitle}</p>}
        {children}
      </form>
    </div>
  );
}
