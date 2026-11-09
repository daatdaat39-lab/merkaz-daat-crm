'use client';

// חלון "לקחת אחריות על הליד?" - קופץ אחרי פעולה אמיתית של נציג על ליד חדש
// שעדיין אין לו נציג (ר' useClaimPrompt.js). חוסם עד בחירה: "לקחת על שמי"
// (שיוך + שלב "פתוח") או "להשאיר פתוח לכולם" (שום שינוי). z-index מעל
// חלונות השליחה (1000) ומתחת ל-PendingAutomationWatcher (3000).
export default function ClaimLeadModal({ onClaim, onLeaveOpen, pending = false, error = '' }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--k-surface)', borderRadius: 16, width: 400, maxWidth: '92vw', padding: '22px 24px' }}>
        <div style={{ fontFamily: 'var(--k-font-display)', fontSize: 18, color: 'var(--k-text)', marginBottom: 8 }}>
          לקחת אחריות על הליד?
        </div>
        <div style={{ fontSize: 13, color: 'var(--k-text-muted)', lineHeight: 1.6, marginBottom: 16 }}>
          הליד עדיין בלי נציג. אם תיקח אותו על שמך הוא יעבור לשלב "פתוח". אם תשאיר אותו פתוח לכולם הוא יישאר "ליד חדש".
        </div>
        {error && <div style={{ fontSize: 12, color: 'var(--k-danger-text)', marginBottom: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button" onClick={onClaim} disabled={pending}
            style={{ background: 'var(--k-accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.6 : 1 }}
          >
            {pending ? 'משייך...' : 'לקחת על שמי'}
          </button>
          <button
            type="button" onClick={onLeaveOpen} disabled={pending}
            style={{ background: 'var(--k-surface)', color: 'var(--k-text)', border: '1px solid var(--k-border)', borderRadius: 8, padding: '8px 18px', fontSize: 13, cursor: pending ? 'default' : 'pointer' }}
          >
            להשאיר פתוח לכולם
          </button>
        </div>
      </div>
    </div>
  );
}
