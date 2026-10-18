'use client';

import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT = 760;

// שלד תלת-עמודות משותף למסכי-עבודה חדשים (מכירות/שירות) - הכללה של
// הדפוס הדו-עמודתי הקיים ב-ActiveCallPanel.js (flex 1 1 55%/45% +
// borderInlineEnd + overflowY עצמאי לכל עמודה), לא עמוד-מלא עם מודאל -
// כאן זה route אמיתי, לא חלון-צף, אז אין position:fixed/overlay.
//
// רספונסיביות (שלב 1 מתוכנית-העיצוב-מחדש): עד עכשיו לא היה שום @media
// query בכל הפרויקט (inline-styles-בלבד). במקום להכניס <style> גלובלי
// ראשון-מסוגו, עוקבים אחרי רוחב-המסך ב-JS ומחליפים בין flexDirection
// 'row'/'column' - נשאר עקבי עם המוסכמה הקיימת. בנייד: עמודות נערמות
// בסדר מרכז(ציר-זמן)→ימין(סטטוס/קשר)→שמאל(תסריטים/ידע), כי זה מה
// שנציג צריך לראות קודם כשהוא פותח את המסך מהטלפון.
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

export default function ThreeColumnScreen({ header, hero, right, center, left, children }) {
  const isMobile = useIsMobile();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: isMobile ? 'auto' : 'calc(100vh - 56px)', minHeight: isMobile ? '100%' : undefined }}>
      {header && (
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border, #e5e5e5)', flex: 'none' }}>
          {header}
        </div>
      )}
      {hero && <div style={{ flex: 'none' }}>{hero}</div>}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', flex: 1, overflow: isMobile ? 'visible' : 'hidden' }}>
        <div style={{
          order: isMobile ? 2 : 0, flex: isMobile ? 'none' : '1 1 30%', padding: '18px 20px',
          overflowY: isMobile ? 'visible' : 'auto', borderInlineEnd: isMobile ? 'none' : '1px solid var(--border, #e5e5e5)',
          borderBottom: isMobile ? '1px solid var(--border, #e5e5e5)' : 'none',
        }}>
          {right}
        </div>
        <div style={{
          order: isMobile ? 1 : 0, flex: isMobile ? 'none' : '1 1 42%', padding: '18px 20px',
          overflowY: isMobile ? 'visible' : 'auto', borderInlineEnd: isMobile ? 'none' : '1px solid var(--border, #e5e5e5)',
          borderBottom: isMobile ? '1px solid var(--border, #e5e5e5)' : 'none',
        }}>
          {center}
        </div>
        <div style={{ order: isMobile ? 3 : 0, flex: isMobile ? 'none' : '1 1 28%', padding: '18px 20px', overflowY: isMobile ? 'visible' : 'auto' }}>
          {left}
        </div>
      </div>
      {children}
    </div>
  );
}
