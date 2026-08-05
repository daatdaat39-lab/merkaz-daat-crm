'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createStage, updateStage, setWonStage, reorderStages, deleteStage, reassignStageAndDelete, upsertStageAutomation, deleteStageAutomation } from './actions';

const inputStyle = { border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '6px 8px', fontSize: 12.5 };

// שיוך מפורש של שלב לטאב ברשימת הלידים (LeadsBoard.js) - 'auto' משתמש
// בהיוריסטיקה הקיימת (leadStages/wonStage/שיוך נציג); כל ערך אחר עוקף
// אותה לגמרי לשלב הזה (ר' migration 0047).
const LEAD_TAB_OPTIONS = [
  { value: 'auto', label: 'אוטומטי (ברירת מחדל)' },
  { value: 'new', label: 'פתוחים / חדשים' },
  { value: 'in_progress', label: 'בתהליך' },
  { value: 'won', label: 'הצליחו' },
  { value: 'closed', label: 'נפלו / סגורים' },
];

export default function PipelinesClient({ workspaces, stagesByWorkspaceId, automationsByStageId = {}, whatsappTemplates = [], emailTemplates = [] }) {
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
          <WorkspacePipelineEditor
            key={w.id}
            workspaceId={w.id}
            initialStages={stagesByWorkspaceId[w.id] || []}
            automationsByStageId={automationsByStageId}
            whatsappTemplates={whatsappTemplates}
            emailTemplates={emailTemplates}
          />
        )
      ))}
    </div>
  );
}

function WorkspacePipelineEditor({ workspaceId, initialStages, automationsByStageId, whatsappTemplates, emailTemplates }) {
  const [stages, setStages] = useState(initialStages);
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const [reassignFor, setReassignFor] = useState(null); // { stage, contactCount }
  const router = useRouter();

  // useState(initialStages) קורא את הפרופ פעם אחת בלבד ב-mount - בלי
  // ה-effect הזה, router.refresh() אחרי הוספה/מיון/מחיקה כן מביא מהשרת
  // stages מעודכן, אבל ה-state המקומי הישן ממשיך "לנצח" בתצוגה (React
  // לא מאתחל מחדש useState כשפרופ משתנה) - נראה כאילו כלום לא קרה,
  // למרות שהפעולה כן הצליחה ב-DB.
  useEffect(() => {
    setStages(initialStages);
  }, [initialStages]);

  const [newStage, setNewStage] = useState({ stageKey: '', label: '', colorBg: '#f4f4f5', colorFg: '#52525b', isLeadStage: false, isSideStage: false, leadTab: 'auto' });

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
        leadTab: merged.lead_tab,
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
      if (res?.error) {
        if (res.contactCount) { setReassignFor({ stage, contactCount: res.contactCount }); return; }
        setError(res.error);
        return;
      }
      setStages((prev) => prev.filter((s) => s.id !== stage.id));
      refresh();
    });
  }

  function handleReassignAndDelete(toStageKey) {
    const { stage } = reassignFor;
    setError(null);
    startTransition(async () => {
      const res = await reassignStageAndDelete(stage.id, workspaceId, stage.stage_key, toStageKey);
      if (res?.error) { setError(res.error); setReassignFor(null); return; }
      setStages((prev) => prev.filter((s) => s.id !== stage.id));
      setReassignFor(null);
      refresh();
    });
  }

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const res = await createStage(workspaceId, newStage);
      if (res?.error) { setError(res.error); return; }
      setNewStage({ stageKey: '', label: '', colorBg: '#f4f4f5', colorFg: '#52525b', isLeadStage: false, isSideStage: false, leadTab: 'auto' });
      refresh();
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && <div style={{ color: '#b23b2f', fontSize: 12.5, background: '#fef2f2', border: '1px solid #f0d0cc', borderRadius: 6, padding: '8px 12px' }}>{error}</div>}

      <div style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, overflow: 'hidden' }}>
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
            workspaceId={workspaceId}
            automations={automationsByStageId[s.id] || []}
            whatsappTemplates={whatsappTemplates}
            emailTemplates={emailTemplates}
            refresh={refresh}
          />
        ))}
        {mainStages.length === 0 && <div style={{ padding: '12px 14px', fontSize: 12.5, color: '#9b9b9b' }}>אין שלבים ברצף הראשי</div>}
      </div>

      <div style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, overflow: 'hidden' }}>
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
            workspaceId={workspaceId}
            automations={automationsByStageId[s.id] || []}
            whatsappTemplates={whatsappTemplates}
            emailTemplates={emailTemplates}
            refresh={refresh}
          />
        ))}
        {sideStages.length === 0 && <div style={{ padding: '12px 14px', fontSize: 12.5, color: '#9b9b9b' }}>אין שלבי-צד</div>}
      </div>

      <div style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '14px 16px' }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>הוספת שלב חדש</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input placeholder="מפתח טכני (אנגלית, לא ניתן לשינוי אחר כך)" value={newStage.stageKey}
            onChange={(e) => setNewStage((p) => ({ ...p, stageKey: e.target.value }))} style={{ ...inputStyle, width: 220 }} />
          <input placeholder="תווית" value={newStage.label}
            onChange={(e) => setNewStage((p) => ({ ...p, label: e.target.value }))} style={{ ...inputStyle, width: 160 }} />
          <input type="color" value={newStage.colorBg} onChange={(e) => setNewStage((p) => ({ ...p, colorBg: e.target.value }))} title="צבע רקע" />
          <input type="color" value={newStage.colorFg} onChange={(e) => setNewStage((p) => ({ ...p, colorFg: e.target.value }))} title="צבע טקסט" />
          <select value={newStage.leadTab} onChange={(e) => setNewStage((p) => ({ ...p, leadTab: e.target.value }))} title="שיוך לטאב ברשימת הלידים" style={inputStyle}>
            {LEAD_TAB_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
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

      {reassignFor && (
        <ReassignStageDialog
          stage={reassignFor.stage}
          contactCount={reassignFor.contactCount}
          otherStages={stages.filter((s) => s.id !== reassignFor.stage.id)}
          isPending={isPending}
          onConfirm={handleReassignAndDelete}
          onCancel={() => setReassignFor(null)}
        />
      )}
    </div>
  );
}

// דיאלוג מחיקת שלב "חכמה" - מוצג כשיש אנשי קשר בשלב הנמחק; מאפשר לבחור
// שלב יעד ומעביר את כולם אליו לפני המחיקה (ר' reassignStageAndDelete)
function ReassignStageDialog({ stage, contactCount, otherStages, isPending, onConfirm, onCancel }) {
  const [target, setTarget] = useState('');
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onCancel}>
      <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 20, width: 340, boxShadow: 'var(--shadow-md, 0 8px 24px rgba(0,0,0,0.2))' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>מחיקת שלב "{stage.label}"</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 14 }}>
          {contactCount} אנשי קשר נמצאים כרגע בשלב הזה. בחרו שלב יעד להעברתם לפני המחיקה:
        </div>
        <select value={target} onChange={(e) => setTarget(e.target.value)} style={{ ...inputStyle, width: '100%', marginBottom: 14 }}>
          <option value="">בחר שלב יעד...</option>
          {otherStages.map((s) => <option key={s.id} value={s.stage_key}>{s.label}{s.is_side_stage ? ' (שלב-צד)' : ''}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => onConfirm(target)} disabled={isPending || !target}
            style={{ flex: 1, background: '#b23b2f', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 0', fontSize: 12.5, cursor: target ? 'pointer' : 'default', opacity: target ? 1 : 0.5 }}>
            העברה ומחיקה
          </button>
          <button type="button" onClick={onCancel} disabled={isPending}
            style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '8px 0', fontSize: 12.5, cursor: 'pointer' }}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

function StageRow({ stage, reorderable, canMoveUp, canMoveDown, onMoveUp, onMoveDown, isDragging, onDragStart, onDragEnd, onDropOn, onUpdate, onSetWon, onDelete, disabled, workspaceId, automations = [], whatsappTemplates = [], emailTemplates = [], refresh }) {
  const [label, setLabel] = useState(stage.label);
  const [automationOpen, setAutomationOpen] = useState(false);

  return (
    <div style={{ borderBottom: '1px solid #f2f2f2' }}>
    <div
      draggable={reorderable && !disabled}
      onDragStart={reorderable ? onDragStart : undefined}
      onDragEnd={reorderable ? onDragEnd : undefined}
      onDragOver={reorderable ? (e) => e.preventDefault() : undefined}
      onDrop={reorderable ? (e) => { e.preventDefault(); onDropOn(); } : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', flexWrap: 'wrap',
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
      <label style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ color: '#9b9b9b' }}>טאב לידים:</span>
        <select value={stage.lead_tab || 'auto'} onChange={(e) => onUpdate({ lead_tab: e.target.value })} disabled={disabled} style={{ ...inputStyle, padding: '3px 6px', fontSize: 11.5 }}>
          {LEAD_TAB_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <button type="button" onClick={() => setAutomationOpen((v) => !v)} disabled={disabled} style={{ background: 'none', border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '3px 9px', fontSize: 11.5, color: automations.length > 0 ? '#0d9488' : '#6b6b6b', cursor: 'pointer' }}>
        ⚡ אוטומציה{automations.length > 0 ? ` (${automations.length})` : ''}
      </button>
      <button type="button" onClick={onDelete} disabled={disabled} style={{ marginInlineStart: 'auto', background: 'none', border: 'none', color: '#b23b2f', fontSize: 12, cursor: 'pointer' }}>
        🗑 מחיקה
      </button>
    </div>
    {automationOpen && (
      <StageAutomationPanel
        workspaceId={workspaceId}
        stageKey={stage.stage_key}
        automations={automations}
        whatsappTemplates={whatsappTemplates}
        emailTemplates={emailTemplates}
        disabled={disabled}
        refresh={refresh}
      />
    )}
    </div>
  );
}

const AUTOMATION_ACTION_TYPES = [
  { value: 'send_whatsapp_template', label: 'שליחת תבנית WhatsApp' },
  { value: 'send_email_template', label: 'שליחת תבנית מייל' },
  { value: 'create_task', label: 'יצירת משימת פולו-אפ' },
];

// פאנל אוטומציה לשלב - עד שורה אחת מכל סוג פעולה (whatsapp/email/task),
// נשמר מיד עם upsertStageAutomation (לפי workspace+stage+action_type)
function StageAutomationPanel({ workspaceId, stageKey, automations, whatsappTemplates, emailTemplates, disabled, refresh }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState({ actionType: '', whatsappTemplateId: '', emailTemplateId: '', taskTitle: '', taskDueOffsetDays: 1 });

  function handleSave() {
    if (!draft.actionType) return;
    setError(null);
    startTransition(async () => {
      const res = await upsertStageAutomation(workspaceId, stageKey, draft);
      if (res?.error) { setError(res.error); return; }
      setDraft({ actionType: '', whatsappTemplateId: '', emailTemplateId: '', taskTitle: '', taskDueOffsetDays: 1 });
      refresh();
    });
  }

  function handleDelete(id) {
    setError(null);
    startTransition(async () => {
      const res = await deleteStageAutomation(id, workspaceId);
      if (res?.error) { setError(res.error); return; }
      refresh();
    });
  }

  const actionLabel = (type) => AUTOMATION_ACTION_TYPES.find((t) => t.value === type)?.label || type;
  const templateName = (a) => {
    if (a.action_type === 'send_whatsapp_template') return whatsappTemplates.find((t) => t.id === a.whatsapp_template_id)?.name || '—';
    if (a.action_type === 'send_email_template') return emailTemplates.find((t) => t.id === a.email_template_id)?.name || '—';
    return a.task_title || 'פולו-אפ אוטומטי';
  };

  return (
    <div style={{ padding: '10px 14px 14px', background: 'var(--surface-hover, #f4f5f7)' }}>
      {error && <div style={{ color: '#b23b2f', fontSize: 11.5, marginBottom: 8 }}>{error}</div>}
      {automations.map((a) => (
        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 6 }}>
          <span style={{ fontWeight: 500 }}>{actionLabel(a.action_type)}</span>
          <span style={{ color: '#6b6b6b' }}>{templateName(a)}</span>
          <button type="button" onClick={() => handleDelete(a.id)} disabled={disabled || isPending} style={{ marginInlineStart: 'auto', background: 'none', border: 'none', color: '#b23b2f', fontSize: 11, cursor: 'pointer' }}>הסרה</button>
        </div>
      ))}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 8 }}>
        <select value={draft.actionType} onChange={(e) => setDraft((p) => ({ ...p, actionType: e.target.value }))} style={inputStyle}>
          <option value="">+ הוספת אוטומציה...</option>
          {AUTOMATION_ACTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {draft.actionType === 'send_whatsapp_template' && (
          <select value={draft.whatsappTemplateId} onChange={(e) => setDraft((p) => ({ ...p, whatsappTemplateId: e.target.value }))} style={inputStyle}>
            <option value="">בחר תבנית...</option>
            {whatsappTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {draft.actionType === 'send_email_template' && (
          <select value={draft.emailTemplateId} onChange={(e) => setDraft((p) => ({ ...p, emailTemplateId: e.target.value }))} style={inputStyle}>
            <option value="">בחר תבנית...</option>
            {emailTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {draft.actionType === 'create_task' && (
          <>
            <input placeholder="כותרת המשימה" value={draft.taskTitle} onChange={(e) => setDraft((p) => ({ ...p, taskTitle: e.target.value }))} style={{ ...inputStyle, width: 160 }} />
            <input type="number" min={0} value={draft.taskDueOffsetDays} onChange={(e) => setDraft((p) => ({ ...p, taskDueOffsetDays: Number(e.target.value) }))} title="יעד בעוד כמה ימים" style={{ ...inputStyle, width: 60 }} />
            <span style={{ fontSize: 11, color: '#6b6b6b' }}>ימים</span>
          </>
        )}
        {draft.actionType && (
          <button type="button" onClick={handleSave} disabled={disabled || isPending} style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>
            שמירה
          </button>
        )}
      </div>
    </div>
  );
}
