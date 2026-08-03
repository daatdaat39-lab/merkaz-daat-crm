'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addPicklistValue, removePicklistValue } from './actions';

export default function PicklistsClient({ closeReasons, campaignCategories, donationsWorkspaceId }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PicklistSection
        title="סיבות סגירה (״סגור / לא רלוונטי״)"
        subtitle="משותף לכל המחלקות - מוצג בבחירת שלב הסגירה בכרטיס איש הקשר"
        listKey="close_reason"
        workspaceId={null}
        initialValues={closeReasons}
      />
      <PicklistSection
        title="קטגוריות קמפיין"
        subtitle="מחלקת תרומות - מוצג בטבלת חברי הקמפיין"
        listKey="campaign_category"
        workspaceId={donationsWorkspaceId}
        initialValues={campaignCategories}
      />
    </div>
  );
}

function PicklistSection({ title, subtitle, listKey, workspaceId, initialValues }) {
  const [values, setValues] = useState(initialValues);
  const [newValue, setNewValue] = useState('');
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleAdd() {
    const v = newValue.trim();
    if (!v) return;
    setError(null);
    startTransition(async () => {
      const res = await addPicklistValue(listKey, workspaceId, v);
      if (res?.error) { setError(res.error); return; }
      setNewValue('');
      router.refresh();
      setValues((prev) => [...prev, { id: `tmp-${Date.now()}`, value: v }]);
    });
  }

  function handleRemove(id) {
    setError(null);
    startTransition(async () => {
      const res = await removePicklistValue(id);
      if (res?.error) { setError(res.error); return; }
      setValues((prev) => prev.filter((v) => v.id !== id));
      router.refresh();
    });
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '16px 18px' }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-secondary, #9b9b9b)', marginBottom: 12 }}>{subtitle}</div>

      {!workspaceId && listKey !== 'close_reason' && (
        <div style={{ fontSize: 12.5, color: '#9b9b9b' }}>לא נמצאה מחלקת תרומות - לא ניתן לערוך.</div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {values.map((v) => (
          <span key={v.id} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-secondary, #f5f5f5)',
            border: '1px solid var(--border, #e5e5e5)', borderRadius: 999, padding: '4px 6px 4px 12px', fontSize: 12.5,
          }}>
            {v.value}
            <button
              type="button"
              onClick={() => handleRemove(v.id)}
              disabled={isPending}
              title="הסרה"
              style={{ background: 'none', border: 'none', color: '#b23b2f', cursor: 'pointer', fontSize: 12, padding: '2px 4px' }}
            >✕</button>
          </span>
        ))}
        {values.length === 0 && <span style={{ fontSize: 12.5, color: '#9b9b9b' }}>אין ערכים עדיין</span>}
      </div>

      {error && <div style={{ color: '#b23b2f', fontSize: 12, marginBottom: 8 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
          placeholder="ערך חדש..."
          style={{ flex: 1, border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '6px 10px', fontSize: 13 }}
        />
        <button type="button" onClick={handleAdd} disabled={isPending || !newValue.trim()} style={{
          background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 16px', fontSize: 12.5, cursor: 'pointer',
        }}>
          הוספה
        </button>
      </div>
    </div>
  );
}
