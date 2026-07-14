'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Tag, initials } from '../../components/ui';
import { getPipeline, getInquiryReasons } from '../../components/pipelines';
import { updateDepartmentStage, removeDepartmentMembership, addDepartmentMembership } from '../actions';
import StageStepper from './StageStepper';
import ContactEditForm from './ContactEditForm';
import ContactSettingsMenu from './ContactSettingsMenu';
import ContactTabs from './ContactTabs';
import NotConnectedButton from '../../components/NotConnectedButton';

const inputStyle = { border: '1px solid #e5e5e5', borderRadius: 6, padding: '6px 8px', fontSize: 12.5 };

// מרכיב את כל הכרטיס בצד הלקוח, כי "איזו מחלקה פעילה כרגע" צריך
// להישלט משותף בין הלשוניות שמתחת לשם, שורת השלבים, וטאב "פעילות"
// (היסטוריית הפניות שם תלויה במחלקה הפעילה) - state אחד משותף למעלה.
export default function ContactDetailClient({
  contact, departments, allWorkspaces, viewerWorkspaceIds, meetings, tasks, existingTags,
  age, hebrewDate, isModal, toggleTaskAction, updateNotesAction,
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newWorkspaceId, setNewWorkspaceId] = useState('');
  const [newReason, setNewReason] = useState('');

  const visibleDepartments = departments.filter((d) => viewerWorkspaceIds.includes(d.workspaceId));
  const [activeId, setActiveId] = useState(visibleDepartments[0]?.id || null);
  const active = visibleDepartments.find((d) => d.id === activeId) || visibleDepartments[0] || null;

  const availableToAdd = allWorkspaces.filter((w) => !departments.some((d) => d.workspaceId === w.id));
  const newWorkspace = availableToAdd.find((w) => w.id === newWorkspaceId);
  const newReasonOptions = getInquiryReasons(newWorkspace?.name);

  function handleRemove() {
    if (!active) return;
    if (!confirm(`להסיר את השיוך למחלקת "${active.workspaceName}"? הכרטיס עצמו לא נמחק, רק השיוך למחלקה הזו.`)) return;
    startTransition(async () => {
      await removeDepartmentMembership(contact.id, active.workspaceId);
      router.refresh();
    });
  }

  function handleAdd() {
    if (!newWorkspaceId || !newReason) return;
    startTransition(async () => {
      await addDepartmentMembership(contact.id, newWorkspaceId, newReason);
      setAdding(false);
      setNewWorkspaceId('');
      setNewReason('');
      router.refresh();
    });
  }

  function handleStageChange(formData) {
    if (!active) return;
    startTransition(async () => {
      await updateDepartmentStage(active.id, formData.get('stage'), formData.get('closed_reason'));
      router.refresh();
    });
  }

  const outerStyle = isModal
    ? { padding: '24px' }
    : { maxWidth: 1000, margin: '0 auto', padding: '28px 24px' };

  return (
    <div style={outerStyle}>
      {!isModal && (
        <a href="/dashboard/contacts" style={{ fontSize: 12.5, color: '#6b6b6b', textDecoration: 'none' }}>
          ← חזרה לרשימת אנשי הקשר
        </a>
      )}

      {contact.frozen && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, margin: isModal ? '0 0 16px' : '16px 0 0' }}>
          ❄ איש הקשר מוקפא — לא ניתן לערוך, לשנות שלב, או להוסיף משימות עד הפשרה.
        </div>
      )}

      {/* כותרת: אווטאר + שם + לשוניות מחלקה (לחיצה מחליפה מחלקה פעילה) */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, margin: '16px 0 10px' }}>
        <div style={{
          width: 44, height: 44, background: '#0a0a0a', color: '#fff', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, flexShrink: 0,
        }}>
          {initials(contact.first, contact.last)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{contact.first} {contact.last}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {visibleDepartments.map((d) => (
              <button
                key={d.id}
                onClick={() => setActiveId(d.id)}
                style={{
                  border: '1px solid ' + (active?.id === d.id ? '#0a0a0a' : '#e5e5e5'),
                  background: active?.id === d.id ? '#0a0a0a' : '#fff',
                  color: active?.id === d.id ? '#fff' : '#333',
                  borderRadius: 999, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 500,
                }}
              >
                {d.workspaceName}
              </button>
            ))}
            {visibleDepartments.length === 0 && <span style={{ fontSize: 12.5, color: '#9b9b9b' }}>לא משויך למחלקה שלך</span>}
            {availableToAdd.length > 0 && (
              <button
                onClick={() => setAdding((v) => !v)}
                disabled={contact.frozen}
                style={{
                  border: '1px dashed #c0c0c0', background: 'none', borderRadius: 999, padding: '4px 12px',
                  fontSize: 12, cursor: contact.frozen ? 'default' : 'pointer', color: '#6b6b6b', opacity: contact.frozen ? 0.5 : 1,
                }}
              >
                + מחלקה
              </button>
            )}
          </div>
        </div>
        <ContactSettingsMenu contact={contact} />
      </div>

      {adding && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 12, background: '#f9f9f9', border: '1px solid #e5e5e5', borderRadius: 8, padding: 10 }}>
          <select value={newWorkspaceId} onChange={(e) => { setNewWorkspaceId(e.target.value); setNewReason(''); }} style={inputStyle}>
            <option value="">בחר מחלקה...</option>
            {availableToAdd.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          {newWorkspaceId && (
            <select value={newReason} onChange={(e) => setNewReason(e.target.value)} style={inputStyle}>
              <option value="" disabled>מהות הפנייה...</option>
              {newReasonOptions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
          <button onClick={handleAdd} disabled={isPending || !newWorkspaceId || !newReason} style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
            הוספה
          </button>
          <button onClick={() => { setAdding(false); setNewWorkspaceId(''); setNewReason(''); }} style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
            ביטול
          </button>
        </div>
      )}

      {/* שורת שלבי המחלקה הפעילה - מעל כפתורי הפעולה המהירה */}
      {active && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16, background: '#f9f9f9', border: '1px solid #e5e5e5', borderRadius: 8, padding: '12px 14px', flexWrap: 'wrap' }}>
          <StageStepper
            currentStage={active.stage}
            currentClosedReason={active.closedReason}
            stages={getPipeline(active.workspaceName).order}
            disabled={contact.frozen}
            action={handleStageChange}
          />
          <button
            onClick={handleRemove}
            disabled={isPending || contact.frozen}
            style={{ background: 'none', border: 'none', color: '#b23b2f', fontSize: 11.5, cursor: contact.frozen ? 'default' : 'pointer', whiteSpace: 'nowrap', opacity: contact.frozen ? 0.4 : 1 }}
          >
            🗑 הסרה ממחלקה זו
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <NotConnectedButton label="חיוג" icon="📞" message="חיוג מתוך המערכת (ימות המשיח) — עדיין לא מחובר" />
        <NotConnectedButton label="וואטסאפ" icon="💬" message="שליחת וואטסאפ — עדיין לא מחובר" />
        <NotConnectedButton label="מייל" icon="✉️" message="שליחת מייל — עדיין לא מחובר" />
        <NotConnectedButton label="קביעת פגישה ביומן" icon="📅" message="חיבור ל-Google Calendar — עדיין לא מחובר" />
        <NotConnectedButton label="סיכום AI" icon="✨" message="סיכום שיחות ב-AI — עדיין לא מחובר" />
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: isModal ? 'wrap' : 'nowrap' }}>
        {/* עמודה שמאלית - פרטים אישיים */}
        <div style={{ width: 240, flexShrink: 0 }}>
          <div style={{ background: '#f9f9f9', border: '1px solid #e5e5e5', borderRadius: 8, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase' }}>
                פרטים אישיים
              </div>
              <button
                onClick={() => setEditOpen((v) => !v)}
                disabled={contact.frozen}
                title="עריכת פרטים"
                style={{
                  background: '#fff', border: '1px solid #e5e5e5', borderRadius: 6, width: 26, height: 26,
                  cursor: contact.frozen ? 'default' : 'pointer', fontSize: 12.5, opacity: contact.frozen ? 0.5 : 1,
                }}
              >
                ✎
              </button>
            </div>
            <InfoRow label="טלפון" value={contact.phone} />
            <InfoRow label="טלפון נוסף" value={contact.phone2} />
            <InfoRow label="מייל" value={contact.email} />
            <InfoRow label="מקור" value={contact.source} />
            <InfoRow label="ת.ז / מזהה" value={contact.idnum} />
            <InfoRow label="תאריך לידה" value={contact.birth_date ? new Date(contact.birth_date).toLocaleDateString('he-IL') : null} />
            <InfoRow label="גיל" value={age} />
            <InfoRow label="תאריך עברי" value={hebrewDate} />
            <InfoRow label="מגדר" value={contact.gender} />
            <InfoRow label="נוצר בתאריך" value={new Date(contact.created_at).toLocaleDateString('he-IL')} />
            <div style={{ marginTop: 12 }}>
              {(contact.tags || []).map((t) => <Tag key={t}>{t}</Tag>)}
            </div>

            {editOpen && !contact.frozen && (
              <ContactEditForm contact={contact} existingTags={existingTags} onSaved={() => { setEditOpen(false); router.refresh(); }} />
            )}
          </div>
        </div>

        {/* עמודה ראשית - טאבים */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <ContactTabs
            meetings={meetings || []}
            tasks={tasks || []}
            notes={contact.notes}
            contactId={contact.id}
            toggleTaskAction={toggleTaskAction}
            updateNotesAction={updateNotesAction}
            frozen={contact.frozen}
            inquiries={active?.inquiries || []}
            activeDepartmentName={active?.workspaceName}
          />
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10.5, color: '#9b9b9b' }}>{label}</div>
      <div style={{ fontSize: 13 }}>{value || '—'}</div>
    </div>
  );
}
