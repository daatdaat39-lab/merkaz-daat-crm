'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getPipeline, getInquiryReasons } from '../../components/pipelines';
import { updateDepartmentStage, removeDepartmentMembership, addDepartmentMembership } from '../actions';
import StageStepper from './StageStepper';

// מציג "לשוניות" למחלקות שאיש הקשר משויך אליהן היום, מסוננות לפי אילו
// מחלקות הצופה עצמו חבר בהן (viewerWorkspaceIds) - מי שאין לו הרשאה
// למחלקה מסוימת פשוט לא רואה אותה. מתחת ללשוניות - שלב ה-pipeline
// (StageStepper) והיסטוריית הפניות רק של המחלקה הפעילה כרגע.
export default function DepartmentSwitcher({ contactId, departments, allWorkspaces, viewerWorkspaceIds, frozen }) {
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [newWorkspaceId, setNewWorkspaceId] = useState('');
  const [newReason, setNewReason] = useState('');
  const router = useRouter();

  const visibleDepartments = departments.filter((d) => viewerWorkspaceIds.includes(d.workspaceId));
  const [activeId, setActiveId] = useState(visibleDepartments[0]?.id || null);
  const active = visibleDepartments.find((d) => d.id === activeId) || visibleDepartments[0] || null;

  const availableToAdd = allWorkspaces.filter((w) => !departments.some((d) => d.workspaceId === w.id));
  const newWorkspace = availableToAdd.find((w) => w.id === newWorkspaceId);
  const newReasonOptions = getInquiryReasons(newWorkspace?.name);

  function handleRemove(dept) {
    if (!confirm(`להסיר את השיוך למחלקת "${dept.workspaceName}"? הכרטיס עצמו לא נמחק, רק השיוך למחלקה הזו.`)) return;
    startTransition(async () => {
      await removeDepartmentMembership(contactId, dept.workspaceId);
      router.refresh();
    });
  }

  function handleAdd() {
    if (!newWorkspaceId || !newReason) return;
    startTransition(async () => {
      await addDepartmentMembership(contactId, newWorkspaceId, newReason);
      setAdding(false);
      setNewWorkspaceId('');
      setNewReason('');
      router.refresh();
    });
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', marginBottom: 8 }}>
        מחלקות
      </div>

      {visibleDepartments.length === 0 ? (
        <div style={{ fontSize: 12.5, color: '#9b9b9b', marginBottom: 10 }}>
          איש הקשר אינו משויך לאחת מהמחלקות שלך.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {visibleDepartments.map((d) => (
              <button
                key={d.id}
                onClick={() => setActiveId(d.id)}
                style={{
                  border: '1px solid ' + (active?.id === d.id ? '#0a0a0a' : '#e5e5e5'),
                  background: active?.id === d.id ? '#0a0a0a' : '#fff',
                  color: active?.id === d.id ? '#fff' : '#333',
                  borderRadius: 999, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 500,
                }}
              >
                {d.workspaceName}
              </button>
            ))}
          </div>

          {active && (
            <div style={{ background: '#f9f9f9', border: '1px solid #e5e5e5', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{active.workspaceName}</div>
                <button
                  onClick={() => handleRemove(active)}
                  disabled={isPending || frozen}
                  style={{ background: 'none', border: 'none', color: '#b23b2f', fontSize: 11.5, cursor: frozen ? 'default' : 'pointer', whiteSpace: 'nowrap', opacity: frozen ? 0.4 : 1 }}
                >
                  🗑 הסרה
                </button>
              </div>

              <StageStepper
                currentStage={active.stage}
                currentClosedReason={active.closedReason}
                stages={getPipeline(active.workspaceName).order}
                disabled={frozen}
                action={(formData) => {
                  const boundUpdate = updateDepartmentStage.bind(null, active.id);
                  startTransition(async () => {
                    await boundUpdate(formData.get('stage'), formData.get('closed_reason'));
                    router.refresh();
                  });
                }}
              />

              {active.inquiries.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid #e5e5e5' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#9b9b9b', marginBottom: 5 }}>
                    היסטוריית פניות ({active.inquiries.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 140, overflowY: 'auto' }}>
                    {active.inquiries.map((inq, i) => (
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
          )}
        </>
      )}

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
            disabled={frozen}
            style={{ marginTop: 10, background: 'none', border: '1px dashed #c0c0c0', borderRadius: 6, padding: '7px 10px', fontSize: 12.5, cursor: frozen ? 'default' : 'pointer', width: '100%', color: '#6b6b6b', opacity: frozen ? 0.5 : 1 }}
          >
            + שיוך למחלקה נוספת
          </button>
        )
      )}
    </div>
  );
}
