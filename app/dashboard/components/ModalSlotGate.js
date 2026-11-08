'use client';

import { usePathname } from 'next/navigation';

// רשת-ביטחון לחריץ ה-@modal (כרטיס-איש-קשר, intercepting route
// (.)contacts/[id]). Next.js 14 App Router ידוע-בבאג: כש-עוברים
// בניווט-פנימי (Link/router.push) מתוך המודל לנתיב-לא-קשור (למשל
// מסך-הטיפול-בליד), ה-Router Cache לפעמים לא-מרענן את חריץ ה-modal,
// וה-@modal/default.js (שאמור-להחזיר null) לא-נקרא בפועל - המודל
// נשאר-"תקוע" מצויר-על-המסך מעל-הדף-החדש. usePathname() תמיד-מדויק
// לנתיב-הנוכחי (לא-תלוי-ב-RSC-cache), אז זו-בדיקה-עצמאית-אמינה.
export default function ModalSlotGate({ children }) {
  const pathname = usePathname();
  const shouldShow = /^\/dashboard\/contacts\/[^/]+/.test(pathname || '');
  if (!shouldShow) return null;
  return children;
}
