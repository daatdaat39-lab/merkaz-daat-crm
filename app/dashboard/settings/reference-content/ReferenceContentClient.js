'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addReferenceContent, updateReferenceContent, removeReferenceContent, analyzeRuleProposals } from './actions';

const inputStyle = { border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '6px 10px', fontSize: 13 };

const KIND_LABELS = { playbook: '📋 תסריטי-מכירה (Playbook)', kb: '📚 מאגר-ידע (שירות)', rule: '⚙️ כללי-AI' };

export default function ReferenceContentClient({ items, courses }) {
  const [kind, setKind] = useState('playbook');
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {Object.entries(KIND_LABELS).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setKind(k)} style={tabBtn(kind === k)}>{label}</button>
        ))}
      </div>
      {kind === 'rule' && (
        <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-secondary)' }}>
          כללים שה-AI מתבסס עליהם כשהוא כותב לנציג "מה לעשות עכשיו" - למשל "אם מבקש החזר → התקשר/י בתוך יום". ללא כלל מתאים, ה-AI עדיין יציע המלצה סבירה לבד.
        </p>
      )}
      <KindSection kind={kind} items={items.filter((i) => i.kind === kind)} courses={courses} />
    </div>
  );
}

function tabBtn(active) {
  return {
    background: active ? '#0a0a0a' : 'var(--bg)', color: active ? '#fff' : 'inherit',
    border: '1px solid var(--border, #e5e5e5)', borderRadius: 999, padding: '7px 16px', fontSize: 12.5, cursor: 'pointer',
  };
}

function KindSection({ kind, items: initialItems, courses }) {
  const [items, setItems] = useState(initialItems);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [triggerCondition, setTriggerCondition] = useState('');
  const [suggestedAction, setSuggestedAction] = useState('');
  const [courseId, setCourseId] = useState('');
  const [tag, setTag] = useState('');
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const [analyzing, startAnalyzing] = useTransition();
  const [analyzeMsg, setAnalyzeMsg] = useState('');
  const router = useRouter();
  const isRule = kind === 'rule';

  function handleAnalyze() {
    setAnalyzeMsg('');
    startAnalyzing(async () => {
      const res = await analyzeRuleProposals();
      if (res?.error) { setAnalyzeMsg(res.error); return; }
      setAnalyzeMsg(res.message || `נוספו ${res.proposed} הצעות חדשות`);
      router.refresh();
    });
  }

  function handleReviewProposal(item, approve) {
    startTransition(async () => {
      const res = await updateReferenceContent(item.id, approve ? { approved: true } : { rejected: true });
      if (res?.error) { setError(res.error); return; }
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, approved: approve, rejected: !approve } : i)));
      router.refresh();
    });
  }

  function resetForm() {
    setTitle(''); setBody(''); setTriggerCondition(''); setSuggestedAction(''); setCourseId(''); setTag(''); setAdding(false);
  }

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const res = await addReferenceContent({ kind, courseId: courseId || null, tag, title, body, triggerCondition, suggestedAction });
      if (res?.error) { setError(res.error); return; }
      resetForm();
      router.refresh();
    });
  }

  function handleRemove(id) {
    startTransition(async () => {
      const res = await removeReferenceContent(id);
      if (res?.error) { setError(res.error); return; }
      setItems((prev) => prev.filter((i) => i.id !== id));
      router.refresh();
    });
  }

  function handleToggleActive(item) {
    startTransition(async () => {
      const res = await updateReferenceContent(item.id, { isActive: !item.is_active });
      if (res?.error) { setError(res.error); return; }
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_active: !i.is_active } : i)));
      router.refresh();
    });
  }

  const canSave = isRule
    ? !isPending && title.trim() && triggerCondition.trim() && suggestedAction.trim()
    : !isPending && title.trim() && body.trim();

  // הצעות-ממתינות (auto_suggested, עדיין לא אושרו/נדחו ע"י מנהל) מוצגות
  // בנפרד מהכללים הפעילים - הצעה שנדחתה (rejected) נשארת מסומנת ב-DB
  // (לא נמחקת, כדי שלא תוצע שוב) אבל כבר לא מוצגת כאן בכלל.
  const pendingProposals = isRule ? items.filter((i) => !i.approved && !i.rejected) : [];
  const visibleItems = isRule ? items.filter((i) => i.approved && !i.rejected) : items;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {error && <div style={{ color: '#b23b2f', fontSize: 12 }}>{error}</div>}

      {isRule && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <button type="button" onClick={handleAnalyze} disabled={analyzing} style={{ ...inputStyle, cursor: 'pointer' }}>
            🔍 {analyzing ? 'מנתח...' : 'נתח כללים חדשים מה-AI'}
          </button>
          {analyzeMsg && <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{analyzeMsg}</span>}
        </div>
      )}

      {pendingProposals.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#7c3aed', textTransform: 'uppercase' }}>הצעות ממתינות לאישור ({pendingProposals.length})</div>
          {pendingProposals.map((item) => (
            <div key={item.id} style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: '12px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                  {item.title}
                  <span style={{ marginInlineStart: 8, fontSize: 10, fontWeight: 600, color: '#7c3aed', background: '#fff', borderRadius: 100, padding: '1px 8px' }}>הוצע ע"י AI · ממתין לאישור</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
                  <button type="button" onClick={() => handleReviewProposal(item, true)} disabled={isPending} style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 100, padding: '4px 12px', fontSize: 11.5, cursor: 'pointer' }}>
                    ✓ אישור
                  </button>
                  <button type="button" onClick={() => handleReviewProposal(item, false)} disabled={isPending} style={{ background: 'none', border: '1px solid var(--border, #e5e5e5)', borderRadius: 100, padding: '4px 12px', fontSize: 11.5, cursor: 'pointer' }}>
                    דחייה
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 6 }}>
                <div><strong>תנאי:</strong> {item.trigger_condition}</div>
                <div style={{ marginTop: 3 }}><strong>פעולה:</strong> {item.suggested_action}</div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted, #9b9b9b)', marginTop: 8 }}>
                {courses.find((c) => c.id === item.course_id)?.name || 'כל הקורסים'}
              </div>
            </div>
          ))}
        </div>
      )}

      {visibleItems.length === 0 && !adding && (
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>אין עדיין תוכן מהסוג הזה.</div>
      )}

      {visibleItems.map((item) => (
        <div key={item.id} style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '12px 16px', opacity: item.is_active ? 1 : 0.5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>
              {item.title}
              {item.auto_suggested && (
                <span style={{ marginInlineStart: 8, fontSize: 10, fontWeight: 600, color: '#7c3aed', background: '#f5f3ff', borderRadius: 100, padding: '1px 8px' }}>הוצע ע"י AI</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
              <button type="button" onClick={() => handleToggleActive(item)} disabled={isPending} style={{ ...inputStyle, cursor: 'pointer', fontSize: 11, padding: '3px 8px' }}>
                {item.is_active ? 'השבת' : 'הפעל'}
              </button>
              <button type="button" onClick={() => handleRemove(item.id)} disabled={isPending} style={{ background: 'none', border: 'none', color: '#b23b2f', cursor: 'pointer', fontSize: 12 }}>✕</button>
            </div>
          </div>
          {isRule ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 6 }}>
              <div><strong>תנאי:</strong> {item.trigger_condition}</div>
              <div style={{ marginTop: 3 }}><strong>פעולה:</strong> {item.suggested_action}</div>
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 6, whiteSpace: 'pre-wrap' }}>{item.body}</div>
          )}
          <div style={{ fontSize: 11, color: 'var(--text-muted, #9b9b9b)', marginTop: 8 }}>
            {courses.find((c) => c.id === item.course_id)?.name || 'כל הקורסים'}
            {item.tag ? ` · תגית: ${item.tag}` : ''}
          </div>
        </div>
      ))}

      {adding ? (
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isRule ? 'שם הכלל...' : 'כותרת...'} style={inputStyle} />
          {isRule ? (
            <>
              <input value={triggerCondition} onChange={(e) => setTriggerCondition(e.target.value)} placeholder='תנאי (לדוג׳: "מבקש החזר כספי")' style={inputStyle} />
              <input value={suggestedAction} onChange={(e) => setSuggestedAction(e.target.value)} placeholder='פעולה מוצעת (לדוג׳: "להתקשר בתוך יום עבודה")' style={inputStyle} />
            </>
          ) : (
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="תוכן..." rows={4} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
              <option value="">כל הקורסים</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {!isRule && (
              <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder={kind === 'playbook' ? 'סוג התנגדות (לדוג׳: יקר לי)' : 'סוג תקלה'} style={{ ...inputStyle, flex: 1 }} />
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={resetForm} style={{ ...inputStyle, cursor: 'pointer' }}>ביטול</button>
            <button type="button" onClick={handleAdd} disabled={!canSave} style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 16px', fontSize: 12.5, cursor: 'pointer' }}>
              שמירה
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} style={{ ...inputStyle, cursor: 'pointer', alignSelf: 'flex-start' }}>
          + הוספת {kind === 'playbook' ? 'תסריט' : kind === 'kb' ? 'ערך-ידע' : 'כלל'}
        </button>
      )}
    </div>
  );
}
