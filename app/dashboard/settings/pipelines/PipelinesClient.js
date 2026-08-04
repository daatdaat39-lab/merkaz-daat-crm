'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createStage, updateStage, setWonStage, reorderStages, deleteStage } from './actions';

const inputStyle = { border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '6px 8px', fontSize: 12.5 };

export default function PipelinesClient({ workspaces, stagesByWorkspaceId }) {
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
          <WorkspacePipelineEditor key={w.id} workspaceId={w.id} initialStages={stagesByWorkspaceId[w.id] || []} />
        )
      ))}
    </div>
  );
}

function WorkspacePipelineEditor({ workspaceId, initialStages }) {
  const [stages, setStages] = useState(initialStages);
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const [newStage, setNewStage] = useState({ stageKey: '', label: '', colorBg: '#f4f4f5', colorFg: '#52525b', isLeadStage: false, isSideStage: false });

  const mainStages = [...stages].filter((s) => !s.is_side_stage).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const sideStages = stages.filter((s) => s.is_side_stage);

  function refresh() {
    router.refresh();
  }

  function persistOrder(reordered) {
    setStages([...reordered, ...sideStages]);
    startTransition(async () => {
      await reorderStages(workspaceId, reordered.map((s) => s.id));
      refresh();
    });
  }

  function handleMove(id, direction) {
    const idx = mainStages.findIndex((s) => s.id === id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= mainStages.length) return;
    const reordered = [...mainStages];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    persistOrder(reordered);
  }

  // גרירה ושחרור לסידור שלבים - מחשבים את המערך המלא החדש בצד לקוח
  // ומעבירים אותו כמו שהוא ל-reorderStages הקיים (השרת כבר מקבל מערך
  // סדר מלא ורק כותב אותו, ר' actions.js - לא נדרש שינוי שרת בכלל)
  const [dragId, setDragId] = useState(null);

  function handleDrop(targetId) {
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const fromIdx = mainStages.findIndex((s) => s.id === dragId);
    const toIdx = mainStages.findIndex((s) => s.id === targetId);
    if (fromIdx === -1 || toIdx === -1) { setDragId(null); return; }
    const reordered = [...mainStages];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setDragId(null);
    persistOrder(reordered);
  }

  function handleUpdate(stage, patch) {
    setError(null);
    setStages((prev) => prev.map((s) => (s.id === stage.id ? { ...s, ...patch } : s)));
    startTransition(async () => {
      const merged = { ...stage, ...patch };
      const res = await updateStage(stage.id, workspaceId, {
        label: merged.label, colorBg: merged.color_bg, colorFg: merged.color_fg, isLeadStage: merged.is_lead_stage,
      });
      if (res?.error) { setError(res.error); return; }
      refresh();
    });
  }

  function handleSetWon(stageId) {
    setError(null);
    startTransition(async () => {
      const res = await setWonStage(workspaceId, stageId);
      if (res?.error) { setError(res.error); return; }
      refresh();
    });
  }

  function handleDelete(stage) {
    setError(null);
    if (!confirm(`למחוק את השלב "${stage.label}"?`)) return;
    startTransition(async () => {
      const res = await deleteStage(stage.id, workspaceId, stage.stage_key);
      if (res?.error) { setError(res.error); return; }
      setStages((prev) => prev.filter((s) => s.id !== stage.id));
      refresh();
    });
  }

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const res = await createStage(workspaceId, newStage);
      if (res?.error) { setError(res.error); return; }
      setNewStage({ stageKey: '', label: '', colorBg: '#f4f4f5', colorFg: '#52525b', isLeadStage: false, isSideStage: false });
      refresh();
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && <div style={{ color: '#b23b2f', fontSize: 12.5, background: '#fef2f2', border: '1px solid #f0d0cc', borderRadius: 6, padding: '8px 12px' }}>{error}</div>}

      <div style={{ background: '#fff', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border, #e5e5e5)', background: '#f9f9f9', fontSize: 12.5, fontWeight: 600 }}>
          רצף השלבים הראשי
        </div>
        {mainStages.map((s, i) => (
          <StageRow
            key={s.id}
            stage={s}
            reorderable
            canMoveUp={i > 0}
            canMoveDown={i < mainStages.length - 1}
            onMoveUp={() => handleMove(s.id, -1)}
            onMoveDown={() => handleMove(s.id, 1)}
            isDragging={dragId === s.id}
            onDragStart={() => setDragId(s.id)}
            onDragEnd={() => setDragId(null)}
            onDropOn={() => handleDrop(s.id)}
            onUpdate={(patch) => handleUpdate(s, patch)}
            onSetWon={() => handleSetWon(s.id)}
            onDelete={() => handleDelete(s)}
            disabled={isPending}
          />
        ))}
        {mainStages.length === 0 && <div style={{ padding: '12px 14px', fontSize: 12.5, color: '#9b9b9b' }}>אין שלבים ברצף הראשי</div>}
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border, #e5e5e5)', background: '#f9f9f9', fontSize: 12.5, fontWeight: 600 }}>
          שלבי-צד (מחוץ לרצף, כמו "סגור" / "תקלה בחיוב")
        </div>
        {sideStages.map((s) => (
          <StageRow
            key={s.id}
            stage={s}
            onUpdate={(patch) => handleUpdate(s, patch)}
            onDelete={() => handleDelete(s)}
            disabled={isPending}
          />
        ))}
        {sideStages.length === 0 && <div style={{ padding: '12px 14px', fontSize: 12.5, color: '#9b9b9b' }}>אין שלבי-צד</div>}
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '14px 16px' }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>הוספת שלב חדש</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input placeholder="מפתח טכני (אנגלית, לא ניתן לשינוי אחר כך)" value={newStage.stageKey}
            onChange={(e) => setNewStage((p) => ({ ...p, stageKey: e.target.value }))} style={{ ...inputStyle, width: 220 }} />
          <input placeholder="תווית" value={newStage.label}
            onChange={(e) => setNewStage((p) => ({ ...p, label: e.target.value }))} style={{ ...inputStyle, width: 160 }} />
          <input type="color" value={newStage.colorBg} onChange={(e) => setNewStage((p) => ({ ...p, colorBg: e.target.value }))} title="צבע רקע" />
          <input type="color" value={newStage.colorFg} onChange={(e) => setNewStage((p) => ({ ...p, colorFg: e.target.value }))} title="צבע טקסט" />
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={newStage.isLeadStage} onChange={(e) => setNewStage((p) => ({ ...p, isLeadStage: e.target.checked }))} />
            שלב ליד
          </label>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={newStage.isSideStage} onChange={(e) => setNewStage((p) => ({ ...p, isSideStage: e.target.checked }))} />
            שלב-צד
          </label>
          <button type="button" onClick={handleCreate} disabled={isPending || !newStage.stageKey.trim() || !newStage.label.trim()}
            style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 16px', fontSize: 12.5, cursor: 'pointer' }}>
            הוספה
          </button>
        </div>
      </div>
    </div>
  );
}

function StageRow({ stage, reorderable, canMoveUp, canMoveDown, onMoveUp, onMoveDown, isDragging, onDragStart, onDragEnd, onDropOn, onUpdate, onSetWon, onDelete, disabled }) {
  const [label, setLabel] = useState(stage.label);

  return (
    <div
      draggable={reorderable && !disabled}
      onDragStart={reorderable ? onDragStart : undefined}
      onDragEnd={reorderable ? onDragEnd : undefined}
      onDragOver={reorderable ? (e) => e.preventDefault() : undefined}
      onDrop={reorderable ? (e) => { e.preventDefault(); onDropOn(); } : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid #f2f2f2', flexWrap: 'wrap',
        opacity: isDragging ? 0.4 : 1, background: isDragging ? 'var(--surface-hover)' : 'transparent',
      }}
    >
      {reorderable && (
        <span title="גרירה לסידור" style={{ cursor: 'grab', color: 'var(--text-muted)', fontSize: 14, userSelect: 'none' }}>⠿</span>
      )}
      {onMoveUp && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <button type="button" onClick={onMoveUp} disabled={disabled || !canMoveUp} style={{ background: 'none', border: 'none', cursor: canMoveUp ? 'pointer' : 'default', opacity: canMoveUp ? 1 : 0.3, fontSize: 11, padding: 0 }}>▲</button>
          <button type="button" onClick={onMoveDown} disabled={disabled || !canMoveDown} style={{ background: 'none', border: 'none', cursor: canMoveDown ? 'pointer' : 'default', opacity: canMoveDown ? 1 : 0.3, fontSize: 11, padding: 0 }}>▼</button>
        </div>
      )}
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 4, fontSize: 11, fontWeight: 500,
        background: stage.color_bg, color: stage.color_fg, flexShrink: 0,
      }}>
        {stage.label}
      </span>
      <code style={{ fontSize: 10.5, color: '#9b9b9b' }}>{stage.stage_key}</code>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => { if (label.trim() && label !== stage.label) onUpdate({ label: label.trim() }); }}
        disabled={disabled}
        style={{ ...inputStyle, width: 140 }}
      />
      <input type="color" value={stage.color_bg} onChange={(e) => onUpdate({ color_bg: e.target.value })} disabled={disabled} title="צבע רקע" />
      <input type="color" value={stage.color_fg} onChange={(e) => onUpdate({ color_fg: e.target.value })} disabled={disabled} title="צבע טקסט" />
      {onSetWon && (
        <label style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 4, color: stage.is_won_stage ? '#0d9488' : '#9b9b9b' }}>
          <input type="checkbox" checked={stage.is_won_stage} onChange={onSetWon} disabled={disabled} />
          שלב-ניצחון
        </label>
      )}
      {onMoveUp && (
        <label style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={stage.is_lead_stage} onChange={(e) => onUpdate({ is_lead_stage: e.target.checked })} disabled={disabled} />
          שלב ליד
        </label>
      )}
      <button type="button" onClick={onDelete} disabled={disabled} style={{ marginInlineStart: 'auto', background: 'none', border: 'none', color: '#b23b2f', fontSize: 12, cursor: 'pointer' }}>
        🗑 מחיקה
      </button>
    </div>
  );
}
