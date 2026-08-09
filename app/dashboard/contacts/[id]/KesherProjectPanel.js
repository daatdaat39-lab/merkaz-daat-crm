'use client';

// תצוגה קריאה-בלבד של התחייבויות מחלקה, בהשראת מסך "התחייבויות" של
// מערכת קשר (ר' צילום מסך מהמשתמש) - בכוונה בלי שום כפתור פעולה
// (הוספה/עריכה/ביטול/רישום תשלום). מחליף את "התחייבויות" הידני
// (CommitmentsCard.js, הוסר) - הנתונים כאן מגיעים מסנכרון קשר
// (kesherSyncActions.js) או מהזנה ידנית ישירות ב-DB, לא מהמסך הזה.
// TODO (בעתיד, לא כרגע): "ביצוע פעולות" יהיה קישור ישיר לדף המאובטח
// של מערכת קשר עצמה - לא נבנה כאן.
function statusPill(status) {
  if (status === 'active') return { label: 'פעיל', bg: '#e8f5e9', fg: '#2e7d32' };
  if (status === 'cancelled') return { label: 'בוטלה', bg: '#fdecea', fg: '#c62828' };
  return { label: 'מומשה', bg: 'var(--bg-secondary, #f0f0f0)', fg: 'var(--text-secondary)' };
}

function maskedPaymentMethod(extraValues) {
  const last4 = (extraValues?.card_last4 || '').toString().trim();
  if (last4) return `**** ${last4}`;
  const bank = (extraValues?.bank_account_ref || '').toString().trim();
  return bank || null;
}

export default function KesherProjectPanel({ workspaceName, commitments = [], extraValues = {} }) {
  if (commitments.length === 0) return null;

  const total = commitments
    .filter((c) => c.status === 'active')
    .reduce((sum, c) => sum + (Number(c.total_amount) || 0), 0);
  const paymentMethod = maskedPaymentMethod(extraValues);

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #9b9b9b)', textTransform: 'uppercase' }}>
          פרויקט: {workspaceName}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700 }}>סך הכל: ₪{total.toLocaleString('he-IL')}</span>
      </div>

      {commitments.map((c) => {
        const pill = statusPill(c.status);
        return (
          <div key={c.id} style={{ border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '8px 10px', marginBottom: 8, fontSize: 12.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ color: 'var(--text-secondary)' }}>
                תאריך רישום: {new Date(c.created_at).toLocaleDateString('he-IL')}
              </span>
              <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: pill.bg, color: pill.fg }}>
                {pill.label}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', color: 'var(--text-secondary)' }}>
              <span>סכום: <b style={{ color: 'var(--text)' }}>₪{Number(c.total_amount).toLocaleString('he-IL')}</b></span>
              {c.designation && <span>ייעוד: {c.designation}</span>}
              {(c.payment_method || paymentMethod) && <span>אמצעי תשלום: {c.payment_method || paymentMethod}</span>}
              {c.frequency && <span>תדירות: {c.frequency}</span>}
              {c.start_date && <span>התחלה: {new Date(c.start_date).toLocaleDateString('he-IL')}</span>}
              {c.end_date && <span>סיום: {new Date(c.end_date).toLocaleDateString('he-IL')}</span>}
              {c.external_reference && <span>אסמכתא: {c.external_reference}</span>}
              {c.bounced_count > 0 && <span style={{ color: '#c62828' }}>חזרות: {c.bounced_count}</span>}
              {c.last_payment_status && <span>תשלום אחרון: {c.last_payment_status}</span>}
              {c.source_channel && <span>ערוץ מקור: {c.source_channel}</span>}
            </div>
            {c.note && <div style={{ marginTop: 4, color: 'var(--text-secondary)' }}>{c.note}</div>}
          </div>
        );
      })}
    </div>
  );
}
