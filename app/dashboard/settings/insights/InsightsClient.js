'use client';

import { useState, useTransition } from 'react';
import { analyzeManagerInsights, applySuggestedAutomation, applyAssignUnassignedToSelf } from './actions';
import { card, iconBlock } from '../../components/designTokens';

export default function InsightsClient({ workspaceId, workspaceName }) {
  const [suggestions, setSuggestions] = useState(null); // null = לא נותח עדיין
  const [applied, setApplied] = useState(() => new Set());
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();

  function handleAnalyze() {
    setError(null);
    startTransition(async () => {
      const res = await analyzeManagerInsights(workspaceId, workspaceName);
      if (res?.error) { setError(res.error); return; }
      setSuggestions(res.suggestions);
    });
  }

  function handleApply(suggestion, idx) {
    setError(null);
    startTransition(async () => {
      const res = await applySuggestedAutomation(workspaceId, suggestion.actionStageKey, suggestion.title);
      if (res?.error) { setError(res.error); return; }
      setApplied((prev) => new Set(prev).add(idx));
    });
  }

  function handleApplyUnassigned(suggestion, idx) {
    setError(null);
    startTransition(async () => {
      const res = await applyAssignUnassignedToSelf(workspaceId, suggestion.actionUnassignedStageKey);
      if (res?.error) { setError(res.error); return; }
      setApplied((prev) => new Set(prev).add(idx));
    });
  }

  return (
    <div>
      <button
        onClick={handleAnalyze}
        disabled={isPending}
        style={{ background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 18px', fontSize: 13, cursor: 'pointer', marginBottom: 20 }}
      >
        {isPending ? 'מנתח...' : suggestions ? '🔄 נתח מחדש' : '💡 נתח כעת'}
      </button>

      {error && <div style={{ color: '#b23b2f', fontSize: 12.5, marginBottom: 16 }}>שגיאה: {error}</div>}

      {suggestions && suggestions.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>אין כרגע תובנות משמעותיות - הנתונים נראים תקינים.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(suggestions || []).map((s, idx) => (
          <div key={idx} style={card({ padding: '16px 18px' })}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{s.title}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{s.description}</div>
            {s.actionStageKey && (
              <button
                onClick={() => handleApply(s, idx)}
                disabled={isPending || applied.has(idx)}
                style={{
                  marginTop: 10, background: applied.has(idx) ? '#f0fdf4' : 'var(--text)', color: applied.has(idx) ? '#16a34a' : '#fff',
                  border: applied.has(idx) ? '1px solid #bbf7d0' : 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12.5,
                  cursor: applied.has(idx) ? 'default' : 'pointer',
                }}
              >
                {applied.has(idx) ? '✓ הוחל - הוספה כתזכורת פולו-אפ אוטומטית' : 'החל על כל הנציגים'}
              </button>
            )}
            {s.actionUnassignedStageKey && (
              <button
                onClick={() => handleApplyUnassigned(s, idx)}
                disabled={isPending || applied.has(idx)}
                style={{
                  marginTop: 10, background: applied.has(idx) ? '#f0fdf4' : 'var(--text)', color: applied.has(idx) ? '#16a34a' : '#fff',
                  border: applied.has(idx) ? '1px solid #bbf7d0' : 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12.5,
                  cursor: applied.has(idx) ? 'default' : 'pointer',
                }}
              >
                {applied.has(idx) ? '✓ הוחל - הוקצו אליי' : 'הקצה אליי את הלא-מוקצים'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
