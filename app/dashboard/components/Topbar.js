'use client';

import { usePathname } from 'next/navigation';
import NotConnectedButton from './NotConnectedButton';
import { WS_COLORS } from './ui';

const TITLES = {
  '/dashboard': 'לוח בקרה',
  '/dashboard/contacts': 'אנשי קשר',
  '/dashboard/tasks': 'משימות',
  '/dashboard/calendar': 'יומן',
  '/dashboard/sales': 'דשבורד מכירות',
  '/dashboard/sales/pipeline': 'תהליכים',
  '/dashboard/sales/leads': 'לידים',
  '/dashboard/whatsapp': 'וואטסאפ',
  '/dashboard/email': 'מייל',
  '/dashboard/calls': 'שיחות',
  '/dashboard/reports': 'דוחות',
  '/dashboard/settings': 'הגדרות',
};

export default function Topbar({ workspaceColorIndex = 0 }) {
  const pathname = usePathname();
  const title = pathname.startsWith('/dashboard/contacts/') ? 'איש קשר' : (TITLES[pathname] || 'מרכז דעת');
  const accent = WS_COLORS[workspaceColorIndex >= 0 ? workspaceColorIndex % WS_COLORS.length : 0];

  return (
    <div style={{
      background: 'var(--bg)',
      borderBottom: `1px solid var(--border)`,
      borderTop: `2px solid ${accent}`,
      padding: '0 24px',
      height: 52,
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 15, fontWeight: 600 }}>{title}</span>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-secondary)',
        border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', width: 240,
      }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>🔍</span>
        <input
          placeholder="חיפוש..."
          style={{ border: 'none', background: 'transparent', fontSize: 13, outline: 'none', width: '100%' }}
          onFocus={(e) => e.target.blur()}
          readOnly
        />
      </div>

      <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
        <NotConnectedButton icon="📞" label="שיחות" variant="icon" message="חיבור טלפוניה — עדיין לא מחובר" />
        <NotConnectedButton icon="💬" label="וואטסאפ" variant="icon" message="חיבור וואטסאפ — עדיין לא מחובר" />
        <NotConnectedButton icon="+" label="איש קשר חדש" variant="primary" message="הוספת איש קשר ידנית — בקרוב" />
      </div>
    </div>
  );
}
