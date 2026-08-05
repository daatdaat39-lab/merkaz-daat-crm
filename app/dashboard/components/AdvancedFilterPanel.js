'use client';

import { useState } from 'react';

const inputStyle = { border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 12.5 };

// פאנל "סינון מתקדם" רב-מחלקתי - נפתח/נסגר, כרטיס נפרד לכל מחלקה
// (הפרדה ויזואלית ברורה של מי שייך למי), אבל כולם מצטרפים יחד ב-AND
// (ר' contactMatchesAdvancedFilter). value/onChange בצורת
// { [workspaceName]: { stage: '', fields: { [fieldKey]: value, ... } } }.
// שדה מסוג 'number' מקבל אוטומטית שני inputs מ-/עד (מפתחות
// `${key}_from`/`${key}_to`) במקום ערך יחיד - אין type חדש במערכת.
export default function AdvancedFilterPanel({ pipelinesByWorkspace = {}, extraFieldsByWorkspace = {}, value = {}, onChange }) {
  const [open, setOpen] = useState(false);
  const workspaceNames = Array.from(new Set([...Object.keys(pipelinesByWorkspace), ...Object.keys(extraFieldsByWorkspace)]));

  const hasActiveValue = Object.values(value).some((f) => f && (f.stage || Object.values(f.fields || {}).some(Boolean)));

  function setStage(wsName, stage) {
    onChange({ ...value, [wsName]: { ...(value[wsName] || {}), stage } });
  }

  function setField(wsName, fieldKey, fieldValue) {
    const current = value[wsName] || { stage: '', fields: {} };
    onChange({ ...value, [wsName]: { ...current, fields: { ...current.fields, [fieldKey]: fieldValue } } });
  }

  function clearAll() {
    onChange({});
  }

  if (workspaceNames.length === 0) return null;

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{ background: 'none', border: 'none', padding: 0, fontSize: 12.5, color: 'var(--text-secondary)', cursor: 'pointer' }}
        >
          {open ? '▾ סינון מתקדם — הסתרה' : '▸ סינון מתקדם (בין מחלקות)'}
        </button>
        {hasActiveValue && (
          <button
            type="button"
            onClick={clearAll}
            style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}
          >
            ניקוי סינון מתקדם
          </button>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {workspaceNames.map((wsName) => {
            const pipeline = pipelinesByWorkspace[wsName] || { order: [], labels: {} };
            const fields = extraFieldsByWorkspace[wsName] || [];
            const wsValue = value[wsName] || { stage: '', fields: {} };
            return (
              <div key={wsName} style={{
                flex: '1 1 260px', minWidth: 240, background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                borderRadius: 8, padding: 12,
              }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{wsName}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {pipeline.order.length > 0 && (
                    <select value={wsValue.stage || ''} onChange={(e) => setStage(wsName, e.target.value)} style={inputStyle}>
                      <option value="">כל השלבים</option>
                      {pipeline.order.map((s) => <option key={s} value={s}>{pipeline.labels[s] || s}</option>)}
                    </select>
                  )}
                  {fields.map((f) => (
                    f.type === 'select' ? (
                      <select key={f.key} value={wsValue.fields?.[f.key] || ''} onChange={(e) => setField(wsName, f.key, e.target.value)} style={inputStyle}>
                        <option value="">{f.label}</option>
                        {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : f.type === 'number' ? (
                      <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{f.label}:</span>
                        <input
                          value={wsValue.fields?.[`${f.key}_from`] || ''}
                          onChange={(e) => setField(wsName, `${f.key}_from`, e.target.value)}
                          placeholder="מ-"
                          style={{ ...inputStyle, width: 64 }}
                        />
                        <input
                          value={wsValue.fields?.[`${f.key}_to`] || ''}
                          onChange={(e) => setField(wsName, `${f.key}_to`, e.target.value)}
                          placeholder="עד-"
                          style={{ ...inputStyle, width: 64 }}
                        />
                      </div>
                    ) : (
                      <input
                        key={f.key}
                        value={wsValue.fields?.[f.key] || ''}
                        onChange={(e) => setField(wsName, f.key, e.target.value)}
                        placeholder={f.label}
                        style={inputStyle}
                      />
                    )
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
