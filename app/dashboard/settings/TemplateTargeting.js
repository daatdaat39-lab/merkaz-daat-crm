'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateTemplateTargeting } from '../contacts/actions';
import { TEMPLATE_CATEGORIES, MAX_SUGGESTED, countTemplatesForStage } from '../lib/templateSuggestions';

// רכיבים משותפים לשני פאנלי התבניות (וואטסאפ / מייל): שיוך תבנית למחלקה,
// לשלב בתהליך, לקטגוריה ולקורס, והצגת השיוך כתגיות. כל שיוך אופציונלי -
// תבנית בלי שיוך מופיעה לנציגים בכל מקום, כמו לפני מיגרציה 0188.

const inputStyle = {
  border: '1px solid var(--border)', borderRadius: 6, padding: '6px 9px', fontSize: 12.5,
  background: 'var(--bg)', color: 'var(--text)', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit',
};
const labelStyle = { display: 'block', fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 3 };

// שדות השיוך - מרונדרים בתוך <form> של ההורה (לפי name), בלי action משלהם.
// בחירת שלב תלויה במחלקה, כי לכל מחלקה יש pipeline משלה.
export function TargetingFields({ workspaces, stagesByWorkspace, courses, defaults = {}, categoryOptions = [] }) {
  const [workspaceId, setWorkspaceId] = useState(defaults.workspace_id || '');
  const [stageKey, setStageKey] = useState(defaults.stage_key || '');
  const stages = workspaceId ? (stagesByWorkspace[workspaceId] || []) : [];
  const categories = [...new Set([...TEMPLATE_CATEGORIES, ...categoryOptions])];
  const activeCourses = courses.filter((c) => c.is_active !== false || c.id === defaults.course_id);
  const listId = `tpl-cat-${defaults.id || 'new'}`;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <div>
          <label style={labelStyle}>מחלקה</label>
          <select name="workspace_id" value={workspaceId} style={inputStyle}
            onChange={(e) => { setWorkspaceId(e.target.value); setStageKey(''); }}>
            <option value="">כל המחלקות</option>
            {/* רק מחלקות שהמשתמש מנהל (השרת אוכף את זה גם) - ועוד המחלקה הנוכחית של התבנית, כדי שתוצג נכון */}
            {workspaces.filter((w) => w.canManage !== false || w.id === defaults.workspace_id)
              .map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>שלב בתהליך</label>
          <select name="stage_key" value={stageKey} disabled={!workspaceId} style={{ ...inputStyle, opacity: workspaceId ? 1 : 0.6 }}
            onChange={(e) => setStageKey(e.target.value)}>
            <option value="">{workspaceId ? 'כל השלבים' : 'בחרו קודם מחלקה'}</option>
            {stages.map((s) => <option key={s.stage_key} value={s.stage_key}>{s.label}{s.is_side_stage ? ' (צד)' : ''}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>קטגוריה</label>
          <input name="category" defaultValue={defaults.category || ''} list={listId} maxLength={40} placeholder="למשל: פתיחה" style={inputStyle} />
          <datalist id={listId}>{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <div>
          <label style={labelStyle}>קורס</label>
          <select name="course_id" defaultValue={defaults.course_id || ''} style={inputStyle}>
            <option value="">כל הקורסים</option>
            {activeCourses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>הצגה לנציגים</label>
          <select name="is_active" defaultValue={defaults.is_active === false ? 'off' : 'on'} style={inputStyle}>
            <option value="on">פעילה</option>
            <option value="off">מוסתרת</option>
          </select>
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
        שדה ריק = מתאימה לכולם. תבנית ששויכה לשלב מוצגת לנציג בראש הרשימה כ&quot;מומלצת לשלב הנוכחי&quot; (עד {MAX_SUGGESTED} לכל שלב); שאר התבניות מקובצות לפי קטגוריה.
      </div>
    </div>
  );
}

// תגיות שיוך קצרות בשורת התבנית
export function TemplateTags({ template, workspaces, stagesByWorkspace, courses }) {
  const ws = workspaces.find((w) => w.id === template.workspace_id);
  const stage = template.stage_key
    ? (stagesByWorkspace[template.workspace_id] || []).find((s) => s.stage_key === template.stage_key)
    : null;
  const course = courses.find((c) => c.id === template.course_id);

  const tags = [];
  if (template.is_active === false) tags.push({ text: 'מוסתרת', tone: 'red' });
  if (ws) tags.push({ text: ws.name });
  if (template.stage_key) tags.push({ text: `שלב: ${stage?.label || template.stage_key}`, tone: 'accent' });
  if (template.category) tags.push({ text: template.category });
  if (course) tags.push({ text: course.name });
  if (!ws && !template.stage_key && !template.category && !course) {
    tags.push({ text: 'ללא שיוך - מוצגת בכל מקום', tone: 'muted' });
  }

  const tone = {
    red: { background: 'var(--red-bg, #fbeaea)', color: 'var(--red)' },
    accent: { background: 'var(--bg-tertiary)', color: 'var(--accent)' },
    muted: { background: 'transparent', color: 'var(--text-muted)', border: '1px dashed var(--border)' },
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
      {tags.map((t, i) => (
        <span key={i} style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 999,
          background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid transparent',
          ...(tone[t.tone] || {}),
        }}>{t.text}</span>
      ))}
    </div>
  );
}

// עורך שיוך לתבנית קיימת: טופס קטן בתוך השורה
export function TemplateTargetingEditor({ kind, template, workspaces, stagesByWorkspace, courses, categoryOptions, onDone }) {
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSave(formData) {
    setError(null);
    startTransition(async () => {
      const res = await updateTemplateTargeting(kind, template.id, formData);
      if (res?.error) { setError(res.error); return; }
      router.refresh();
      onDone();
    });
  }

  return (
    <form action={handleSave} style={{ marginTop: 10, padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }}>
      {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>שגיאה: {error}</div>}
      <TargetingFields workspaces={workspaces} stagesByWorkspace={stagesByWorkspace} courses={courses}
        defaults={template} categoryOptions={categoryOptions} />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="submit" disabled={isPending} style={{ background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 16px', fontSize: 12.5, cursor: 'pointer' }}>
          {isPending ? 'שומר...' : 'שמירת שיוך'}
        </button>
        <button type="button" onClick={onDone} disabled={isPending} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer' }}>
          ביטול
        </button>
      </div>
    </form>
  );
}

// כיסוי: לכל שלב בכל מחלקה - כמה תבניות מומלצות יש לו בכל ערוץ.
// מראה בדיוק את מה שהנציג יקבל (אותו חישוב כמו חלון השליחה).
export function TemplateCoverage({ whatsappTemplates, emailTemplates, workspaces, stagesByWorkspace }) {
  const sections = workspaces
    .map((w) => ({ ws: w, stages: stagesByWorkspace[w.id] || [] }))
    .filter((s) => s.stages.length > 0)
    .map(({ ws, stages }) => ({
      ws,
      rows: stages.map((s) => ({
        stage: s,
        wa: countTemplatesForStage(whatsappTemplates, { workspaceId: ws.id, stageKey: s.stage_key }),
        em: countTemplatesForStage(emailTemplates, { workspaceId: ws.id, stageKey: s.stage_key }),
      })),
    }));
  const emptyCount = sections.reduce((n, s) => n + s.rows.filter((r) => r.wa === 0 && r.em === 0).length, 0);
  const totalStages = sections.reduce((n, s) => n + s.rows.length, 0);

  const cell = (n) => {
    if (n === 0) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
    if (n > MAX_SUGGESTED) return <span style={{ color: 'var(--amber)', fontWeight: 600 }} title={`רק ${MAX_SUGGESTED} יוצגו כמומלצות`}>{n} (יוצגו {MAX_SUGGESTED})</span>;
    return <span style={{ fontWeight: 600 }}>{n}</span>;
  };

  return (
    <details style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 20 }}>
      <summary style={{ padding: '14px 18px', cursor: 'pointer', fontSize: 14, fontWeight: 600, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span>כיסוי תבניות לפי שלב בתהליך</span>
        <span style={{ fontSize: 12, fontWeight: 400, color: emptyCount ? 'var(--amber)' : 'var(--green)' }}>
          {emptyCount ? `${emptyCount} מתוך ${totalStages} שלבים בלי אף תבנית מומלצת` : 'לכל השלבים יש תבניות מומלצות'}
        </span>
      </summary>
      <div style={{ padding: '0 18px 16px', borderTop: '1px solid var(--border)' }}>
        {sections.map(({ ws, rows }) => (
          <div key={ws.id} style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>{ws.name}</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ color: 'var(--text-muted)', fontSize: 11.5, textAlign: 'right' }}>
                    <th style={{ padding: '4px 8px', fontWeight: 500 }}>שלב</th>
                    <th style={{ padding: '4px 8px', fontWeight: 500 }}>וואטסאפ</th>
                    <th style={{ padding: '4px 8px', fontWeight: 500 }}>מייל</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ stage, wa, em }) => (
                    <tr key={stage.stage_key} style={{ borderTop: '1px solid var(--bg-tertiary)' }}>
                      <td style={{ padding: '5px 8px' }}>{stage.label}{stage.is_side_stage ? <span style={{ color: 'var(--text-muted)' }}> (צד)</span> : null}</td>
                      <td style={{ padding: '5px 8px' }}>{cell(wa)}</td>
                      <td style={{ padding: '5px 8px' }}>{cell(em)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
