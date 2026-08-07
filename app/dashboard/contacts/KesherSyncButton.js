'use client';

// כפתור סנכרון ידני מ"קשר" (דוחות בלבד - ר' lib/kesher/client.js).
// אותה תבנית pending/result כמו DepartmentImportWizard.js.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { syncKesherReports } from './kesherSyncActions';

function defaultDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export default function KesherSyncButton({ kesherConfigured = false }) {
  const [open, setOpen] = useState(false);
  const [fromDate, setFromDate] = useState(defaultDate(30));
  const [toDate, setToDate] = useState(defaultDate(0));
  const [result, setResult] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSync() {
    setResult(null);
    startTransition(async () => {
      const res = await syncKesherReports(fromDate, toDate);
      setResult(res);
      if (res?.success) router.refresh();
    });
  }

  if (!kesherConfigured) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '7px 14px', borderRadius: 6, fontSize: 13, color: 'var(--text-secondary)', border: '1px dashed var(--border)' }}>
        קשר לא מוגדר
      </span>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={ghostBtn()}>
        🔄 סנכרון מקשר
      </button>
    );
  }

  return (
    <div style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, maxWidth: 360 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 13.5 }}>סנכרון דוחות מקשר</span>
        <button type="button" onClick={() => setOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>מתאריך</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={inputStyle()} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>עד תאריך</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={inputStyle()} />
        </div>
      </div>
      <button type="button" onClick={handleSync} disabled={isPending} style={primaryBtn()}>
        {isPending ? 'מסנכרן...' : 'סנכרון'}
      </button>

      {result?.error && <p style={{ color: '#b23b2f', fontSize: 12.5, marginTop: 10 }}>{result.error}</p>}
      {result?.success && (
        <div style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.8 }}>
          <div>עסקאות: {result.transactionsCreated} נוספו, {result.transactionsSkipped} דולגו (קיימות)</div>
          <div>התחייבויות: {result.obligationsCreated} נוצרו, {result.obligationsUpdated} עודכנו</div>
          {(result.transactionsUnmatched > 0 || result.obligationsUnmatched > 0) && (
            <div style={{ color: '#92400e' }}>
              ⚠ {result.transactionsUnmatched + result.obligationsUnmatched} רשומות לא הותאמו לאיש קשר קיים - יש להשלים פרטי זיהוי ולסנכרן שוב
            </div>
          )}
          {result.projectUnmatched > 0 && (
            <div style={{ color: '#92400e' }}>⚠ {result.projectUnmatched} רשומות עם פרויקט קשר לא מזוהה - יש לבדוק את שם הפרויקט בקוד</div>
          )}
        </div>
      )}
    </div>
  );
}

function ghostBtn() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px',
    borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer',
    background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)',
  };
}

function primaryBtn() {
  return {
    padding: '8px 16px', borderRadius: 6, fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
    background: 'var(--accent, #1f4d3d)', color: '#fff', border: 'none', width: '100%',
  };
}

function inputStyle() {
  return { width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', fontSize: 13, boxSizing: 'border-box' };
}
