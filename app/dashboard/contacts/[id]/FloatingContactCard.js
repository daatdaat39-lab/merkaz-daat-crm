'use client';

import { useEffect, useState } from 'react';
import { updateContactNotes } from '../actions';
import { toggleTask } from '../../tasks/actions';
import ContactDetailClient from './ContactDetailClient';

// תוכן איש הקשר בתוך חלון צף - נטען בצד הלקוח דרך נקודת קצה REST רגילה
// (api/contact-card/[id], שעוטפת את loadContactCardData.js המשותפת עם
// ContactDetailContent.js) כדי שאפשר יהיה לפתוח כמה כרטיסים יחד בלי
// להיות תלוי בניתוב של Next (שמציג עמוד/מודל אחד בכל רגע).
export default function FloatingContactCard({ contactId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/contact-card/${contactId}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) { setError('איש הקשר לא נמצא'); return; }
        const json = await res.json();
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError('שגיאה בטעינה: ' + (err?.message || String(err)));
      });
    return () => { cancelled = true; };
  }, [contactId]);

  if (error) return <div style={{ fontSize: 13, color: 'var(--danger, #a3392f)' }}>{error}</div>;
  if (!data) return <div style={{ fontSize: 13, color: '#9b9b9b' }}>טוען...</div>;

  return (
    <ContactDetailClient
      {...data}
      isModal={true}
      isFloating={true}
      toggleTaskAction={toggleTask}
      updateNotesAction={updateContactNotes}
    />
  );
}
