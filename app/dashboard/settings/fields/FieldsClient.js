'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createField, updateField, reorderFields, deleteField } from './actions';
import { COMPUTED_FORMULAS } from '../../lib/computedFields';
import { generateFieldKey } from '../../lib/fieldKey';
import AiFieldWizard from '../../components/AiFieldWizard';

const inputStyle = { border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '6px 8px', fontSize: 12.5 };
const TYPES = [
  { value: 'text', label: 'טקסט' },
  { value: 'number', label: 'מספר' },
  { value: 'date', label: 'תאריך' },
  { value: 'select', label: 'בחירה מרשימה' },
  { value: 'computed', label: 'מחושב (אוטומטי)' },
];

export default function FieldsClient({ workspaces, fieldsByWorkspaceId }) {
  const [activeId, setActiveId] = useState(workspaces[0]?.id || null);

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {workspaces.map((w) => (
          <button
            key={w.id}
            onClick={() => setActiveId(w.id)}
            style={{
              border: '1px solid ' + (activeId === w.id ? '#0a0a0a' : 'var(--border, #e5e5e5)'),
              background: activeId === w.id ? '#0a0a0a' : '#fff',
              color: activeId === w.id ? '#fff' : '#333',
              borderRadius: 999, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer', fontWeight: 500,
            }}
          >
            {w.name}
          </button>
        ))}
      </div>

      {workspaces.map((w) => (
        activeId === w.id && (
          <WorkspaceFieldsEditor key={w.id} workspaceId={w.id} initialFields={fieldsByWorkspaceId[w.id] || []} />
        )
      ))}
    </div>
  );
}

function WorkspaceFieldsEditor({ workspaceId, initialFields }) {
  const [fields, setFields] = useState([...initialFields].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [dragId, setDragId] = useState(null);

  const [newField, setNewField] = useState({ fieldKey: '', label: '', type: 'text', optionsText: '', formula: COMPUTED_FORMULAS[0]?.value || '', dateField: '', durationField: '' });
  const [useAiWizard, setUseAiWizard] = useState(false);
  const dateFields = fields.filter((f) => f.type === 'date');
  const numberFields = fields.filter((f) => f.type === 'number');

  function refresh() { router.refresh(); }

  function persistOrder(reordered) {
    setFields(reordered);
    startTransition(async () => {
      await reorderFields(workspaceId, reordered.map((f) => f.id));
      refresh();
    });
  }

  function handleDrop(targetId) {
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const fromIdx = fields.findIndex((f) => f.id === dragId);
    const toIdx = fields.findIndex((f) => f.id === targetId);
    if (fromIdx === -1 || toIdx === -1) { setDragId(null); return; }
    const reordered = [...fields];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setDragId(null);
    persistOrder(reordered);
  }

  function handleUpdate(field, patch) {
    setError(null);
    setFields((prev) => prev.map((f) => (f.id === field.id ? { ...f, ...patch } : f)));
    startTransition(async () => {
      const merged = { ...field, ...patch };
      const res = await updateField(field.id, workspaceId, { label: merged.label, options: merged.options });
      if (res?.error) { setError(res.error); return; }
      refresh();
    });
  }

  function handleDelete(field) {
    setError(null);
    if (!confirm(`למחוק את השדה "${field.label}"?`)) return;
    startTransition(async () => {
      const res = await deleteField(field.id, workspaceId, field.field_key);
      if (res?.error) { setError(res.error); return; }
      setFields((prev) => prev.filter((f) => f.id !== field.id));
      refresh();
    });
  }

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      let options = [];
      if (newField.type === 'select') {
        options = newField.optionsText.split(',').map((s) => s.trim()).filter(Boolean);
      } else if (newField.type === 'computed') {
        options = { formula: newField.formula, dateField: newField.dateField, durationField: newField.durationField };
      }
      const res = await createField(workspaceId, { fieldKey: newField.fieldKey, label: newField.label, type: newField.type, options });
      if (res?.error) { setError(res.error); return; }
      setNewField({ fieldKey: '', label: '', type: 'text', optionsText: '', formula: COMPUTED_FORMULAS[0]?.value || '', dateField: '', durationField: '' });
      refresh();
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && <div style={{ color: '#b23b2f', fontSize: 12.5, background: '#fef2f2', border: '1px solid #f0d0cc', borderRadius: 6, padding: '8px 12px' }}>{error}</div>}

      <div style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, overflow: 'hidden' }}>
        {fields.map((f) => (
          <FieldRow
            key={f.id}
            field={f}
            isDragging={dragId === f.id}
            onDragStart={() => setDragId(f.id)}
            onDragEnd={() => setDragId(null)}
            onDropOn={() => handleDrop(f.id)}
            onUpdate={(patch) => handleUpdate(f, patch)}
            onDelete={() => handleDelete(f)}
            disabled={isPending}
          />
        ))}
        {fields.length === 0 && <div style={{ padding: '12px 14px', fontSize: 12.5, color: '#9b9b9b' }}>אין שדות למחלקה זו</div>}
      </div>

      {useAiWizard ? (
        <AiFieldWizard
          workspaceId={workspaceId}
          onCreated={() => { setUseAiWizard(false); refresh(); }}
          onClose={() => setUseAiWizard(false)}
        />
      ) : (
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>הוספת שדה חדש</div>
          <button type="button" onClick={() => setUseAiWizard(true)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)' }}>
            🤖 עם AI
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input placeholder="מפתח טכני (אנגלית, לא ניתן לשינוי אחר כך)" value={newField.fieldKey}
            onChange={(e) => setNewField((p) => ({ ...p, fieldKey: e.target.value }))} style={{ ...inputStyle, width: 220 }} />
          <button
            type="button"
            onClick={() => setNewField((p) => ({ ...p, fieldKey: generateFieldKey(fields.map((f) => f.field_key)) }))}
            title="יצירת מפתח טכני אוטומטי שעדיין לא תפוס"
            style={{ background: 'none', border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)' }}
          >
            🎲 אוטומטי
          </button>
          <input placeholder="תווית" value={newField.label}
            onChange={(e) => setNewField((p) => ({ ...p, label: e.target.value }))} style={{ ...inputStyle, width: 160 }} />
          <select value={newField.type} onChange={(e) => setNewField((p) => ({ ...p, type: e.target.value }))} style={inputStyle}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          {newField.type === 'select' && (
            <input placeholder="אפשרויות, מופרדות בפסיק" value={newField.optionsText}
              onChange={(e) => setNewField((p) => ({ ...p, optionsText: e.target.value }))} style={{ ...inputStyle, width: 220 }} />
          )}
          {newField.type === 'computed' && (
            <>
              <select value={newField.dateField} onChange={(e) => setNewField((p) => ({ ...p, dateField: e.target.value }))} style={inputStyle}>
                <option value="">שדה תאריך...</option>
                {dateFields.map((f) => <option key={f.field_key} value={f.field_key}>{f.label}</option>)}
              </select>
              <select value={newField.durationField} onChange={(e) => setNewField((p) => ({ ...p, durationField: e.target.value }))} style={inputStyle}>
                <option value="">שדה משך (שנים)...</option>
                {numberFields.map((f) => <option key={f.field_key} value={f.field_key}>{f.label}</option>)}
              </select>
            </>
          )}
          <button
            type="button"
            onClick={handleCreate}
            disabled={isPending || !newField.fieldKey.trim() || !newField.label.trim() || (newField.type === 'computed' && (!newField.dateField || !newField.durationField))}
            style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 16px', fontSize: 12.5, cursor: 'pointer' }}
          >
            הוספה
          </button>
        </div>
        {newField.type === 'computed' && (dateFields.length === 0 || numberFields.length === 0) && (
          <div style={{ fontSize: 11.5, color: '#92400e', marginTop: 8 }}>
            שדה מחושב דורש שכבר יהיו במחלקה זו שדה מסוג "תאריך" ושדה מסוג "מספר" - יש ליצור אותם קודם.
          </div>
        )}
      </div>
      )}
    </div>
  );
}

function FieldRow({ field, isDragging, onDragStart, onDragEnd, onDropOn, onUpdate, onDelete, disabled }) {
  const [label, setLabel] = useState(field.label);
  const [optionsText, setOptionsText] = useState(field.type === 'select' ? (field.options || []).join(', ') : '');

  return (
    <div
      draggable={!disabled}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onDropOn(); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid #f2f2f2', flexWrap: 'wrap',
        opacity: isDragging ? 0.4 : 1, background: isDragging ? 'var(--surface-hover)' : 'transparent',
      }}
    >
      <span title="גרירה לסידור" style={{ cursor: 'grab', color: 'var(--text-muted)', fontSize: 14, userSelect: 'none' }}>⠿</span>
      <code style={{ fontSize: 10.5, color: '#9b9b9b' }}>{field.field_key}</code>
      <span style={{ fontSize: 11, color: '#6b6b6b', background: '#f4f4f5', borderRadius: 4, padding: '2px 6px' }}>{TYPES.find((t) => t.value === field.type)?.label || field.type}</span>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => { if (label.trim() && label !== field.label) onUpdate({ label: label.trim() }); }}
        disabled={disabled}
        style={{ ...inputStyle, width: 160 }}
      />
      {field.type === 'select' && (
        <input
          value={optionsText}
          onChange={(e) => setOptionsText(e.target.value)}
          onBlur={() => {
            const options = optionsText.split(',').map((s) => s.trim()).filter(Boolean);
            onUpdate({ options });
          }}
          placeholder="אפשרויות, מופרדות בפסיק"
          disabled={disabled}
          style={{ ...inputStyle, width: 220 }}
        />
      )}
      {field.type === 'computed' && (
        <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
          מחושב מ: {field.options?.dateField} + {field.options?.durationField}
        </span>
      )}
      <button type="button" onClick={onDelete} disabled={disabled} style={{ marginInlineStart: 'auto', background: 'none', border: 'none', color: '#b23b2f', fontSize: 12, cursor: 'pointer' }}>
        🗑 מחיקה
      </button>
    </div>
  );
}
