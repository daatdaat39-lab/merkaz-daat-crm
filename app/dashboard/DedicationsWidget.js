'use client';

// ווידג'ט תאריכי לוח השנה בדשבורד - מרכז את ההקדשות לפי טווח זמן ברור
// (אתמול / היום / מחר / השבוע הקרוב) עם שם איש הקשר לכל תאריך, וכפתור
// "גרסת הדפסה" שפותח חלון נקי להדפסה.
import Link from 'next/link';
import { useTransition } from 'react';
import { lockDedicationsForPrint } from './sales/campaigns/actions';

const GROUP_STYLES = {
  אתמול: { bg: '#f3f4f6', color: '#4b5563' },
  היום: { bg: '#fff7ed', color: '#c2760f' },
  מחר: { bg: '#eff6ff', color: '#1d4ed8' },
  'השבוע הקרוב': { bg: '#f0fdf4', color: '#15803d' },
};

export default function DedicationsWidget({ groups }) {
  const [, startTransition] = useTransition();
  const hasAny = Object.values(groups).some((list) => list.length > 0);

  function handlePrint() {
    const allIds = Object.values(groups).flat().map((d) => d.id);
    startTransition(() => { lockDedicationsForPrint(allIds); });

    const rows = Object.entries(groups)
      .filter(([, list]) => list.length > 0)
      .map(([label, list]) => {
        const items = list.map((d) => `
          <tr>
            <td>${escapeHtml(new Date(d.dedication_date).toLocaleDateString('he-IL'))}</td>
            <td>${escapeHtml(d.contactName || '')}</td>
            <td>${escapeHtml([d.dedication_text, ...(d.names || [])].filter(Boolean).join(' — '))}</td>
            <td>${escapeHtml(d.note || '')}</td>
          </tr>`).join('');
        return `<tr class="group"><td colspan="4">${escapeHtml(label)}</td></tr>${items}`;
      }).join('');

    const html = `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8">
      <title>תאריכי לוח שנה — מרכז דעת</title>
      <style>
        body { font-family: Arial, "Segoe UI", sans-serif; padding: 24px; color: #111; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        p.sub { font-size: 12px; color: #666; margin: 0 0 16px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { text-align: right; font-size: 11px; color: #666; border-bottom: 2px solid #333; padding: 6px 8px; }
        td { text-align: right; padding: 6px 8px; border-bottom: 1px solid #ddd; }
        tr.group td { background: #f2f2f2; font-weight: 700; font-size: 12px; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <h1>תאריכי לוח שנה והקדשות</h1>
      <p class="sub">הופק ${escapeHtml(new Date().toLocaleDateString('he-IL'))}</p>
      <table>
        <thead><tr><th>תאריך</th><th>איש קשר</th><th>נוסח ההקדשה</th><th>הערה</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4">אין תאריכים בטווח</td></tr>'}</tbody>
      </table>
      <script>window.onload = function () { window.print(); };<\/script>
      </body></html>`;

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
  }

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid #e5e5e5', borderRadius: 8, overflow: 'hidden', marginTop: 12 }}>
      <div style={{
        padding: '14px 18px', borderBottom: '1px solid #e5e5e5', fontSize: 14, fontWeight: 600,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>📅 תאריכי לוח שנה והקדשות</span>
        <button
          type="button"
          onClick={handlePrint}
          style={{ background: 'var(--bg)', border: '1px solid #e5e5e5', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}
        >
          🖨 גרסת הדפסה
        </button>
      </div>
      <div>
        {!hasAny && <div style={{ padding: '14px 18px', fontSize: 13, color: '#9b9b9b' }}>אין תאריכים בטווח הקרוב</div>}
        {Object.entries(groups).map(([label, list]) => (
          list.length === 0 ? null : (
            <div key={label}>
              <div style={{
                padding: '6px 18px', fontSize: 11, fontWeight: 700,
                background: GROUP_STYLES[label]?.bg || '#f5f5f5', color: GROUP_STYLES[label]?.color || '#666',
              }}>
                {label} ({list.length})
              </div>
              {list.map((d) => (
                <Link
                  key={d.id}
                  href={`/dashboard/contacts/${d.contact_id}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px',
                    borderBottom: '1px solid #f2f2f2', fontSize: 13, textDecoration: 'none', color: 'inherit',
                  }}
                >
                  <span style={{ color: '#9b9b9b', whiteSpace: 'nowrap' }}>
                    {new Date(d.dedication_date).toLocaleDateString('he-IL')}
                  </span>
                  <b>{d.contactName}</b>
                  <span style={{ color: '#6b6b6b' }}>{d.dedication_text}</span>
                </Link>
              ))}
            </div>
          )
        ))}
      </div>
    </div>
  );
}

// גרסת ההדפסה נבנית כמחרוזת HTML, אז כל ערך שמגיע מהנתונים חייב בריחה
// כדי ששם/נוסח עם תווים כמו < או & לא ישברו את המסמך
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
