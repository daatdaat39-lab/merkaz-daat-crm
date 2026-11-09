'use client';

import { useCallback, useState } from 'react';
import { assignAgentForLead } from '../../../contacts/actions';
import { STAGE_NEW_LEAD } from '../../../lib/leadStageKeys';

// "לקחת אחריות על הליד?" - נקרא מהמסכים אחרי פעולה אמיתית של הנציג על הליד
// (חיוג, שליחה, תיעוד, מילוי שדה, שמירה במסך הרישום). כשהליד עדיין "ליד
// חדש" וללא נציג (במחלקה שמוכרת קורסים) - פותח את החלון. "להשאיר פתוח"
// סוגר בלי שינוי, והחלון יקפוץ שוב בפעולה הבאה (כך הוחלט). שיוך בפועל וכלל
// השלב ("פתוח") נעשים בשרת (assignAgentForLead -> leadStageRules.js);
// onClaimed מקבל את תשובת השרת כדי שהמסך יעדכן agentId/stage מקומיים.
export function useClaimPrompt({ departmentId, enabled, userId, agentId, stage, onClaimed }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const needsClaim = !!enabled && !!userId && !agentId && stage === STAGE_NEW_LEAD;

  const notifyAction = useCallback(() => {
    if (!needsClaim) return;
    setError('');
    setOpen(true);
  }, [needsClaim]);

  async function claim() {
    setPending(true);
    setError('');
    try {
      const res = await assignAgentForLead(departmentId, userId);
      if (res?.error) { setError(res.error); return; }
      setOpen(false);
      onClaimed?.(res);
    } catch (e) {
      setError(e?.message || 'השיוך נכשל');
    } finally {
      setPending(false);
    }
  }

  function leaveOpen() {
    setOpen(false);
  }

  // claimOpen לא תלוי ב-needsClaim: בשמירה הראשונה במסך הרישום השלב עובר
  // ל"בתהליך הרשמה" באותו רגע שהחלון נפתח, והחלון צריך להישאר עד שהנציג בוחר.
  return { notifyAction, claimOpen: open, claim, leaveOpen, claimPending: pending, claimError: error };
}
