'use client';

// קוביית נתוני תרומה, מוצגת רק כשהמחלקה הפעילה היא "תרומות".
// **תצוגה בלבד (read-only)** - הנתונים מגיעים מהיסטוריית התרומות המיובאת
// (donation_transactions) ומשדות המחלקה, ובעתיד יתעדכנו אוטומטית ממערכת
// "קשר" החיה. עריכה ידנית כאן הוסרה בכוונה כדי שלא תתנגש עם מקור האמת.
import { getPipeline } from '../../components/pipelines';
import NotConnectedButton from '../../components/NotConnectedButton';

// "כמה זמן עבר" מתאריך נתון - ימים/חודשים/שנים, בעברית
function elapsedSince(dateStr) {
  if (!dateStr) return null;
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days < 0) return null; // תאריך עתידי - לא מציגים "עבר"
  if (days === 0) return 'היום';
  if (days < 30) return `לפני ${days} ${days === 1 ? 'יום' : 'ימים'}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `לפני ${months} ${months === 1 ? 'חודש' : 'חודשים'}`;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  const yearsPart = `${years} ${years === 1 ? 'שנה' : 'שנים'}`;
  return remMonths > 0 ? `לפני ${yearsPart} ו-${remMonths} חודשים` : `לפני ${yearsPart}`;
}

// "עוד כמה זמן" עד תאריך עתידי (חיוב הבא) - שלילי = כבר עבר
function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.round((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export default function DonorStatsTile({ department, transactions = [] }) {
  const extra = department.extraFields || {};

  const deptTransactions = transactions.filter((t) => t.workspace_id === department.workspaceId);
  const transactionsTotal = deptTransactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const earliestTransactionDate = deptTransactions.length
    ? deptTransactions.reduce((min, t) => (t.transaction_date < min ? t.transaction_date : min), deptTransactions[0].transaction_date)
    : null;

  const order = getPipeline('תרומות').order;
  // "תרם בעבר" - גם מהשלב בתהליך וגם מהיסטוריית תנועות אמיתית; כל אחד מספיק
  const hasDonatedBefore = order.indexOf(department.stage) >= order.indexOf('donated') || deptTransactions.length > 0;

  const donationType = extra.donation_type || '';
  const isStandingOrder = donationType === 'הוראת קבע';
  const referenceDate = isStandingOrder ? extra.standing_order_start_date : extra.donation_date;
  const elapsed = elapsedSince(referenceDate);
  const nextChargeDays = isStandingOrder ? daysUntil(extra.standing_order_next_charge_date) : null;

  // ספירת תשלומים: כמה שולמו בפועל (מההיסטוריה) מתוך סך ההוראה.
  // בלי סך מוגדר - ההוראה אינסופית ("ללא תאריך סיום").
  const totalPayments = Number(extra.standing_order_total_payments) || null;
  const paidPayments = deptTransactions.length;

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap',
      background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
      padding: '14px 16px', marginBottom: 16,
    }}>
      <Block label="נתוני תרומה">
        {hasDonatedBefore ? (
          <span style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>✓ תרם בעבר</span>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 600, color: '#6b7280' }}>טרם תרם</span>
        )}
        {elapsed && <div style={sub()}>{elapsed}</div>}
      </Block>

      {deptTransactions.length > 0 && (
        <Block label="היסטוריית תרומות">
          <span style={value()}>
            ₪{transactionsTotal.toLocaleString('he-IL')} מ-{deptTransactions.length} {deptTransactions.length === 1 ? 'תרומה' : 'תרומות'}
          </span>
          {earliestTransactionDate && (
            <div style={sub()}>מאז {new Date(earliestTransactionDate).toLocaleDateString('he-IL')}</div>
          )}
        </Block>
      )}

      {donationType && (
        <Block label="סוג תרומה">
          <span style={value()}>{donationType}</span>
        </Block>
      )}

      {extra.expected_donation_amount && (
        <Block label="סכום תרומה">
          <span style={value()}>₪{Number(extra.expected_donation_amount).toLocaleString('he-IL')}</span>
        </Block>
      )}

      {isStandingOrder && (
        <>
          <Block label="תשלומים">
            <span style={value()}>
              {totalPayments ? `${paidPayments}/${totalPayments}` : paidPayments}
            </span>
            {!totalPayments && <div style={sub()}>ללא תאריך סיום</div>}
          </Block>

          {extra.standing_order_start_date && (
            <Block label="תאריך התחלה">
              <span style={value()}>{new Date(extra.standing_order_start_date).toLocaleDateString('he-IL')}</span>
            </Block>
          )}

          {extra.standing_order_next_charge_date && (
            <Block label="תאריך חיוב הבא">
              <span style={value()}>{new Date(extra.standing_order_next_charge_date).toLocaleDateString('he-IL')}</span>
              {nextChargeDays !== null && (
                <div style={{
                  ...sub(),
                  fontWeight: 600,
                  color: nextChargeDays < 0 ? '#b23b2f' : nextChargeDays <= 3 ? '#c2760f' : '#166534',
                }}>
                  {nextChargeDays < 0 ? `⚠ עבר לפני ${Math.abs(nextChargeDays)} ימים`
                    : nextChargeDays === 0 ? '🔔 היום'
                    : `עוד ${nextChargeDays} ${nextChargeDays === 1 ? 'יום' : 'ימים'}`}
                </div>
              )}
            </Block>
          )}
        </>
      )}

      {extra.donation_date && !isStandingOrder && (
        <Block label="תאריך התרומה">
          <span style={value()}>{new Date(extra.donation_date).toLocaleDateString('he-IL')}</span>
        </Block>
      )}

      <div style={{ marginInlineStart: 'auto', alignSelf: 'center' }}>
        <NotConnectedButton
          label="חידוש / הקמת תרומה"
          icon="💳"
          message="הקמת תרומה או חידוש הוראת קבע מתבצעים דרך מערכת קשר — החיבור החי עדיין לא מוגדר"
        />
      </div>
    </div>
  );
}

function Block({ label, children }) {
  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: '#15803d', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function value() {
  return { fontSize: 13, fontWeight: 700, color: '#15803d' };
}

function sub() {
  return { fontSize: 11, color: '#166534', marginTop: 2 };
}
