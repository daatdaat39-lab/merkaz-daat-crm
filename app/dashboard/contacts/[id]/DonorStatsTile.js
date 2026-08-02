'use client';

// קוביית נתוני תרומה בולטת, מוצגת רק כשהמחלקה הפעילה היא "תרומות" - "תרם
// בעבר" מחושב מהשלב בתהליך (לא שדה נפרד), ושאר השדות נערכים ישירות כאן
// (בלי טופס נפרד), באותו דפוס בדיוק כמו העריכה הקיימת ב-LeadRow.js.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getPipeline } from '../../components/pipelines';
import { updateDepartmentExtraField } from '../actions';

// "כמה זמן עבר" מתאריך נתון - ימים/חודשים/שנים, בעברית. משמש הן לתרומה
// חד-פעמית (מ-donation_date) והן להוראת קבע (מ-standing_order_start_date).
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

export default function DonorStatsTile({ department, frozen }) {
  const [isPending, startTransition] = useTransition();
  const [extraValues, setExtraValues] = useState(department.extraFields || {});
  const router = useRouter();

  const order = getPipeline('תרומות').order;
  const hasDonatedBefore = order.indexOf(department.stage) >= order.indexOf('donated');
  const isStandingOrder = (extraValues.donation_type || '') === 'הוראת קבע';
  const isOneTime = (extraValues.donation_type || '') === 'חד פעמי';
  const referenceDate = isStandingOrder ? extraValues.standing_order_start_date : extraValues.donation_date;
  const elapsed = elapsedSince(referenceDate);

  function handleChange(key, value) {
    setExtraValues((prev) => ({ ...prev, [key]: value }));
    startTransition(async () => {
      await updateDepartmentExtraField(department.id, key, value);
      router.refresh();
    });
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap',
      background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
      padding: '14px 16px', marginBottom: 16,
    }}>
      <div style={{ flexShrink: 0 }}>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: '#15803d', textTransform: 'uppercase', marginBottom: 4 }}>נתוני תרומה</div>
        {hasDonatedBefore ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 700, color: '#15803d' }}>✓ תרם בעבר</span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: '#6b7280' }}>טרם תרם</span>
        )}
        {elapsed && (
          <div style={{ fontSize: 11, color: '#166534', marginTop: 2 }}>{elapsed}</div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <label style={tileLabel()}>סוג תרומה</label>
        <select
          value={extraValues.donation_type || ''}
          onChange={(e) => handleChange('donation_type', e.target.value)}
          disabled={isPending || frozen}
          style={tileInput()}
        >
          <option value="">—</option>
          <option value="חד פעמי">חד פעמי</option>
          <option value="הוראת קבע">הוראת קבע</option>
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <label style={tileLabel()}>סכום תרומה</label>
        <input
          type="number"
          defaultValue={extraValues.expected_donation_amount || ''}
          onBlur={(e) => {
            if (e.target.value !== (extraValues.expected_donation_amount || '')) handleChange('expected_donation_amount', e.target.value);
          }}
          disabled={isPending || frozen}
          style={{ ...tileInput(), width: 100 }}
        />
      </div>

      {isOneTime && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label style={tileLabel()}>תאריך התרומה</label>
          <input
            type="date"
            defaultValue={extraValues.donation_date || ''}
            onBlur={(e) => {
              if (e.target.value !== (extraValues.donation_date || '')) handleChange('donation_date', e.target.value);
            }}
            disabled={isPending || frozen}
            style={tileInput()}
          />
        </div>
      )}

      {isStandingOrder && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <label style={tileLabel()}>תאריך התחלה</label>
            <input
              type="date"
              defaultValue={extraValues.standing_order_start_date || ''}
              onBlur={(e) => {
                if (e.target.value !== (extraValues.standing_order_start_date || '')) handleChange('standing_order_start_date', e.target.value);
              }}
              disabled={isPending || frozen}
              style={tileInput()}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <label style={tileLabel()}>תאריך חיוב הבא</label>
            <input
              type="date"
              defaultValue={extraValues.standing_order_next_charge_date || ''}
              onBlur={(e) => {
                if (e.target.value !== (extraValues.standing_order_next_charge_date || '')) handleChange('standing_order_next_charge_date', e.target.value);
              }}
              disabled={isPending || frozen}
              style={tileInput()}
            />
          </div>
        </>
      )}
    </div>
  );
}

function tileLabel() {
  return { fontSize: 10.5, color: '#166534', fontWeight: 500 };
}

function tileInput() {
  return { border: '1px solid #bbf7d0', borderRadius: 6, padding: '5px 8px', fontSize: 13, background: '#fff' };
}
