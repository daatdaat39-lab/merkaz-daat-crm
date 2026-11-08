'use client';

// דף שגיאה כללי בעברית - בלעדיו Next מציג מסך ברירת-מחדל באנגלית, וגם
// חושף ללקוח הודעת שגיאה גולמית. כאן מציגים הודעה ידידותית בלבד; פרטי
// השגיאה נשארים בלוגים של השרת/הדפדפן (digest).
export default function Error({ error, reset }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'var(--k-bg, var(--bg))',
        color: 'var(--k-text, var(--text))',
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: '100%',
          textAlign: 'center',
          background: 'var(--k-surface, var(--bg))',
          border: '1px solid var(--k-border, var(--border))',
          borderRadius: 12,
          padding: '28px 24px',
        }}
      >
        <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>משהו השתבש</h1>
        <p style={{ fontSize: 14, margin: '0 0 18px', color: 'var(--k-text-muted, var(--text-secondary))', lineHeight: 1.6 }}>
          אירעה תקלה בטעינת הדף. אפשר לנסות שוב, ואם זה חוזר - לפנות למנהל המערכת.
        </p>
        {error?.digest && (
          <p style={{ fontSize: 11, margin: '0 0 14px', color: 'var(--k-text-muted, var(--text-muted))' }}>
            קוד תקלה: <bdi dir="ltr">{error.digest}</bdi>
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: '9px 18px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--k-accent, var(--accent))',
              color: '#fff',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            נסו שוב
          </button>
          <a
            href="/dashboard"
            style={{
              padding: '9px 18px',
              borderRadius: 8,
              border: '1px solid var(--k-border, var(--border))',
              color: 'inherit',
              fontSize: 14,
              textDecoration: 'none',
            }}
          >
            לדף הבית
          </a>
        </div>
      </div>
    </div>
  );
}
