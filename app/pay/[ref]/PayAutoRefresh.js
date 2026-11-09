'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// מרענן את עמוד "מאשרים את התשלום" כל 20 שניות, עד 10 דקות, עד שהעסקה
// מגיעה מקשר (אז העמוד עצמו מחליף את ההודעה). אחרי זה נעצר - אין טעם לרענן
// לנצח עמוד שנשכח פתוח.
export default function PayAutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    let runs = 0;
    const timer = setInterval(() => {
      runs += 1;
      if (runs > 30) { clearInterval(timer); return; }
      router.refresh();
    }, 20000);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
