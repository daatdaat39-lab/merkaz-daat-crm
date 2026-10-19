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

  const progressPct = !isSideActive && stages.length > 1 && currentIndex >= 0
    ? Math.round((currentIndex / (stages.length - 1)) * 100)
    : null;

  return (
    <div>
      {progressPct !== null && (
        <div style={{ height: 4, background: 'var(--k-pill-bg)', borderRadius: 999, marginBottom: 10, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progressPct}%`, background: 'var(--k-accent)', borderRadius: 999, transition: 'width 0.3s' }} />
        </div>
      )}
      {/* שתי שורות נפרדות (נקודות+קווים למעלה, תוויות למטה) - כך שאורך
          התווית (עד 2 שורות, ללא קיצוץ) לעולם לא משפיע על גובה/יישור
          שורת הנקודות ולא גורם לחפיפה בין שלבים שכנים. שני ה-map-ים
          משתמשים באותם יחסי flex בדיוק כדי שהעמודות יתיישרו זו מתחת לזו. */}
      <div dir="rtl" style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
        {stages.map((stage, i) => {
          const done = !isSideActive && i <= currentIndex;
          const isCurrent = !isSideActive && i === currentIndex;
          return (
            <div key={stage} style={{ display: 'flex', alignItems: 'center', flex: i > 0 ? '1 1 0' : '0 0 auto', minWidth: 0 }}>
              {i > 0 && (
                <div style={{ flex: '1 1 0', minWidth: 8, height: 2, background: done ? 'var(--k-text)' : 'var(--k-border)' }} />
              )}
              <button
                type="button"
                onClick={() => handleDotClick(stage)}
                disabled={disabled}
                title={label(stage)}
                style={{ background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer', padding: 4, flexShrink: 0, display: 'flex' }}
              >
                <span style={{
                  width: isCurrent ? 14 : 10, height: isCurrent ? 14 : 10, borderRadius: '50%',
                  background: done ? 'var(--k-text)' : 'var(--k-surface)',
                  border: done ? 'none' : '2px solid var(--k-border)',
                  boxShadow: isCurrent ? '0 0 0 3px rgba(111,140,83,0.22)' : 'none',
                  flexShrink: 0,
                }} />
              </button>
            </div>
          );
        })}

        {sideStages.map((stage) => {
          const isCurrent = currentStage === stage;
          const c = color(stage);
          return (
            <div key={stage} style={{ display: 'flex', alignItems: 'center', flex: '1 1 0', minWidth: 0 }}>
              <div style={{ flex: '1 1 0', minWidth: 8, height: 2, background: isCurrent ? c.color : 'var(--k-border)' }} />
              <button
                type="button"
                onClick={() => handleSideClick(stage)}
                disabled={disabled}
                title={label(stage)}
                style={{ background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer', padding: 4, flexShrink: 0, display: 'flex' }}
              >
                <span style={{
                  width: isCurrent ? 14 : 10, height: isCurrent ? 14 : 10, borderRadius: '50%',
                  background: isCurrent ? c.color : 'var(--k-surface)',
                  border: isCurrent ? 'none' : '2px solid var(--k-danger-bg)',
                  flexShrink: 0,
                }} />
              </button>
            </div>
          );
        })}
      </div>

      <div dir="rtl" style={{ display: 'flex', alignItems: 'flex-start', gap: 4, width: '100%', marginTop: 6 }}>
        {stages.map((stage, i) => {
          const isCurrent = !isSideActive && i === currentIndex;
          return (
            <div key={stage} style={{ flex: i > 0 ? '1 1 0' : '0 0 auto', minWidth: 0, display: 'flex', justifyContent: 'center' }}>
              <span
                title={label(stage)}
                style={{
                  fontSize: 10, lineHeight: 1.25, color: isCurrent ? 'var(--k-text)' : 'var(--k-text-muted)', fontWeight: isCurrent ? 600 : 400,
                  whiteSpace: 'normal', wordBreak: 'break-word', textAlign: 'center', maxWidth: i > 0 ? '100%' : 76,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}
              >
                {label(stage)}
              </span>
            </div>
          );
        })}

        {sideStages.map((stage) => {
          const isCurrent = currentStage === stage;
          const c = color(stage);
          return (
            <div key={stage} style={{ flex: '1 1 0', minWidth: 0, display: 'flex', justifyContent: 'center' }}>
              <span
                title={label(stage)}
                style={{
                  fontSize: 10, lineHeight: 1.25, color: isCurrent ? c.color : 'var(--k-danger-text)', fontWeight: isCurrent ? 600 : 400,
                  whiteSpace: 'normal', wordBreak: 'break-word', textAlign: 'center', maxWidth: '100%',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}
              >
                {stage !== 'closed' ? '⚠ ' : ''}{label(stage)}
              </span>
            </div>
          );
        })}
      </div>

      {currentStage === 'closed' && currentClosedReason && (
        <div style={{ fontSize: 11, color: 'var(--k-text-muted)', marginTop: 6 }}>סיבת סגירה: {currentClosedReason}</div>
      )}

      {pendingClose && (
        <div style={{ marginTop: 8, padding: 10, background: 'var(--k-danger-bg)', border: 'none', borderRadius: 10, width: 220 }}>
          <div style={{ fontSize: 11.5, marginBottom: 6, color: 'var(--k-danger-text)' }}>סיבת סגירה:</div>
          <select value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: '100%', fontSize: 12, border: '1px solid var(--k-border)', borderRadius: 100, padding: '5px 8px', marginBottom: 8, background: 'var(--k-surface)' }}>
            {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={handleCloseConfirm} style={{ flex: 1, fontSize: 12, fontWeight: 600, background: 'var(--k-danger-text)', color: '#fff', border: 'none', borderRadius: 100, padding: '5px 0', cursor: 'pointer' }}>סגירה</button>
            <button onClick={() => setPendingClose(false)} style={{ flex: 1, fontSize: 12, background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 100, padding: '5px 0', cursor: 'pointer' }}>ביטול</button>
          </div>
        </div>
      )}
    </div>
  );
}
