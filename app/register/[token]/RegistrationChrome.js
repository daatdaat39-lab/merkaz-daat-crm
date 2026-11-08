import { BRAND, brandStyleVars } from '../../../lib/brand';

// מעטפת חזותית משותפת לכל מצבי עמוד הרישום הציבורי (טופס, "תודה", קישור שגוי,
// פג תוקף, הרשמה שהושלמה): כותרת מותג, כרטיסים, אייקונים והערת אבטחה. קובץ
// ללא hooks - משמש גם את העמוד (שרת) וגם את מסך הטופס (לקוח).

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

export function IconCheckCircle({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <circle cx="12" cy="12" r="10" /><path d="M8 12.5l2.7 2.7L16 9.5" />
    </svg>
  );
}
export function IconUpload({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />
    </svg>
  );
}
export function IconLock({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" />
    </svg>
  );
}
export function IconPen({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" />
    </svg>
  );
}
export function IconClipboard({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4h6v3H9z" /><path d="M9 12h6M9 16h4" />
    </svg>
  );
}
export function IconFile({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5" />
    </svg>
  );
}
export function IconWarn({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18h.01" />
    </svg>
  );
}

export function BrandHeader({ brand = BRAND }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '6px 0 18px' }}>
      <div
        aria-hidden="true"
        style={{
          width: 38, height: 38, borderRadius: 11, background: 'var(--k-accent)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18,
        }}
      >
        {brand.mark}
      </div>
      <div style={{ fontFamily: 'var(--k-font-display)', fontSize: 21, fontWeight: 600, color: 'var(--k-text)' }}>{brand.name}</div>
    </div>
  );
}

export function SecurityNote({ brand = BRAND }) {
  return (
    <div style={{ marginTop: 22, fontSize: 12, color: 'var(--k-text-muted)', textAlign: 'center', lineHeight: 1.8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <IconLock />
        <span>המידע נשמר בצורה מאובטחת ונגיש לצוות {brand.name} בלבד</span>
      </div>
      {brand.site && (
        <a href={brand.site} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--k-accent)', textDecoration: 'none' }}>
          לאתר {brand.name}
        </a>
      )}
    </div>
  );
}

// brand = ערכת המותג של המחלקה (lib/brand.js getBrand); בלעדיה - ברירת המחדל.
export function PageShell({ children, wide, brand = BRAND }) {
  return (
    <div
      style={{
        ...brandStyleVars(brand),
        background: 'linear-gradient(180deg, var(--k-bg) 0%, var(--k-pill-bg) 100%)', minHeight: '100vh', padding: '20px 14px 40px',
        color: 'var(--k-text)',
      }}
    >
      {brand.fontsHref && <link rel="stylesheet" href={brand.fontsHref} />}
      <div style={{ maxWidth: wide ? 600 : 460, margin: '0 auto' }}>
        <BrandHeader brand={brand} />
        {children}
        <SecurityNote brand={brand} />
      </div>
    </div>
  );
}

export const cardStyle = {
  background: 'var(--k-surface)',
  border: '1px solid var(--k-border)',
  borderRadius: 18,
  boxShadow: '0 4px 24px rgba(10, 26, 47, 0.06)',
};

// כרטיס הודעה ממורכז (תודה / שגיאה / פג תוקף / הושלם)
export function MessageCard({ tone = 'neutral', icon, title, children }) {
  const colors = {
    ok: { bg: 'var(--k-ok-bg)', fg: 'var(--k-ok-text)' },
    warn: { bg: 'var(--k-caution-bg)', fg: 'var(--k-caution-text)' },
    neutral: { bg: 'var(--k-pill-bg)', fg: 'var(--k-text-muted)' },
  }[tone];
  return (
    <div style={{ ...cardStyle, padding: '36px 28px', textAlign: 'center' }}>
      <div
        style={{
          width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px', background: colors.bg, color: colors.fg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {icon}
      </div>
      <h1 style={{ fontFamily: 'var(--k-font-display)', fontSize: 22, margin: '0 0 8px', color: 'var(--k-text)' }}>{title}</h1>
      <div style={{ fontSize: 14.5, color: 'var(--k-text-muted)', lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}
