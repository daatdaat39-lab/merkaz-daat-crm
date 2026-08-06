'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createCommitment, recordCommitmentPayment, cancelCommitment } from '../commitmentsActions';

// כרטיס "התחייבויות" - גנרי לכל מחלקה, לא רק תרומות (בשונה מהקוביה
// הגנרית GenericStatsTile שהיא read-only בכוונה, כאן יש פעולות כתיבה
// אינטראקטיביות - ולכן רכיב אחות נפרד, באותו דפוס כמו CalendarDedicationsCard).
// "שולם/נותר" מחושב כאן בצד לקוח מתוך payments שכבר הגיעו מהשרת - בלי
// שאילתה נוספת, בדיוק כמו שהקוביה הגנרית מחשבת סכומי תנועות.
export default function CommitmentsCard({ contactId, department, commitments = [], frozen, isManager }) {
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  const deptCommitments = commitments.filter((c) => c.workspace_id === department.workspaceId);
  if (deptCommitments.length === 0 && !isManager) return null;

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: deptCommitments.length ? 10 : 0 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #9b9b9b)', textTransform: 'uppercase' }}>💳 התחייבויות</span>
        {isManager && !frozen && (
          <button type="button" onClick={() => setAdding((v) => !v)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11 }}>
            {adding ? 'ביטול' : '+ הוספת התחייבות'}
          </button>
        )}
      </div>

      {adding && (
        <AddCommitmentForm
          contactId={contactId}
          workspaceId={department.workspaceId}
          onDone={() => { setAdding(false); router.refresh(); }}
          onCancel={() => setAdding(false)}
        />
      )}

      {deptCommitments.map((c) => (
        <CommitmentRow key={c.id} commitment={c} isManager={isManager} frozen={frozen} onChanged={() => router.refresh()} />
      ))}
    </div>
  );
}

function AddCommitmentForm({ contactId, workspaceId, onDone, onCancel }) {
  const [totalAmount, setTotalAmount] = useState('');
  const [installmentsCount, setInstallmentsCount] = useState('1');
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await createCommitment(contactId, workspaceId, { totalAmount, installmentsCount, note });
      if (res?.error) { setError(res.error); return; }
      onDone();
    });
  }

  return (
    <div style={{ background: 'var(--bg-secondary, #f9f9f9)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <input type="number" min="1" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} placeholder="סכום כולל (₪)" autoFocus
          style={{ flex: '1 1 140px', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', fontSize: 12.5 }} />
        <input type="number" min="1" value={installmentsCount} onChange={(e) => setInstallmentsCount(e.target.value)} placeholder="מספר תשלומים"
          style={{ width: 110, border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', fontSize: 12.5 }} />
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="הערה (אופציונלי)"
        style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', fontSize: 12.5, boxSizing: 'border-box', marginBottom: 8 }} />
      {error && <div style={{ color: '#b23b2f', fontSize: 11.5, marginBottom: 8 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={handleSave} disabled={isPending || !totalAmount} style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
          {isPending ? 'שומר...' : 'שמירה'}
        </button>
        <button type="button" onClick={onCancel} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
          ביטול
        </button>
      </div>
    </div>
  );
}

function CommitmentRow({ commitment, isManager, frozen, onChanged }) {
  const [paying, setPaying] = useState(false);
  const paidTotal = (commitment.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const remaining = Math.max(0, Number(commitment.total_amount) - paidTotal);

  const statusLabel = commitment.status === 'fulfilled' ? '✓ מומשה' : commitment.status === 'cancelled' ? 'בוטלה' : 'פעילה';
  const statusColor = commitment.status === 'fulfilled' ? 'var(--green)' : commitment.status === 'cancelled' ? 'var(--text-muted)' : 'var(--blue)';

  return (
    <div style={{ border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '8px 10px', marginBottom: 8, fontSize: 12.5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <span>
          ₪{Number(commitment.total_amount).toLocaleString('he-IL')} ב-{commitment.installments_count} תשלומים
          {' · '}
          <b style={{ color: 'var(--green)' }}>שולם ₪{paidTotal.toLocaleString('he-IL')}</b>
          {commitment.status === 'active' && <> · <span style={{ color: '#b45309' }}>נותר ₪{remaining.toLocaleString('he-IL')}</span></>}
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: statusColor }}>{statusLabel}</span>
      </div>
      {commitment.note && <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>{commitment.note}</div>}
      {commitment.payments?.length > 0 && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {commitment.payments.map((p) => (
            <div key={p.id} style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              ₪{Number(p.amount).toLocaleString('he-IL')} · {new Date(p.transaction_date).toLocaleDateString('he-IL')}
            </div>
          ))}
        </div>
      )}

      {isManager && !frozen && commitment.status === 'active' && (
        <div style={{ marginTop: 8 }}>
          {paying ? (
            <RecordPaymentForm commitmentId={commitment.id} onDone={() => { setPaying(false); onChanged(); }} onCancel={() => setPaying(false)} />
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setPaying(true)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11.5 }}>
                💰 רישום תשלום
              </button>
              <button
                type="button"
                onClick={() => { if (confirm('לבטל את ההתחייבות? היסטוריית התשלומים תישאר.')) cancelCommitment(commitment.id).then(onChanged); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11.5 }}
              >
                ביטול התחייבות
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RecordPaymentForm({ commitmentId, onDone, onCancel }) {
  const [amount, setAmount] = useState('');
  const [transactionDate, setTransactionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await recordCommitmentPayment(commitmentId, { amount, transactionDate });
      if (res?.error) { setError(res.error); return; }
      onDone();
    });
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="סכום (₪)" autoFocus
        style={{ width: 110, border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 12 }} />
      <input type="date" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)}
        style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 12 }} />
      <button type="button" onClick={handleSave} disabled={isPending || !amount} style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11.5, cursor: 'pointer' }}>
        {isPending ? 'שומר...' : 'שמירה'}
      </button>
      <button type="button" onClick={onCancel} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 12px', fontSize: 11.5, cursor: 'pointer' }}>
        ביטול
      </button>
      {error && <div style={{ color: '#b23b2f', fontSize: 11, width: '100%' }}>{error}</div>}
    </div>
  );
}
