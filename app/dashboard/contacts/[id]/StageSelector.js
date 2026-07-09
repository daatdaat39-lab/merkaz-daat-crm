'use client';

import { useState } from 'react';
import { STAGE_LABELS } from '../../components/ui';
import { CLOSE_REASONS } from '../../components/pipelines';

export default function StageSelector({ currentStage, currentClosedReason, stages, action }) {
  const [pendingClose, setPendingClose] = useState(false);
  const [reason, setReason] = useState(currentClosedReason || CLOSE_REASONS[0]);

  function handleChange(e) {
    const value = e.target.value;
    if (value === 'closed') {
      setPendingClose(true);
      return;
    }
    const fd = new FormData();
    fd.set('stage', value);
    action(fd);
  }

  function handleCloseConfirm() {
    const fd = new FormData();
    fd.set('stage', 'closed');
    fd.set('closed_reason', reason);
    action(fd);
    setPendingClose(false);
  }

  return (
    <div>
      <select
        defaultValue={currentStage}
        onChange={handleChange}
        style={{
          border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 10px', fontSize: 12.5,
          background: '#fff', cursor: 'pointer',
        }}
      >
        {stages.map((s) => (
          <option key={s} value={s}>{STAGE_LABELS[s]}</option>
        ))}
        <option value="closed">{STAGE_LABELS.closed}</option>
      </select>

      {pendingClose && (
        <div style={{ marginTop: 8, padding: 10, background: '#fef2f2', border: '1px solid #f0d0cc', borderRadius: 6, width: 220 }}>
          <div style={{ fontSize: 11.5, marginBottom: 6 }}>סיבת סגירה:</div>
          <select value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: '100%', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, padding: '5px 6px', marginBottom: 8 }}>
            {CLOSE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={handleCloseConfirm} style={{ flex: 1, fontSize: 12, background: '#a3392f', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 0', cursor: 'pointer' }}>סגירה</button>
            <button onClick={() => setPendingClose(false)} style={{ flex: 1, fontSize: 12, background: '#fff', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 0', cursor: 'pointer' }}>ביטול</button>
          </div>
        </div>
      )}
    </div>
  );
}
