'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import ExtraFieldCell from '../../components/ExtraFieldCell';
import { computeFieldValue } from '../../lib/computedFields';
import { updateGridBaseField, updateGridExtraField, updateGridStage } from './actions';

// שורה אחת בגריד - בנוי על אותו דפוס בדיוק כמו LeadRow.js (עריכה
// בלחיצה-ויציאה לטקסט/מספר, onChange לרשימות בחירה/תאריך), אבל מצומצם
// לעריכת שדות בסיס+נוספים+שלב בלבד - בלי עמודת נציג/פעולות מהירות
// (זה מסך עריכה מהירה, לא מסך עבודה שוטפת).
export default function DataGridRow({ row, workspaceId, baseFields, extraFields, pipeline, selected = false, onToggleSelected }) {
  const [isPending, startTransition] = useTransition();
  const [baseValues, setBaseValues] = useState(row.base);
  const [extraValues, setExtraValues] = useState(row.extra);
  const [stage, setStage] = useState(row.stage);
  const [error, setError] = useState(null);

  function handleBaseCommit(field, value) {
    setBaseValues((prev) => ({ ...prev, [field]: value }));
    setError(null);
    startTransition(async () => {
      const res = await updateGridBaseField(row.contactId, workspaceId, field, value);
      if (res?.error) setError(res.error);
    });
  }

  function handleExtraCommit(key, value) {
    setExtraValues((prev) => ({ ...prev, [key]: value }));
    setError(null);
    startTransition(async () => {
      const res = await updateGridExtraField(row.departmentRowId, workspaceId, key, value);
      if (res?.error) setError(res.error);
    });
  }

  function handleStageChange(e) {
    const value = e.target.value;
    setStage(value);
    setError(null);
    startTransition(async () => {
      const res = await updateGridStage(row.departmentRowId, workspaceId, value, null);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <tr style={{ borderBottom: '1px solid var(--bg-tertiary)', opacity: row.frozen ? 0.6 : 1 }}>
      <td style={{ padding: '8px 10px', fontSize: 12.5 }}>
        <input type="checkbox" checked={selected} onChange={onToggleSelected} style={{ marginInlineEnd: 6 }} />
        <Link href={`/dashboard/contacts/${row.contactId}`} target="_blank" style={{ color: 'inherit', textDecoration: 'none', fontSize: 11 }} title="פתיחה בכרטיס איש קשר">
          🔗
        </Link>
        {row.frozen && <span title="מוקפא" style={{ marginInlineStart: 4 }}>❄</span>}
        {error && <div style={{ color: '#b23b2f', fontSize: 10, marginTop: 2, maxWidth: 90 }}>{error}</div>}
      </td>
      {baseFields.map((f) => (
        <td key={f.key} style={{ padding: '8px 10px' }}>
          <ExtraFieldCell field={f} value={baseValues[f.key]} onCommit={(v) => handleBaseCommit(f.key, v)} disabled={isPending || row.frozen} />
        </td>
      ))}
      <td style={{ padding: '8px 10px' }}>
        <select
          value={stage}
          onChange={handleStageChange}
          disabled={isPending || row.frozen}
          style={{
            border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 11, fontWeight: 500, cursor: 'pointer',
            background: (pipeline.colors[stage] || {}).bg || '#f4f4f5',
            color: (pipeline.colors[stage] || {}).color || '#52525b',
          }}
        >
          {pipeline.order.map((s) => <option key={s} value={s}>{pipeline.labels[s] || s}</option>)}
          {pipeline.sideStages.map((s) => <option key={s} value={s}>{pipeline.labels[s] || s}</option>)}
        </select>
      </td>
      {extraFields.map((f) => (
        <td key={f.key} style={{ padding: '8px 10px' }}>
          {f.type === 'computed' ? (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{computeFieldValue(f, extraValues, extraFields) || '—'}</span>
          ) : (
            <ExtraFieldCell field={f} value={extraValues[f.key]} onCommit={(v) => handleExtraCommit(f.key, v)} disabled={isPending || row.frozen} />
          )}
        </td>
      ))}
    </tr>
  );
}
