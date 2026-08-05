'use client';

import { useState } from 'react';
import { CLOSE_REASONS } from '../../components/pipelines';

// שורת נקודות אופקית לשלבי ה-pipeline של מחלקה - נקודה מלאה = הושלם,
// לחיצה על נקודה משנה שלב (קדימה או אחורה, שניהם מותרים). שלבי-צד
// (sideStages, למשל "סגור"/"תקלה בחיוב") מוצגים כשבבים נפרדים בסוף,
// לא כחלק מהרצף המספרי - נטענים דינמית מ-pipeline_stages (מיגרציה
// 0036), לא קבועים בקוד, כדי שמנהל שמוסיף שלב-צד חדש בהגדרות יראה
// אותו כאן בלי שינוי קוד. "סגור" הוא שלב-הצד היחיד עם זרימת בחירת
// סיבה (pendingClose) - שלבי-צד אחרים (כמו "תקלה בחיוב") מוגדרים
// ישירות בלחיצה אחת, כמו שהיה קודם.
// closeReasons (אופציונלי) - מגיע מרשימת בחירה דינמית (הגדרות ← רשימות
// בחירה); אם לא סופק, נופל חזרה לרשימה הקבועה בקוד.
export default function StageStepper({ currentStage, currentClosedReason, stages, sideStages = [], labels = {}, colors = {}, action, disabled, closeReasons }) {
  const reasons = closeReasons?.length ? closeReasons : CLOSE_REASONS;
  const [pendingClose, setPendingClose] = useState(false);
  const [reason, setReason] = useState(currentClosedReason || reasons[0]);

  const currentIndex = stages.indexOf(currentStage);
  const isSideActive = sideStages.includes(currentStage);

  const label = (key) => labels[key] || key;
  const color = (key) => colors[key] || { bg: '#fef2f2', color: '#a3392f' };

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

  const progressPct = !isSideActive && stages.length > 1 && currentIndex >= 0
    ? Math.round((currentIndex / (stages.length - 1)) * 100)
    : null;

  return (
    <div>
      {progressPct !== null && (
        <div style={{ height: 4, background: '#f2f2f2', borderRadius: 999, marginBottom: 10, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progressPct}%`, background: '#0a0a0a', borderRadius: 999, transition: 'width 0.3s' }} />
        </div>
      )}
      <div dir="rtl" style={{ display: 'flex', alignItems: 'flex-start', gap: 2, width: '100%' }}>
        {stages.map((stage, i) => {
          const done = !isSideActive && i <= currentIndex;
          const isCurrent = !isSideActive && i === currentIndex;
          return (
            <div key={stage} style={{ display: 'flex', alignItems: 'center', flex: i > 0 ? '1 1 0' : '0 0 auto', minWidth: 0 }}>
              {i > 0 && (
                <div style={{ flex: '1 1 0', minWidth: 8, height: 2, background: done ? '#0a0a0a' : '#e5e5e5', marginTop: -14 }} />
              )}
              <button
                type="button"
                onClick={() => handleDotClick(stage)}
                disabled={disabled}
                title={label(stage)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0, maxWidth: 68,
                  background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer', padding: '0 2px',
                }}
              >
                <span style={{
                  width: isCurrent ? 14 : 10, height: isCurrent ? 14 : 10, borderRadius: '50%',
                  background: done ? '#0a0a0a' : '#fff',
                  border: done ? 'none' : '2px solid #d0d0d0',
                  boxShadow: isCurrent ? '0 0 0 3px rgba(10,10,10,0.15)' : 'none',
                  flexShrink: 0,
                }} />
                <span style={{
                  fontSize: 9.5, color: isCurrent ? '#0a0a0a' : '#9b9b9b', fontWeight: isCurrent ? 600 : 400,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', textAlign: 'center',
                }}>
                  {label(stage)}
                </span>
              </button>
            </div>
          );
        })}

        {sideStages.map((stage) => {
          const isCurrent = currentStage === stage;
          const c = color(stage);
          return (
            <div key={stage} style={{ display: 'flex', alignItems: 'center', flex: '1 1 0', minWidth: 0 }}>
              <div style={{ flex: '1 1 0', minWidth: 8, height: 2, background: isCurrent ? c.color : '#e5e5e5', marginTop: -14 }} />
              <button
                type="button"
                onClick={() => handleSideClick(stage)}
                disabled={disabled}
                title={label(stage)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0, maxWidth: 84,
                  background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer', padding: '0 2px',
                }}
              >
                <span style={{
                  width: isCurrent ? 14 : 10, height: isCurrent ? 14 : 10, borderRadius: '50%',
                  background: isCurrent ? c.color : '#fff',
                  border: isCurrent ? 'none' : '2px solid #f0c0ba',
                  flexShrink: 0,
                }} />
                <span style={{
                  fontSize: 9.5, color: isCurrent ? c.color : '#c98a80', fontWeight: isCurrent ? 600 : 400,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', textAlign: 'center',
                }}>
                  {stage !== 'closed' ? '⚠ ' : ''}{label(stage)}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      {currentStage === 'closed' && currentClosedReason && (
        <div style={{ fontSize: 11, color: '#9b9b9b', marginTop: 6 }}>סיבת סגירה: {currentClosedReason}</div>
      )}

      {pendingClose && (
        <div style={{ marginTop: 8, padding: 10, background: '#fef2f2', border: '1px solid #f0d0cc', borderRadius: 6, width: 220 }}>
          <div style={{ fontSize: 11.5, marginBottom: 6 }}>סיבת סגירה:</div>
          <select value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: '100%', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, padding: '5px 6px', marginBottom: 8 }}>
            {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={handleCloseConfirm} style={{ flex: 1, fontSize: 12, background: '#a3392f', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 0', cursor: 'pointer' }}>סגירה</button>
            <button onClick={() => setPendingClose(false)} style={{ flex: 1, fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 0', cursor: 'pointer' }}>ביטול</button>
          </div>
        </div>
      )}
    </div>
  );
}
