'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { StageBadge } from '../../components/ui';
import { getPipeline, getInquiryReasons } from '../../components/pipelines';
import { updateDepartmentStage, removeDepartmentMembership, addDepartmentMembership } from '../actions';
import StageSelector from './StageSelector';

// מציג את כל המחלקות שאיש הקשר פעיל בהן במקביל, כל אחת עם ה-pipeline
// והשלב שלה בנפרד - אדם יכול להיות "תלמיד פעיל" במחלקה אחת ו"תורם פעיל"
// באחרת, בו-זמנית.
export default function DepartmentCards({ contactId, departments, allWorkspaces }) {
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [newWorkspaceId, setNewWorkspaceId] = useState('');
  const [newReason, setNewReason] = useState('');
  const router = useRouter();

  const availableToAdd = allWorkspaces.filter((w) => !departments.some((d) => d.workspaceId === w.id));
  const newWorkspace = availableToAdd.find((w) => w.id === newWorkspaceId);
  const newReasonOptions = getInquiryReasons(newWorkspace?.name);

  function handleRemove(rowId, workspaceName) {
    if (!confirm(`להסיר את השיוך למחלקת "${workspaceName}"? הכרטיס עצמו לא נמחק, רק השיוך למחלקה הזו.`)) return;
    startTransition(() => removeDepartmentMembership(contactId, departments.find((d) => d.id === rowId).workspaceId));
  }

  function handleAdd() {
    if (!newWorkspaceId || !newReason) return;
    startTransition(async () => {
      await addDepartmentMembership(contactId, newWorkspaceId, newReason);
      setAdding(false);
      setNewWorkspaceId('');
      setNewReason('');
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

              {d.inquiries.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #e5e5e5' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#9b9b9b', marginBottom: 5 }}>
                    היסטוריית פניות ({d.inquiries.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 140, overflowY: 'auto' }}>
                    {d.inquiries.map((inq, i) => (
                      <div key={i} style={{ fontSize: 11.5 }}>
                        <span style={{ color: '#333' }}>{inq.reason}</span>
                        {inq.note && <span style={{ color: '#9b9b9b' }}> — {inq.note}</span>}
                        <span style={{ color: '#c0c0c0' }}> · {new Date(inq.created_at).toLocaleDateString('he-IL')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {departments.length === 0 && (
          <div style={{ fontSize: 12.5, color: '#9b9b9b' }}>איש הקשר אינו משויך לאף מחלקה כרגע.</div>
        )}
      </div>

      {availableToAdd.length > 0 && (
        adding ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
            <select
              value={newWorkspaceId}
              onChange={(e) => { setNewWorkspaceId(e.target.value); setNewReason(''); }}
              style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '6px 8px', fontSize: 12.5 }}
            >
              <option value="">בחר מחלקה...</option>
              {availableToAdd.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            {newWorkspaceId && (
              <select
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '6px 8px', fontSize: 12.5 }}
              >
                <option value="" disabled>מהות הפנייה...</option>
                {newReasonOptions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={handleAdd} disabled={isPending || !newWorkspaceId || !newReason} style={{ flex: 1, background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
                הוספה
              </button>
              <button onClick={() => { setAdding(false); setNewWorkspaceId(''); setNewReason(''); }} style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
                ביטול
              </button>
            </div>
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
