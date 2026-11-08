'use client';

import { useRef, useState } from 'react';

// לוח-חתימה פשוט בתוך-המערכת (לא-שירות-חיצוני כמו DocuSign - הכרעה
// מפורשת) - קנבס-ווניל (pointer events, מכסה-גם-עכבר-וגם-מגע, בלי-
// ספריית-חתימה-חיצונית) + שם-מוקלד + אישור-תנאים. רכיב-משותף: בשימוש
// גם במסך-הטיפול-של-הנציג וגם (בהמשך) בעמוד-הקישור-הציבורי ללקוח.
export default function SignaturePad({ onSubmit, submitting }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [agreed, setAgreed] = useState(false);

  // ממיר קואורדינטת-עכבר/מגע למרחב-הפיקסלים-הפנימי-של-הקנבס (לא-בהכרח
  // זהה-לגודל-התצוגה-ב-CSS, width:100% מותח/מכווץ אותו) - בלי-זה
  // הציור-היה-נגרר-ללא-התאמה כש-הקנבס-לא-מוצג-בדיוק-ב-320x120.
  function getPos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function handlePointerDown(e) {
    drawingRef.current = true;
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function handlePointerMove(e) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <canvas
        ref={canvasRef}
        width={320}
        height={120}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{ width: '100%', height: 120, border: '1px solid var(--k-border)', borderRadius: 8, background: '#fff', touchAction: 'none', cursor: 'crosshair' }}
      />
      <button type="button" onClick={handleClear} style={{ alignSelf: 'flex-start', fontSize: 11, color: 'var(--k-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        נקה וחתום מחדש
      </button>
      <input
        type="text" value={typedName} onChange={(e) => setTypedName(e.target.value)}
        placeholder="שם מלא (הקלדה)"
        style={{ border: '1px solid var(--k-border)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, background: 'var(--k-surface)', color: 'var(--k-text)' }}
      />
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--k-text)', cursor: 'pointer' }}>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        אני מאשר/ת את תנאי ההרשמה
      </label>
      <button
        type="button" onClick={handleSubmit} disabled={!canSubmit}
        style={{
          border: 'none', borderRadius: 8, padding: '11px 16px', fontSize: 13.5, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'default',
          background: 'var(--k-accent)', color: '#fff', opacity: canSubmit ? 1 : 0.45, width: '100%',
        }}
      >
        {submitting ? 'שומר חתימה...' : '✓ שמירת חתימה'}
      </button>
    </div>
  );
}
