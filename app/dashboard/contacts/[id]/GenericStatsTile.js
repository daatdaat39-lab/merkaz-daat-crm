'use client';

// קוביית נתוני מחלקה גנרית - מוצגת לכל מחלקה (במקום שתי הקוביות
// הייעודיות הקודמות DonorStatsTile/StudentStatsTile שהיו מוגבלות
// לתרומות/דעת ותבונה בלבד). מבוססת כולה על השדות הדינמיים של המחלקה
// (workspace_extra_fields) ועל היסטוריית תנועות אם קיימת - בלי שום
// לוגיקה קשיחה לפי שם מחלקה. **תצוגה בלבד (read-only)**.
function formatValue(val, type) {
  if (val === null || val === undefined || val === '') return null;
  if (type === 'date') {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? String(val) : d.toLocaleDateString('he-IL');
  }
  if (Array.isArray(val)) return val.join(', ');
  return String(val);
}

export default function GenericStatsTile({ department, stageOrder = [], labels = {}, transactions = [] }) {
  const extra = department.extraFields || {};
  const fieldDefs = department.fieldDefs || [];
  const currentStageLabel = labels[department.stage] || department.stage;

  const deptTransactions = transactions.filter((t) => t.workspace_id === department.workspaceId);
  const transactionsTotal = deptTransactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const earliestTransactionDate = deptTransactions.length
    ? deptTransactions.reduce((min, t) => (t.transaction_date < min ? t.transaction_date : min), deptTransactions[0].transaction_date)
    : null;

  const filledFields = fieldDefs
    .map((f) => ({ ...f, display: formatValue(extra[f.key], f.type) }))
    .filter((f) => f.display !== null);

  if (filledFields.length === 0 && deptTransactions.length === 0 && !department.stage) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap',
      background: 'var(--blue-bg)', border: '1px solid var(--blue)', borderRadius: 10,
      padding: '14px 16px', marginBottom: 16,
    }}>
      <Block label="שלב נוכחי">
        <span style={value()}>{currentStageLabel}</span>
      </Block>

      {deptTransactions.length > 0 && (
        <Block label="היסטוריית תנועות">
          <span style={value()}>
            ₪{transactionsTotal.toLocaleString('he-IL')} מ-{deptTransactions.length} {deptTransactions.length === 1 ? 'תנועה' : 'תנועות'}
          </span>
          {earliestTransactionDate && (
            <div style={sub()}>מאז {new Date(earliestTransactionDate).toLocaleDateString('he-IL')}</div>
          )}
        </Block>
      )}

      {filledFields.map((f) => (
        <Block key={f.key} label={f.label}>
          <span style={value()}>{f.display}</span>
        </Block>
      ))}
    </div>
  );
}

function Block({ label, children }) {
  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--blue)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function value() {
  return { fontSize: 13, fontWeight: 700, color: 'var(--blue)' };
}

function sub() {
  return { fontSize: 11, color: 'var(--blue)', marginTop: 2, opacity: 0.85 };
}
