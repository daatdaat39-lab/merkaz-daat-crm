'use client';

// סקשן נפרד מתור-הכפילויות (DuplicateQueueClient) - כאן הפעולה הפוכה
// מהותית: כרטיס אחד שכנראה מייצג שני אנשים (למשל "שמואל ומושקא ערד" -
// תרומה משותפת של זוג שנכנסה כאיש קשר אחד, ר' detectCoupleCandidates
// ב-findDuplicates.js) מתפצל לשניים, לא מתמזג. מקופל כברירת מחדל אם
// אין מועמדים, פתוח אם יש.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { splitCoupleContact, dismissCoupleCandidate } from '../../contacts/actions';

export default function CoupleCandidatesSection({ initialCandidates }) {
  const [queue, setQueue] = useState(initialCandidates);
  const router = useRouter();

  if (queue.length === 0) return null;

  return (
    <details open style={{ marginBottom: 20, border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
      <summary style={{ cursor: 'pointer', fontSize: 13.5, fontWeight: 600 }}>אולי זוגות ({queue.length})</summary>
      <p style={{ margin: '8px 0 12px', fontSize: 12, color: 'var(--text-secondary)' }}>
        כרטיסים ששמם נראה כמו "X ו-Y שם משפחה" - ייתכן שאלו שני אנשים (למשל תרומה משותפת של זוג) שנכנסו כאיש קשר אחד. אפשר לערוך את הפיצול המוצע לפני האישור.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {queue.map((cand) => (
          <CoupleCandidateRow
            key={cand.contact.id}
            candidate={cand}
            onDone={() => { setQueue((prev) => prev.filter((c) => c.contact.id !== cand.contact.id)); router.refresh(); }}
          />
        ))}
      </div>
    </details>
  );
}

function CoupleCandidateRow({ candidate, onDone }) {
  const [nameA, setNameA] = useState(candidate.nameA);
  const [nameB, setNameB] = useState(candidate.nameB);
  const [surname, setSurname] = useState(candidate.surname);
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();

  function handleSplit() {
    setError(null);
    startTransition(async () => {
      const res = await splitCoupleContact(candidate.contact.id, nameA, nameB, surname);
      if (res?.error) { setError(res.error); return; }
      onDone();
    });
  }

  function handleDismiss() {
    setError(null);
    startTransition(async () => {
      const res = await dismissCoupleCandidate(candidate.contact.id);
      if (res?.error) { setError(res.error); return; }
      onDone();
    });
  }

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
        בכרטיס: <strong>{candidate.contact.first} {candidate.contact.last}</strong>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <input value={nameA} onChange={(e) => setNameA(e.target.value)} placeholder="שם א'" style={input()} />
        <input value={nameB} onChange={(e) => setNameB(e.target.value)} placeholder="שם ב'" style={input()} />
        <input value={surname} onChange={(e) => setSurname(e.target.value)} placeholder="שם משפחה משותף" style={input()} />
      </div>
      {error && <div style={{ color: '#b23b2f', fontSize: 12, marginBottom: 8 }}>שגיאה: {error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={handleSplit} disabled={isPending} style={primaryBtn()}>✂ פצל לשני אנשי קשר</button>
        <button type="button" onClick={handleDismiss} disabled={isPending} style={ghostBtn()}>✕ לא זוג</button>
      </div>
    </div>
  );
}

function input() {
  return {
    flex: '1 1 140px', border: '1px solid var(--border)', borderRadius: 6,
    padding: '6px 10px', fontSize: 12.5, boxSizing: 'border-box',
  };
}

function primaryBtn() {
  return {
    padding: '7px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
    background: 'var(--text, #0a0a0a)', color: '#fff', border: 'none',
  };
}

function ghostBtn() {
  return {
    padding: '7px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
    background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)',
  };
}
