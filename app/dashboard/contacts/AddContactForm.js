'use client';

import { useState, useTransition } from 'react';
import { createContact, checkPossibleDuplicates, mergeResolvedLead } from './actions';
import TagPicker from './TagPicker';
import MergeFieldsPicker from './MergeFieldsPicker';

const inputStyle = { width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 13 };
const labelStyle = { fontSize: 10.5, color: 'var(--text-secondary)', marginBottom: 3, display: 'block' };
const FORM_FIELDS = ['first', 'last', 'idnum', 'phone', 'phone2', 'email', 'source', 'dept'];

export default function AddContactForm({
  label = '+ איש קשר חדש', modalTitle = 'איש קשר חדש',
  workspaces = [], defaultWorkspaceId = '', existingTags = [],
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const [duplicates, setDuplicates] = useState(null); // null = not checked yet
  const [pendingData, setPendingData] = useState(null); // FormData from the create form
  const [mergeCandidate, setMergeCandidate] = useState(null); // duplicate chosen to compare fields with

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const matches = await checkPossibleDuplicates({
        first: formData.get('first'), last: formData.get('last'),
        phone: formData.get('phone'), email: formData.get('email'), idnum: formData.get('idnum'),
      });
      if (matches.length > 0) {
        setDuplicates(matches);
        setPendingData(formData);
      } else {
        const res = await createContact(formData);
        if (res?.error) setError(res.error);
      }
    });
  }

  function handleNotDuplicate() {
    pendingData.set('force_new', 'true');
    startTransition(async () => {
      const res = await createContact(pendingData);
      if (res?.error) setError(res.error);
    });
  }

  function handleMergeConfirm(resolvedFields) {
    startTransition(async () => {
      const res = await mergeResolvedLead(mergeCandidate.id, resolvedFields, pendingData.get('workspace_id'));
      if (res?.error) setError(res.error);
    });
  }

  function closeModal() {
    setOpen(false);
    setDuplicates(null);
    setPendingData(null);
    setMergeCandidate(null);
    setError(null);
  }

  const newValues = pendingData
    ? Object.fromEntries(FORM_FIELDS.map((k) => [k, pendingData.get(k) || '']))
    : {};
  if (pendingData) newValues.tags = (pendingData.get('tags') || '').split(',').map((t) => t.trim()).filter(Boolean);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px',
          borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer',
          background: 'var(--text)', color: '#fff', border: '1px solid var(--text)',
        }}
      >
        {label}
      </button>

      {open && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={closeModal}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 10, padding: 22, width: 480, maxWidth: '100%' }}
          >
            {mergeCandidate ? (
              <>
                <MergeFieldsPicker
                  existing={mergeCandidate}
                  newValues={newValues}
                  onConfirm={handleMergeConfirm}
                  onCancel={() => setMergeCandidate(null)}
                />
                {error && <div style={{ color: 'var(--red, #b23b2f)', fontSize: 12, marginTop: 10 }}>שגיאה: {error}</div>}
              </>
            ) : duplicates && duplicates.length > 0 ? (
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>⚠ נמצאו אנשי קשר עם פרטים דומים</div>
                <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
                  יש כבר במערכת אנשי קשר שדומים למה שהקלדת. תבדוק אם זה אותו אדם:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                  {duplicates.map((d) => (
                    <div key={d.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{d.first} {d.last}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: '2px 0 8px' }}>
                        {d.phone || d.email || 'ללא פרטי קשר'} · {d.workspaceName} · {d.stageLabel}
                      </div>
                      <button
                        onClick={() => setMergeCandidate(d)}
                        disabled={isPending}
                        style={{ background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer' }}
                      >
                        כן, זה אותו אדם — בחירת פרטים למיזוג
                      </button>
                    </div>
                  ))}
                </div>
                {error && <div style={{ color: 'var(--red, #b23b2f)', fontSize: 12, marginBottom: 10 }}>שגיאה: {error}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleNotDuplicate}
                    disabled={isPending}
                    style={{ flex: 1, background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}
                  >
                    לא, זה איש קשר אחר — יצירת חדש
                  </button>
                  <button onClick={closeModal} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>
                    ביטול
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>{modalTitle}</div>
                <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {workspaces.length > 0 && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span style={labelStyle}>מחלקה</span>
                      <select name="workspace_id" defaultValue={defaultWorkspaceId} style={inputStyle}>
                        {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div><span style={labelStyle}>שם פרטי *</span><input name="first" required style={inputStyle} /></div>
                  <div><span style={labelStyle}>שם משפחה</span><input name="last" style={inputStyle} /></div>
                  <div><span style={labelStyle}>ת"ז</span><input name="idnum" style={inputStyle} /></div>
                  <div><span style={labelStyle}>טלפון</span><input name="phone" style={inputStyle} /></div>
                  <div><span style={labelStyle}>טלפון נוסף</span><input name="phone2" style={inputStyle} /></div>
                  <div><span style={labelStyle}>מייל</span><input name="email" type="email" style={inputStyle} /></div>
                  <div><span style={labelStyle}>מקור</span><input name="source" style={inputStyle} /></div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={labelStyle}>תגיות</span>
                    <TagPicker existingTags={existingTags} />
                  </div>
                  <div style={{ gridColumn: '1 / -1', fontSize: 11.5, color: 'var(--text-secondary)' }}>
                    לפני היצירה נבדוק אם כבר קיים איש קשר דומה, ונשאל אותך אם זה אותו אדם.
                  </div>
                  {error && <div style={{ gridColumn: '1 / -1', color: 'var(--red, #b23b2f)', fontSize: 12 }}>שגיאה: {error}</div>}
                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, marginTop: 4 }}>
                    <button type="submit" disabled={isPending} style={{
                      background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 6,
                      padding: '8px 18px', fontSize: 13, cursor: 'pointer',
                    }}>
                      {isPending ? 'בודק...' : 'המשך'}
                    </button>
                    <button type="button" onClick={closeModal} style={{
                      background: '#fff', border: '1px solid var(--border)', borderRadius: 6,
                      padding: '8px 18px', fontSize: 13, cursor: 'pointer',
                    }}>
                      ביטול
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
