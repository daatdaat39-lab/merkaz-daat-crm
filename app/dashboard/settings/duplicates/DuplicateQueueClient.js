'use client';

// ממשק "תור" עובר זוג-אחר-זוג על מועמדי כפילות - משתמש שוב ב-
// MergeFieldsPicker ו-mergeContacts הקיימים (בדיוק כמו "מיזוג עם כפול"
// בכרטיס איש קשר), רק שכאן הזוגות מוצעים מראש במקום חיפוש ידני.
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { mergeContacts, dismissDuplicatePair } from '../../contacts/actions';
import MergeFieldsPicker from '../../contacts/MergeFieldsPicker';
import { richnessScore } from '../../lib/findDuplicates';

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ fontSize: 12.5, marginBottom: 4 }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}: </span>
      <span>{value}</span>
    </div>
  );
}

function ContactSummary({ contact, roleLabel }) {
  return (
    <div style={{ flex: '1 1 260px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 6 }}>{roleLabel}</div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{contact.first} {contact.last}</div>
      {contact.frozen && <div style={{ fontSize: 11, color: '#1d4ed8', marginBottom: 6 }}>❄ מוקפא</div>}
      {(contact.transactionsCount > 0 || contact.commitmentsCount > 0) && (
        <div style={{ fontSize: 11.5, fontWeight: 600, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '4px 8px', marginBottom: 8 }}>
          💰 {contact.transactionsCount} תרומות · {contact.commitmentsCount} התחייבויות — בדקו לפני מיזוג
        </div>
      )}
      <Row label='ת"ז' value={contact.idnum} />
      <Row label="טלפון" value={contact.phone} />
      <Row label="טלפון נוסף" value={contact.phone2} />
      <Row label="מייל" value={contact.email} />
      <Row label="מייל נוסף" value={contact.email2} />
      <Row label="תגיות" value={(contact.tags || []).join(', ')} />
      <Row label="מחלקות" value={(contact.departments || []).map((d) => `${d.workspaceName} (${d.stage})`).join(', ')} />
      <Row label="נוצר" value={contact.created_at ? new Date(contact.created_at).toLocaleDateString('he-IL') : ''} />
      {contact.notes && <Row label="הערות" value={contact.notes.length > 120 ? `${contact.notes.slice(0, 120)}…` : contact.notes} />}
    </div>
  );
}

export default function DuplicateQueueClient({ initialCandidates }) {
  const [queue, setQueue] = useState(initialCandidates);
  const [index, setIndex] = useState(0);
  const [swapped, setSwapped] = useState(false);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const current = queue[index] || null;

  useEffect(() => {
    if (!current) return;
    setSwapped(richnessScore(current.contactB) > richnessScore(current.contactA));
    setError(null);
    setMerging(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, queue]);

  if (!current) {
    return (
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '24px', textAlign: 'center', fontSize: 14, color: '#15803d' }}>
        🎉 אין עוד זוגות חשודים
      </div>
    );
  }

  const existing = swapped ? current.contactB : current.contactA;
  const dup = swapped ? current.contactA : current.contactB;

  function advance() {
    setQueue((prev) => prev.filter((_, i) => i !== index));
  }

  function handleMergeConfirm(resolvedFields) {
    startTransition(async () => {
      const res = await mergeContacts(existing.id, dup.id, resolvedFields);
      if (res?.error) { setError(res.error); return; }
      router.refresh();
      advance();
    });
  }

  function handleDismiss() {
    startTransition(async () => {
      const res = await dismissDuplicatePair(current.contactA.id, current.contactB.id);
      if (res?.error) { setError(res.error); return; }
      router.refresh();
      advance();
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>זוג {index + 1} מתוך {queue.length}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} style={navBtn()}>← הקודם</button>
          <button type="button" onClick={() => setIndex((i) => Math.min(queue.length - 1, i + 1))} disabled={index >= queue.length - 1} style={navBtn()}>הבא →</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {current.matchedOn.map((reason) => (
          <span key={reason} style={{ fontSize: 11, fontWeight: 600, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 100, padding: '3px 10px' }}>
            התאמה לפי: {reason}
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14, alignItems: 'stretch' }}>
        <ContactSummary contact={existing} roleLabel="יישאר" />
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button type="button" onClick={() => setSwapped((s) => !s)} title="החלף צדדים" style={{ ...navBtn(), fontSize: 16, padding: '8px 10px' }}>🔄</button>
        </div>
        <ContactSummary contact={dup} roleLabel="יימחק (אחרי מיזוג)" />
      </div>

      {error && <div style={{ color: '#b23b2f', fontSize: 12.5, marginBottom: 10 }}>שגיאה: {error}</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => setMerging(true)} disabled={isPending} style={primaryBtn()}>🔗 מיזוג</button>
        <button type="button" onClick={handleDismiss} disabled={isPending} style={ghostBtn()}>✕ לא כפילות</button>
      </div>

      {merging && (
        <div
          onClick={() => setMerging(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 10, padding: 22, width: 480, maxWidth: '92vw' }}>
            <MergeFieldsPicker existing={existing} newValues={dup} onConfirm={handleMergeConfirm} onCancel={() => setMerging(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

function navBtn() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px',
    borderRadius: 6, fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
    background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)',
  };
}

function primaryBtn() {
  return {
    padding: '8px 16px', borderRadius: 6, fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
    background: 'var(--text, #0a0a0a)', color: '#fff', border: 'none',
  };
}

function ghostBtn() {
  return {
    padding: '8px 16px', borderRadius: 6, fontSize: 13.5, fontWeight: 500, cursor: 'pointer',
    background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)',
  };
}
