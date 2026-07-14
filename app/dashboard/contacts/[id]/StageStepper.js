'use client';

import { useState } from 'react';
import { STAGE_LABELS } from '../../components/ui';
import { CLOSE_REASONS } from '../../components/pipelines';

// שורת נקודות אופקית לשלבי ה-pipeline של מחלקה - נקודה מלאה = הושלם,
// לחיצה על נקודה משנה שלב (קדימה או אחורה, שניהם מותרים). "סגור" הוא
// שבב נפרד בסוף (לא חלק מהרצף המספרי, בדיוק כמו שהיה עם ה-select הישן).
export default function StageStepper({ currentStage, currentClosedReason, stages, action, disabled }) {
  const [pendingClose, setPendingClose] = useState(false);
  const [reason, setReason] = useState(currentClosedReason || CLOSE_REASONS[0]);

  const currentIndex = stages.indexOf(currentStage);
  const isClosed = currentStage === 'closed';

  function handleDotClick(stage) {
    if (disabled) return;
    const fd = new FormData();
    fd.set('stage', stage);
    action(fd);
  }

  function handleCloseClick() {
    if (disabled) return;
    setPendingClose(true);
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
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
        {stages.map((stage, i) => {
          const done = !isClosed && i <= currentIndex;
          const isCurrent = !isClosed && i === currentIndex;
          return (
            <div key={stage} style={{ display: 'flex', alignItems: 'center' }}>
              {i > 0 && (
                <div style={{ width: 16, height: 2, background: done ? '#0a0a0a' : '#e5e5e5', marginTop: -14 }} />
              )}
              <button
                type="button"
                onClick={() => handleDotClick(stage)}
                disabled={disabled}
                title={STAGE_LABELS[stage] || stage}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer', padding: '0 2px',
                }}
              >
                <span style={{
                  width: isCurrent ? 14 : 10, height: isCurrent ? 14 : 10, borderRadius: '50%',
                  background: done ? '#0a0a0a' : '#fff',
                  border: done ? 'none' : '2px solid #d0d0d0',
                  boxShadow: isCurrent ? '0 0 0 3px rgba(10,10,10,0.15)' : 'none',
                }} />
                <span style={{ fontSize: 9.5, color: isCurrent ? '#0a0a0a' : '#9b9b9b', fontWeight: isCurrent ? 600 : 400, whiteSpace: 'nowrap' }}>
                  {STAGE_LABELS[stage] || stage}
                </span>
              </button>
            </div>
          );
        })}

        <div style={{ width: 16, height: 2, background: isClosed ? '#a3392f' : '#e5e5e5', marginTop: -14 }} />
        <button
          type="button"
          onClick={handleCloseClick}
          disabled={disabled}
          title={STAGE_LABELS.closed}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer', padding: '0 2px',
          }}
        >
          <span style={{
            width: isClosed ? 14 : 10, height: isClosed ? 14 : 10, borderRadius: '50%',
            background: isClosed ? '#a3392f' : '#fff',
            border: isClosed ? 'none' : '2px solid #f0c0ba',
          }} />
          <span style={{ fontSize: 9.5, color: isClosed ? '#a3392f' : '#c98a80', fontWeight: isClosed ? 600 : 400 }}>
            {STAGE_LABELS.closed}
          </span>
        </button>
      </div>

      {isClosed && currentClosedReason && (
        <div style={{ fontSize: 11, color: '#9b9b9b', marginTop: 6 }}>סיבת סגירה: {currentClosedReason}</div>
      )}

      {pendingClose && (
        <div style={{ marginTop: 8, padding: 10, background: '#fef2f2', border: '1px solid #f0d0cc', borderRadius: 6, width: 220 }}>
          <div style={{ fontSize: 11.5, marginBottom: 6 }}>סיבת סגירה:</div>
          <select value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: '100%', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, padding: '5px 6px', marginBottom: 8 }}>
            {CLOSE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={handleCloseConfirm} style={{ flex: 1, fontSize: 12, background: '#a3392f', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 0', cursor: 'pointer' }}>סגירה</button>
            <button onClick={() => setPendingClose(false)} style={{ flex: 1, fontSize: 12, background: '#fff', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 0', cursor: 'pointer' }}>ביטול</button>
          </div>
        </div>
      )}
    </div>
  );
}
