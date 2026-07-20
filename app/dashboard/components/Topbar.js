'use client';

import { usePathname, useRouter } from 'next/navigation';
import NotConnectedButton from './NotConnectedButton';
import AddContactForm from '../contacts/AddContactForm';
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

export default function Topbar({ workspaceColorIndex = 0, workspaces = [], defaultWorkspaceId = '', existingTags = [], pendingWhatsappReplies = 0 }) {
  const pathname = usePathname();
  const router = useRouter();
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
        <button
          onClick={() => router.push('/dashboard/whatsapp')}
          title={pendingWhatsappReplies > 0 ? `${pendingWhatsappReplies} שיחות WhatsApp ממתינות לתגובה` : 'WhatsApp — אין שיחות ממתינות'}
          style={{
            position: 'relative', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', cursor: 'pointer', fontSize: 14,
          }}
        >
          💬
          {pendingWhatsappReplies > 0 && (
            <span style={{
              position: 'absolute', top: -5, insetInlineEnd: -5, background: 'var(--danger, #a3392f)', color: '#fff',
              borderRadius: 999, fontSize: 10, fontWeight: 700, minWidth: 16, height: 16, display: 'flex',
              alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1,
            }}>
              {pendingWhatsappReplies}
            </span>
          )}
        </button>
        <AddContactForm
          label="+ איש קשר חדש"
          workspaces={workspaces}
          defaultWorkspaceId={defaultWorkspaceId}
          existingTags={existingTags}
        />
      </div>
    </div>
  );
}
