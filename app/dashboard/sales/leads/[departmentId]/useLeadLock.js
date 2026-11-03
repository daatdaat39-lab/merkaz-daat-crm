'use client';

import { useEffect, useState } from 'react';
import { lockLead, heartbeatLeadLock, releaseLeadLock } from './leadLockActions';

// נעילת-ליד (migration 0148/lockLead) - מחולץ מתוך LeadWorkScreen.js כדי
// שישמש-גם-אותו-וגם את מסך-הרישום-הנפרד (route חדש, registration/) - אותו
// ליד יכול-להיפתח-משני-המסכים, וה-RPC כבר-תומך-ב-reclaim-עצמי-לאותו-
// משתמש (ר' הערה ב-leadLockActions.js) אז-מעבר-בין-המסכים-לא-מתנגש.
// נועל ברגע-הפתיחה, פעימת-חיים כל 5 דקות, ומשחרר **רק** ב-beforeunload
// (לא visibilitychange - ר' ActiveCallPanel.js על אותה סכנה בדיוק).
export function useLeadLock(departmentId) {
  const [lockState, setLockState] = useState('checking'); // checking | locked | denied
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    lockLead(departmentId).then((res) => {
      if (cancelled) return;
      if (res?.error || !res?.locked) {
        setLockState('denied');
        setError(res?.error || 'הליד הזה כבר נעול אצל נציג אחר כרגע');
      } else {
        setLockState('locked');
      }
    });
    return () => { cancelled = true; };
  }, [departmentId]);

  useEffect(() => {
    if (lockState !== 'locked') return;
    const interval = setInterval(async () => {
      const res = await heartbeatLeadLock(departmentId);
      if (res && res.stillLocked === false) {
        setLockState('denied');
        setError('הנעילה על הליד הזה כבר לא בתוקף - כנראה נתפס בינתיים ע"י נציג אחר');
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [departmentId, lockState]);

  useEffect(() => {
    function releaseOnHide() {
      if (lockState === 'locked') releaseLeadLock(departmentId);
    }
    window.addEventListener('beforeunload', releaseOnHide);
    return () => window.removeEventListener('beforeunload', releaseOnHide);
  }, [departmentId, lockState]);

  // ניווט-פנימי (Link/SPA) לא-מפעיל beforeunload - בלי-זה הליד-היה-נשאר-
  // "נעול" עד-הפעימה-הבאה אחרי-שהנציג-כבר-עזב-את-המסך. לקרוא-לזה-במפורש
  // בכל-קישור-יציאה (כרטיס-מלא, חזרה-לרשימה, ומעבר-בין-שני-מסכי-הליד).
  function releaseOnNavigate() {
    if (lockState === 'locked') releaseLeadLock(departmentId);
  }

  return { lockState, error, releaseOnNavigate };
}
