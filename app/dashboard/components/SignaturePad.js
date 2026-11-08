'use client';

import { useRef, useState } from 'react';

// לוח חתימה פשוט בתוך המערכת (לא שירות חיצוני כמו DocuSign - הכרעה מפורשת):
// קנבס וניל (pointer events - עכבר ומגע, בלי ספרייה חיצונית) + שם מוקלד +
// אישור תנאים. משותף למסך הנציג ולעמוד הרישום הציבורי של הלקוח, ולכן מעוצב
// לנייד קודם: קנבס גבוה, שדות 16px (בלי זום אוטומטי ב-iOS), יעדי מגע גדולים.
const CANVAS_W = 640;
const CANVAS_H = 260;

export default function SignaturePad({ onSubmit, submitting }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [agreed, setAgreed] = useState(false);

  // ממיר קואורדינטת עכבר/מגע למרחב הפיקסלים הפנימי של הקנבס (width:100% מותח/
  // מכווץ אותו ביחס לגודל התצוגה) - בלי זה הציור היה נגרר ללא התאמה.
  function getPos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function handlePointerDown(e) {
    drawingRef.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function handlePointerMove(e) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.strokeStyle = '#0A1A2F';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasDrawn) setHasDrawn(true);
  }

  function handlePointerUp() {
    drawingRef.current = false;
  }

  function handleClear() {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }

  function handleSubmit() {
    const imageDataUrl = canvasRef.current.toDataURL('image/png');
    onSubmit({ typedName: typedName.trim(), agreed, imageDataUrl });
  }

  const canSubmit = hasDrawn && !!typedName.trim() && agreed && !submitting;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          aria-label="אזור חתימה - חתמו באצבע או בעכבר"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{
            display: 'block', width: '100%', height: 170, border: '1.5px solid var(--k-border)', borderRadius: 14,
            background: '#fff', touchAction: 'none', cursor: 'crosshair',
          }}
        />
        {!hasDrawn && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none', color: '#9aa6b8', fontSize: 15,
            }}
          >
            חתמו כאן
          </div>
        )}
        <div aria-hidden="true" style={{ position: 'absolute', insetInline: 18, bottom: 34, borderBottom: '1.5px dashed #d5dbe6', pointerEvents: 'none' }} />
      </div>
      <button
        type="button" onClick={handleClear} disabled={!hasDrawn}
        style={{ alignSelf: 'flex-start', fontSize: 13, color: 'var(--k-text-muted)', background: 'none', border: 'none', cursor: hasDrawn ? 'pointer' : 'default', padding: '4px 0', opacity: hasDrawn ? 1 : 0.5 }}
      >
        נקה וחתום מחדש
      </button>
      <input
        type="text" value={typedName} onChange={(e) => setTypedName(e.target.value)}
        placeholder="שם מלא (הקלדה)" autoComplete="name" aria-label="שם מלא"
        className="reg-input"
        style={{ border: '1.5px solid var(--k-border)', borderRadius: 12, padding: '12px 14px', minHeight: 50, fontSize: 16, background: 'var(--k-surface)', color: 'var(--k-text)', fontFamily: 'inherit' }}
      />
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: 'var(--k-text)', cursor: 'pointer', lineHeight: 1.5 }}>
        <input
          type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
          style={{ width: 22, height: 22, marginTop: 1, accentColor: 'var(--k-accent)', flexShrink: 0 }}
        />
        <span>אני מאשר/ת את תנאי ההרשמה</span>
      </label>
      <button
        type="button" onClick={handleSubmit} disabled={!canSubmit}
        style={{
          border: 'none', borderRadius: 12, padding: '13px 16px', minHeight: 50, fontSize: 15, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'default',
          background: 'var(--k-accent)', color: '#fff', opacity: canSubmit ? 1 : 0.45, width: '100%',
        }}
      >
        {submitting ? 'שומר חתימה...' : 'שמירת חתימה'}
      </button>
    </div>
  );
}
