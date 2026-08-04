'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createCampaignStage, updateCampaignStage, setCampaignWonStage, reorderCampaignStages, deleteCampaignStage } from './actions';

const inputStyle = { border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '6px 8px', fontSize: 12.5 };

export default function CampaignStagesClient({ campaignId, initialStages }) {
  const [stages, setStages] = useState(initialStages);
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [newStage, setNewStage] = useState({ stageKey: '', label: '', colorBg: '#f4f4f5', colorFg: '#52525b' });

  const sorted = [...stages].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  function refresh() {
    router.refresh();
  }

  function handleMove(id, direction) {
    const idx = sorted.findIndex((s) => s.id === id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const reordered = [...sorted];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    setStages(reordered);
    startTransition(async () => {
      await reorderCampaignStages(campaignId, reordered.map((s) => s.id));
      refresh();
    });
  }

  function handleUpdate(stage, patch) {
    setError(null);
    setStages((prev) => prev.map((s) => (s.id === stage.id ? { ...s, ...patch } : s)));
    startTransition(async () => {
      const merged = { ...stage, ...patch };
      const res = await updateCampaignStage(stage.id, campaignId, { label: merged.label, colorBg: merged.color_bg, colorFg: merged.color_fg });
      if (res?.error) { setError(res.error); return; }
      refresh();
    });
  }

  function handleSetWon(stageId) {
    setError(null);
    startTransition(async () => {
      const res = await setCampaignWonStage(campaignId, stageId);
      if (res?.error) { setError(res.error); return; }
      refresh();
    });
  }

  function handleDelete(stage) {
    setError(null);
    if (!confirm(`למחוק את השלב "${stage.label}"?`)) return;
    startTransition(async () => {
      const res = await deleteCampaignStage(stage.id, campaignId, stage.stage_key);
      if (res?.error) { setError(res.error); return; }
      setStages((prev) => prev.filter((s) => s.id !== stage.id));
      refresh();
    });
  }

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const res = await createCampaignStage(campaignId, newStage);
      if (res?.error) { setError(res.error); return; }
      setNewStage({ stageKey: '', label: '', colorBg: '#f4f4f5', colorFg: '#52525b' });
      refresh();
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && <div style={{ color: '#b23b2f', fontSize: 12.5, background: '#fef2f2', border: '1px solid #f0d0cc', borderRadius: 6, padding: '8px 12px' }}>{error}</div>}

      <div style={{ background: '#fff', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, overflow: 'hidden' }}>
        {sorted.map((s, i) => (
          <StageRow
            key={s.id}
            stage={s}
            canMoveUp={i > 0}
            canMoveDown={i < sorted.length - 1}
            onMoveUp={() => handleMove(s.id, -1)}
            onMoveDown={() => handleMove(s.id, 1)}
            onUpdate={(patch) => handleUpdate(s, patch)}
            onSetWon={() => handleSetWon(s.id)}
            onDelete={() => handleDelete(s)}
            disabled={isPending}
          />
        ))}
        {sorted.length === 0 && <div style={{ padding: '12px 14px', fontSize: 12.5, color: '#9b9b9b' }}>אין שלבים עדיין</div>}
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
          <button type="button" onClick={handleCreate} disabled={isPending || !newStage.stageKey.trim() || !newStage.label.trim()}
            style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 16px', fontSize: 12.5, cursor: 'pointer' }}>
            הוספה
          </button>
        </div>
      </div>
    </div>
  );
}

function StageRow({ stage, canMoveUp, canMoveDown, onMoveUp, onMoveDown, onUpdate, onSetWon, onDelete, disabled }) {
  const [label, setLabel] = useState(stage.label);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid #f2f2f2', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <button type="button" onClick={onMoveUp} disabled={disabled || !canMoveUp} style={{ background: 'none', border: 'none', cursor: canMoveUp ? 'pointer' : 'default', opacity: canMoveUp ? 1 : 0.3, fontSize: 11, padding: 0 }}>▲</button>
        <button type="button" onClick={onMoveDown} disabled={disabled || !canMoveDown} style={{ background: 'none', border: 'none', cursor: canMoveDown ? 'pointer' : 'default', opacity: canMoveDown ? 1 : 0.3, fontSize: 11, padding: 0 }}>▼</button>
      </div>
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
      <label style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 4, color: stage.is_won_stage ? '#0d9488' : '#9b9b9b' }}>
        <input type="checkbox" checked={stage.is_won_stage} onChange={onSetWon} disabled={disabled} />
        שלב-ניצחון
      </label>
      <button type="button" onClick={onDelete} disabled={disabled} style={{ marginInlineStart: 'auto', background: 'none', border: 'none', color: '#b23b2f', fontSize: 12, cursor: 'pointer' }}>
        🗑 מחיקה
      </button>
    </div>
  );
}
