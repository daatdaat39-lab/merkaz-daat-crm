'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { uploadContactPhoto } from '../actions';
import { initials } from '../../components/ui';

// אווטאר איש קשר - תמונה אם קיימת, אחרת ראשי תיבות. לחיצה על סמל
// המצלמה הקטן פותחת בחירת קובץ ומעלה מיד.
export default function AvatarUpload({ contact }) {
  const inputRef = useRef(null);
  const [error, setError] = useState(null);
  const [lightbox, setLightbox] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.set('photo', file);
    startTransition(async () => {
      const res = await uploadContactPhoto(contact.id, fd);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
      {contact.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={contact.photo_url}
          alt=""
          onClick={() => setLightbox(true)}
          title="לחיצה להגדלה"
          style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', display: 'block', cursor: 'pointer' }}
        />
      ) : (
        <div style={{
          width: 44, height: 44, background: '#0a0a0a', color: '#fff', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600,
        }}>
          {initials(contact.first, contact.last)}
        </div>
      )}
      <button
        onClick={() => inputRef.current?.click()}
        disabled={isPending || contact.frozen}
        title="העלאת תמונה"
        style={{
          position: 'absolute', bottom: -2, insetInlineEnd: -2, width: 18, height: 18, borderRadius: '50%',
          background: '#fff', border: '1px solid #e5e5e5', fontSize: 9, cursor: contact.frozen ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isPending ? 0.6 : 1,
        }}
      >
        📷
      </button>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
      {error && (
        <div style={{ position: 'absolute', top: 48, right: 0, background: '#fff', border: '1px solid #f0d0cc', color: '#b23b2f', borderRadius: 6, padding: '4px 8px', fontSize: 11, whiteSpace: 'nowrap', zIndex: 10 }}>
          {error}
        </div>
      )}

      {lightbox && contact.photo_url && (
        <div
          onClick={() => setLightbox(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 2000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', padding: 24,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={contact.photo_url}
            alt=""
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 12, boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}
          />
        </div>
      )}
    </div>
  );
}
