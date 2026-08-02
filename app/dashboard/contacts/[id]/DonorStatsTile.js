'use client';

// קוביית נתוני תרומה בולטת, מוצגת רק כשהמחלקה הפעילה היא "תרומות" - "תרם
// בעבר" מחושב מהשלב בתהליך (לא שדה נפרד), ושאר השדות נערכים ישירות כאן
// (בלי טופס נפרד), באותו דפוס בדיוק כמו העריכה הקיימת ב-LeadRow.js.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getPipeline } from '../../components/pipelines';
import { updateDepartmentExtraField } from '../actions';

export default function DonorStatsTile({ department, frozen }) {
  const [isPending, startTransition] = useTransition();
  const [extraValues, setExtraValues] = useState(department.extraFields || {});
  const router = useRouter();

  const order = getPipeline('תרומות').order;
  const hasDonatedBefore = order.indexOf(department.stage) >= order.indexOf('donated');
  const isStandingOrder = (extraValues.donation_type || '') === 'הוראת קבע';

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
