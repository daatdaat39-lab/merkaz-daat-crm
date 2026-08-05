'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { dismissAdvancedInquiry } from '../../contacts/actions';

// באנר "פניות חדשות מאנשי קשר שכבר מתקדמים" - כל שורה ניתנת ל"סגירה"
// (סימון dismissed_at על הפנייה הספציפית, ר' contacts/actions.js),
// בלי לגעת בשלב איש הקשר. הסרה אופטימית מהרשימה המקומית + router.refresh()
// כדי שבטעינה הבאה של page.js השורה כבר לא תחזור (עד פנייה חדשה).
export default function AdvancedInquiriesBanner({ advancedInquiries, stagesSummary }) {
  const [dismissed, setDismissed] = useState(() => new Set());
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const visible = advancedInquiries.filter((a) => !dismissed.has(a.inquiryId));
  if (visible.length === 0) return null;

  function handleDismiss(inquiryId) {
    setDismissed((prev) => new Set(prev).add(inquiryId));
    startTransition(async () => {
      await dismissAdvancedInquiry(inquiryId);
      router.refresh();
    });
  }

  return (
    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '14px 16px', marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 8 }}>
        🔔 פניות חדשות מאנשי קשר שכבר מתקדמים ({visible.length})
      </div>
      <p style={{ fontSize: 12, color: '#92400e', margin: '0 0 10px' }}>
        אלה לא "לידים" במובן הרגיל — הם כבר בשלב מתקדם ({stagesSummary}) — אבל פנו שוב לאחרונה, ולכן לא מוצגים ברשימה הרגילה למטה. ניתן לסגור כל פנייה בנפרד אחרי שטופלה.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visible.map((a) => (
          <div
            key={a.inquiryId}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: 'var(--bg)', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 12px', fontSize: 12.5 }}
          >
            <Link href={`/dashboard/contacts/${a.contactId}`} style={{ display: 'flex', flex: 1, textDecoration: 'none', color: 'inherit' }}>
              <span><b>{a.name}</b> · {a.stageLabel}{a.reason ? ` · ${a.reason}` : ''}</span>
            </Link>
            <span style={{ color: '#9b9b9b', fontSize: 11, whiteSpace: 'nowrap' }}>{new Date(a.createdAt).toLocaleDateString('he-IL')}</span>
            <button
              type="button"
              onClick={() => handleDismiss(a.inquiryId)}
              disabled={isPending}
              title="סמן שהפנייה טופלה"
              style={{ flexShrink: 0, background: 'none', border: '1px solid #fde68a', borderRadius: 6, padding: '4px 10px', fontSize: 11.5, color: '#92400e', cursor: 'pointer' }}
            >
              ✓ סגור פנייה
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
