'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendContactEmail } from '../actions';
import { renderTemplate } from '../../lib/templateRender';
import { splitTemplates, needsGrouping } from '../../lib/templateSuggestions';

// חלון קטן לכתיבת מייל ושליחתו מתוך המחלקה הפעילה, דרך תיבת המייל
// המחוברת לאותה מחלקה (email_connections). נרשם גם ב-sent_emails
// כך שיוצג בטאב "פעילות" בכרטיס.
// stageKey/courseId (אופציונליים): השלב והקורס של הליד - לפיהם מוצגות למעלה
// "מומלצות לשלב הנוכחי" (עד 4), ושאר התבניות מקובצות לפי קטגוריה.
export default function EmailComposeModal({ contactId, workspaceId, departmentId = null, fromAddress, toAddress, firstName, templates: allTemplates = [], stageKey = null, courseId = null, initialSubject = '', initialBody = '', onClose, onSent }) {
  const split = useMemo(() => splitTemplates(allTemplates, { workspaceId, stageKey, courseId }), [allTemplates, workspaceId, stageKey, courseId]);
  const templates = split.all;
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function applyTemplate(id) {
    const t = templates.find((tpl) => tpl.id === id);
    if (!t) return;
    setSubject(renderTemplate(t.subject, { first: firstName }));
    setBody(renderTemplate(t.body, { first: firstName }));
  }

  function handleSend() {
    setError(null);
    startTransition(async () => {
      const res = await sendContactEmail(contactId, workspaceId, subject, body, departmentId);
      if (res?.error) {
        setError(res.error);
        return;
      }
      router.refresh();
      onSent?.();
      onClose();
    });
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--k-surface)', borderRadius: 16, padding: 20, width: 440, maxWidth: '92vw', display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div style={{ fontFamily: 'var(--k-font-display)', fontSize: 18, color: 'var(--k-text)' }}>שליחת מייל</div>
        <div style={{ fontSize: 12, color: 'var(--k-text-muted)' }}>מאת {fromAddress} · אל {toAddress}</div>

        {error && <div style={{ color: 'var(--k-danger-text)', fontSize: 12.5 }}>שגיאה: {error}</div>}

        {templates.length > 0 && (
          <select
            defaultValue=""
            onChange={(e) => { applyTemplate(e.target.value); e.target.value = ''; }}
            style={{ border: '1px solid var(--k-border)', borderRadius: 8, padding: '7px 12px', fontSize: 12.5, color: 'var(--k-text-muted)', background: 'var(--k-surface)' }}
          >
            <option value="" disabled>טעינת תבנית מוכנה...</option>
            {needsGrouping(split) ? (
              <>
                {split.suggested.length > 0 && (
                  <optgroup label="מומלצות לשלב הנוכחי">
                    {split.suggested.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </optgroup>
                )}
                {split.groups.map((g) => (
                  <optgroup key={g.category} label={split.suggested.length > 0 ? `עוד · ${g.category}` : g.category}>
                    {g.items.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </optgroup>
                ))}
              </>
            ) : templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}

        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="נושא"
          style={{ border: '1px solid var(--k-border)', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: 'var(--k-surface)', color: 'var(--k-text)' }}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="תוכן ההודעה..."
          rows={8}
          style={{ border: '1px solid var(--k-border)', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', background: 'var(--k-surface)', color: 'var(--k-text)' }}
        />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
          <button onClick={onClose} style={{ background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 8, padding: '7px 16px', fontSize: 13, cursor: 'pointer', color: 'var(--k-text)' }}>
            ביטול
          </button>
          <button
            onClick={handleSend}
            disabled={isPending || !subject.trim() || !body.trim()}
            style={{ background: 'var(--k-accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 13, cursor: 'pointer', opacity: isPending ? 0.6 : 1 }}
          >
            {isPending ? 'שולח...' : 'שליחה'}
          </button>
        </div>
      </div>
    </div>
  );
}
