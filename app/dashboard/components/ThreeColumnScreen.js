'use client';

// שלד תלת-עמודות משותף למסכי-עבודה חדשים (מכירות/שירות, שלבים 3-4) -
// הכללה של הדפוס הדו-עמודתי הקיים ב-ActiveCallPanel.js (flex 1 1 55%/45%
// + borderInlineEnd + overflowY עצמאי לכל עמודה), לא עמוד-מלא עם מודאל -
// כאן זה route אמיתי, לא חלון-צף, אז אין position:fixed/overlay.
export default function ThreeColumnScreen({ header, right, center, left, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>
      {header && (
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border, #e5e5e5)', flex: 'none' }}>
          {header}
        </div>
      )}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: '1 1 30%', padding: '18px 20px', overflowY: 'auto', borderInlineEnd: '1px solid var(--border, #e5e5e5)' }}>
          {right}
        </div>
        <div style={{ flex: '1 1 42%', padding: '18px 20px', overflowY: 'auto', borderInlineEnd: '1px solid var(--border, #e5e5e5)' }}>
          {center}
        </div>
        <div style={{ flex: '1 1 28%', padding: '18px 20px', overflowY: 'auto' }}>
          {left}
        </div>
      </div>
      {children}
    </div>
  );
}
