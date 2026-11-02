'use client';

import { useState } from 'react';
import { CLOSE_REASONS } from '../../components/pipelines';

// פס-מקטעים-יחיד לשלבי ה-pipeline של מחלקה - כל שלב הוא-מקטע-בתוך-פס-
// אחד-מעוגל (לא-עוד-נקודות-קטנות+קווים+כיתוב-זעיר), בגובה-קריא (כמו
// שורת-ליד), עם-טקסט-בגודל-רגיל. לחיצה-על-מקטע משנה-שלב (קדימה או
// אחורה, שניהם מותרים). שלבי-צד (sideStages, למשל "סגור"/"תקלה בחיוב")
// מוצגים כשבבים נפרדים אחרי-הפס, לא כחלק מהרצף המספרי - נטענים דינמית
// מ-pipeline_stages (מיגרציה 0036), לא קבועים בקוד. "סגור" הוא שלב-הצד
// היחיד עם זרימת בחירת סיבה (pendingClose) - שלבי-צד אחרים מוגדרים
// ישירות בלחיצה אחת.
// closeReasons (אופציונלי) - מגיע מרשימת בחירה דינמית (הגדרות ← רשימות
// בחירה); אם לא סופק, נופל חזרה לרשימה הקבועה בקוד.
export default function StageStepper({ currentStage, currentClosedReason, stages, sideStages = [], labels = {}, colors = {}, action, disabled, closeReasons }) {
  const reasons = closeReasons?.length ? closeReasons : CLOSE_REASONS;
  const [pendingClose, setPendingClose] = useState(false);
  const [reason, setReason] = useState(currentClosedReason || reasons[0]);

  const currentIndex = stages.indexOf(currentStage);
  const isSideActive = sideStages.includes(currentStage);

  const label = (key) => labels[key] || key;
  const color = (key) => colors[key] || { bg: 'var(--k-danger-bg)', color: 'var(--k-danger-text)' };

  function handleDotClick(stage) {
    if (disabled) return;
    const fd = new FormData();
    fd.set('stage', stage);
    action(fd);
  }

  function handleSideClick(stage) {
    if (disabled) return;
    if (stage === 'closed') { setPendingClose(true); return; }
    handleDotClick(stage);
  }

  function handleCloseConfirm() {
    const fd = new FormData();
    fd.set('stage', 'closed');
    fd.set('closed_reason', reason);
    action(fd);
    setPendingClose(false);
  }

  return (
    <div>
      <div dir="rtl" style={{ display: 'flex', flexWrap: 'nowrap', alignItems: 'stretch', gap: 8, overflowX: 'auto' }}>
        <div style={{
          display: 'flex', flex: '0 0 auto', alignItems: 'stretch',
          border: '1px solid var(--k-border)', borderRadius: 999, overflow: 'hidden', height: 38,
        }}>
          {stages.map((stage, i) => {
            const isCurrent = !isSideActive && i === currentIndex;
            return (
              <button
                key={stage}
                type="button"
                onClick={() => handleDotClick(stage)}
                disabled={disabled}
                title={label(stage)}
                style={{
                  flex: '0 0 auto', minWidth: 72, maxWidth: 150, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isCurrent ? 'var(--k-text)' : 'var(--k-pill-bg)',
                  color: isCurrent ? 'var(--k-bg)' : 'var(--k-text-muted)',
                  fontFamily: 'var(--k-font-display)', fontSize: 12.5, fontWeight: isCurrent ? 700 : 500,
                  border: 'none', borderInlineEnd: i < stages.length - 1 ? '1px solid var(--k-border)' : 'none',
                  padding: '0 10px', cursor: disabled ? 'default' : 'pointer',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {label(stage)}
              </button>
            );
          })}
        </div>

        {sideStages.map((stage) => {
          const isCurrent = currentStage === stage;
          const c = color(stage);
          return (
            <button
              key={stage}
              type="button"
              onClick={() => handleSideClick(stage)}
              disabled={disabled}
              title={label(stage)}
              style={{
                flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 5,
                background: isCurrent ? c.bg : 'var(--k-pill-bg)',
                color: isCurrent ? c.color : 'var(--k-text-muted)',
                fontSize: 12.5, fontWeight: isCurrent ? 700 : 500,
                border: '1px solid ' + (isCurrent ? c.bg : 'var(--k-border)'), borderRadius: 999,
                padding: '0 14px', height: 38, cursor: disabled ? 'default' : 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {stage !== 'closed' ? '⚠ ' : ''}{label(stage)}
            </button>
          );
        })}
      </div>

      {currentStage === 'closed' && currentClosedReason && (
        <div style={{ fontSize: 11, color: 'var(--k-text-muted)', marginTop: 6 }}>סיבת סגירה: {currentClosedReason}</div>
      )}

      {pendingClose && (
        <div style={{ marginTop: 8, padding: 10, background: 'var(--k-danger-bg)', border: 'none', borderRadius: 10, width: 220 }}>
          <div style={{ fontSize: 11.5, marginBottom: 6, color: 'var(--k-danger-text)' }}>סיבת סגירה:</div>
          <select value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: '100%', fontSize: 12, border: '1px solid var(--k-border)', borderRadius: 8, padding: '5px 8px', marginBottom: 8, background: 'var(--k-surface)' }}>
            {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={handleCloseConfirm} style={{ flex: 1, fontSize: 12, fontWeight: 600, background: 'var(--k-danger-text)', color: '#fff', border: 'none', borderRadius: 8, padding: '5px 0', cursor: 'pointer' }}>סגירה</button>
            <button onClick={() => setPendingClose(false)} style={{ flex: 1, fontSize: 12, background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 8, padding: '5px 0', cursor: 'pointer' }}>ביטול</button>
          </div>
        </div>
      )}
    </div>
  );
}
