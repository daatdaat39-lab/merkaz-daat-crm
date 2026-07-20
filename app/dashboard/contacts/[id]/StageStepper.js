'use client';

import { STAGE_LABELS } from '../../components/ui';

// שורת נקודות אופקית לשלבי ה-pipeline של מחלקה - נקודה מלאה = הושלם,
// לחיצה על נקודה משנה שלב (קדימה או אחורה, שניהם מותרים). אין יותר
// "סגירת ליד" נפרדת כאן - הפעולה היחידה לסיום מעורבות עם מחלקה היא
// "הסרה ממחלקה זו" (הכפתור לצד שורת השלבים בכרטיס).
export default function StageStepper({ currentStage, stages, action, disabled }) {
  const currentIndex = stages.indexOf(currentStage);

  function handleDotClick(stage) {
    if (disabled) return;
    const fd = new FormData();
    fd.set('stage', stage);
    action(fd);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
      {stages.map((stage, i) => {
        const done = i <= currentIndex;
        const isCurrent = i === currentIndex;
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
    </div>
  );
}
