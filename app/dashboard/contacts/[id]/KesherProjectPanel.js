'use client';

// תצוגה קריאה-בלבד של התחייבויות + תרומות חד"פ של מחלקה, בהשראת מסך
// "התחייבויות" של מערכת קשר (ר' צילום מסך מהמשתמש) - בכוונה בלי שום
// כפתור פעולה (הוספה/עריכה/ביטול/רישום תשלום). מחליף את "התחייבויות"
// הידני (CommitmentsCard.js, הוסר) - הנתונים כאן מגיעים מסנכרון קשר
// (kesherSyncActions.js), מאשף הייבוא, או מהזנה ידנית ישירות ב-DB.
// כל כרטיס (הוראת קבע/תרומה חד"פ) מסומן בבירור באיזה סוג תשלום מדובר -
// חד"פ הן donation_transactions בלי commitment_id מקושר.
// TODO (בעתיד, לא כרגע): "ביצוע פעולות" יהיה קישור ישיר לדף המאובטח
// של מערכת קשר עצמה - לא נבנה כאן.
function statusPill(status) {
  if (status === 'active') return { label: 'הוראת קבע · פעילה', bg: '#e8f5e9', fg: '#2e7d32' };
  if (status === 'cancelled') return { label: 'הוראת קבע · בוטלה', bg: '#fdecea', fg: '#c62828' };
  return { label: 'הוראת קבע · מומשה', bg: 'var(--bg-secondary, #f0f0f0)', fg: 'var(--text-secondary)' };
}

function oneTimePill(workspaceName) {
  const label = workspaceName === 'תרומות' ? 'תרומה חד"פ' : 'תשלום חד"פ';
  return { label, bg: '#eef2ff', fg: '#3730a3' };
}

function maskedPaymentMethod(extraValues) {
  const last4 = (extraValues?.card_last4 || '').toString().trim();
  if (last4) return `**** ${last4}`;
  const bank = (extraValues?.bank_account_ref || '').toString().trim();
  return bank || null;
}

export default function KesherProjectPanel({ workspaceName, commitments = [], oneTimeTransactions = [], extraValues = {} }) {
  if (commitments.length === 0 && oneTimeTransactions.length === 0) return null;

  const total = commitments
    .filter((c) => c.status === 'active')
    .reduce((sum, c) => sum + (Number(c.total_amount) || 0), 0);
  const paymentMethod = maskedPaymentMethod(extraValues);
  const ONE_TIME_PILL = oneTimePill(workspaceName);

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #9b9b9b)', textTransform: 'uppercase' }}>
          פרויקט: {workspaceName}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700 }}>סך הכל (הוראות קבע פעילות): ₪{total.toLocaleString('he-IL')}</span>
      </div>

      {commitments.map((c) => {
        const pill = statusPill(c.status);
        return (
          <div key={`c-${c.id}`} style={{ border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '8px 10px', marginBottom: 8, fontSize: 12.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ color: 'var(--text-secondary)' }}>
                תאריך רישום: {new Date(c.created_at).toLocaleDateString('he-IL')}
              </span>
              <span style={{ display: 'flex', gap: 6 }}>
                {c.source_system && (
                  <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: 'var(--bg-secondary, #f0f0f0)', color: 'var(--text-secondary)' }}>
                    {c.source_system}
                  </span>
                )}
                <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: pill.bg, color: pill.fg }}>
                  {pill.label}
                </span>
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

      {oneTimeTransactions.map((t) => (
        <div key={`t-${t.id}`} style={{ border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '8px 10px', marginBottom: 8, fontSize: 12.5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              תאריך: {t.transaction_date ? new Date(t.transaction_date).toLocaleDateString('he-IL') : '—'}
            </span>
            <span style={{ display: 'flex', gap: 6 }}>
              {t.source_system && (
                <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: 'var(--bg-secondary, #f0f0f0)', color: 'var(--text-secondary)' }}>
                  {t.source_system}
                </span>
              )}
              <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: ONE_TIME_PILL.bg, color: ONE_TIME_PILL.fg }}>
                {ONE_TIME_PILL.label}
              </span>
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', color: 'var(--text-secondary)' }}>
            <span>סכום: <b style={{ color: 'var(--text)' }}>₪{Number(t.amount).toLocaleString('he-IL')}</b></span>
            {t.designation && <span>ייעוד: {t.designation}</span>}
            {(t.payment_method || paymentMethod) && <span>אמצעי תשלום: {t.payment_method || paymentMethod}</span>}
            {t.external_doc_number && <span>אסמכתא: {t.external_doc_number}</span>}
            {t.fundraiser_name && <span>סוכן: {t.fundraiser_name}</span>}
            {t.receipt_url && (
              <a href={t.receipt_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent, #1f4d3d)' }}>📄 קבלה</a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
