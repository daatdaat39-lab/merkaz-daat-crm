'use client';

import { useEffect } from 'react';
import { heartbeatPresence } from '../lib/presenceActions';

// רכיב שקט (בלי UI) - פעימת-נוכחות כל 60 שניות למחלקה הפעילה, ר'
// migration 0153 + ההערה שם למה זו רק תשתית-תומכת (לא שער-היחיד
// להתראות-CTI, שמגיעות ממילא רק לטאבים שבאמת פתוחים/מחוברים).
export default function AgentPresenceHeartbeat({ workspaceId }) {
  useEffect(() => {
    if (!workspaceId) return;
    heartbeatPresence(workspaceId);
    const interval = setInterval(() => heartbeatPresence(workspaceId), 60000);
    return () => clearInterval(interval);
  }, [workspaceId]);

  return null;
}
