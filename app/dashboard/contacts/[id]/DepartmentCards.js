'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { StageBadge } from '../../components/ui';
import { getPipeline } from '../../components/pipelines';
import { updateDepartmentStage, removeDepartmentMembership, addDepartmentMembership } from '../actions';
import StageSelector from './StageSelector';

// מציג את כל המחלקות שאיש הקשר פעיל בהן במקביל, כל אחת עם ה-pipeline
// והשלב שלה בנפרד - אדם יכול להיות "תלמיד פעיל" במחלקה אחת ו"תורם פעיל"
// באחרת, בו-זמנית.
export default function DepartmentCards({ contactId, departments, allWorkspaces }) {
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [newWorkspaceId, setNewWorkspaceId] = useState('');
  const router = useRouter();

  const availableToAdd = allWorkspaces.filter((w) => !departments.some((d) => d.workspaceId === w.id));

  function handleRemove(rowId, workspaceName) {
    if (!confirm(`להסיר את השיוך למחלקת "${workspaceName}"? הכרטיס עצמו לא נמחק, רק השיוך למחלקה הזו.`)) return;
    startTransition(() => removeDepartmentMembership(contactId, departments.find((d) => d.id === rowId).workspaceId));
  }

  function handleAdd() {
    if (!newWorkspaceId) return;
    startTransition(async () => {
      await addDepartmentMembership(contactId, newWorkspaceId);
      setAdding(false);
      setNewWorkspaceId('');
    });
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', marginBottom: 8 }}>
        מחלקות פעילות ({departments.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {departments.map((d) => {
          const pipeline = getPipeline(d.workspaceName);
          const boundUpdate = updateDepartmentStage.bind(null, d.id);
          function handleStageAction(formData) {
            startTransition(() => boundUpdate(formData.get('stage'), formData.get('closed_reason')));
          }
          return (
            <div key={d.id} style={{ background: '#f9f9f9', border: '1px solid #e5e5e5', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{d.workspaceName}</div>
                  <div style={{ marginTop: 4 }}><StageBadge stage={d.stage} /></div>
                  {d.stage === 'closed' && d.closedReason && (
                    <div style={{ fontSize: 11, color: '#9b9b9b', marginTop: 4 }}>סיבת סגירה: {d.closedReason}</div>
                  )}
                </div>
                <button
                  onClick={() => handleRemove(d.id, d.workspaceName)}
                  disabled={isPending}
                  style={{ background: 'none', border: 'none', color: '#b23b2f', fontSize: 11.5, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  🗑 הסרה
                </button>
              </div>
              <StageSelector currentStage={d.stage} currentClosedReason={d.closedReason} stages={pipeline.order} action={handleStageAction} />
            </div>
          );
        })}
        {departments.length === 0 && (
          <div style={{ fontSize: 12.5, color: '#9b9b9b' }}>איש הקשר אינו משויך לאף מחלקה כרגע.</div>
        )}
      </div>

      {availableToAdd.length > 0 && (
        adding ? (
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <select
              value={newWorkspaceId}
              onChange={(e) => setNewWorkspaceId(e.target.value)}
              style={{ flex: 1, border: '1px solid #e5e5e5', borderRadius: 6, padding: '6px 8px', fontSize: 12.5 }}
            >
              <option value="">בחר מחלקה...</option>
              {availableToAdd.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <button onClick={handleAdd} disabled={isPending || !newWorkspaceId} style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
              הוספה
            </button>
            <button onClick={() => setAdding(false)} style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
              ביטול
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            style={{ marginTop: 10, background: 'none', border: '1px dashed #c0c0c0', borderRadius: 6, padding: '7px 10px', fontSize: 12.5, cursor: 'pointer', width: '100%', color: '#6b6b6b' }}
          >
            + שיוך למחלקה נוספת
          </button>
        )
      )}
    </div>
  );
}
