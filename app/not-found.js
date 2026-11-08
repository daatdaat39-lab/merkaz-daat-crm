// דף 404 בעברית - ללא זה Next מציג "404 This page could not be found" באנגלית,
// וגם מי שפותח קישור ישן/שגוי (למשל קישור רישום) רואה מסך לא-מוסבר.
export const metadata = { title: 'הדף לא נמצא — מרכז דעת' };

export default function NotFound() {
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
        <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>הדף לא נמצא</h1>
        <p style={{ fontSize: 14, margin: '0 0 18px', color: 'var(--k-text-muted, var(--text-secondary))', lineHeight: 1.6 }}>
          ייתכן שהכתובת שגויה או שהדף הוסר.
        </p>
        <a
          href="/dashboard"
          style={{
            display: 'inline-block',
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
  );
}
