'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WS_COLORS } from './ui';
import LogoutButton from './LogoutButton';
import {
  HomeIcon, UsersIcon, CheckSquareIcon, CalendarIcon, ApprovalIcon,
  TrendingUpIcon, RouteIcon, TargetIcon, HeadsetIcon, TicketIcon,
  ChatBubbleIcon, WhatsAppIcon, MailIcon, PhoneIcon, BarChartIcon, SettingsGearIcon,
  LockIcon, LogoutIcon,
} from './icons';

const NAV_SECTIONS = [
  {
    label: 'כללי',
    items: [
      { href: '/dashboard', label: 'דשבורד', icon: HomeIcon },
      { href: '/dashboard/contacts', label: 'אנשי קשר', icon: UsersIcon },
      { href: '/dashboard/tasks', label: 'משימות', icon: CheckSquareIcon },
      { href: '/dashboard/calendar', label: 'יומן', icon: CalendarIcon },
      { href: '/dashboard/approvals', label: 'בקשות אישור', icon: ApprovalIcon },
    ],
  },
  {
    label: 'מכירות',
    items: [
      { href: '/dashboard/sales', label: 'דשבורד מכירות', icon: TrendingUpIcon },
      { href: '/dashboard/sales/pipeline', label: 'תהליכים', icon: RouteIcon },
      { href: '/dashboard/sales/leads', label: 'לידים', icon: TargetIcon },
      { href: '/dashboard/sales/campaigns/calling', label: 'תור שיחות', icon: HeadsetIcon },
    ],
  },
  {
    label: 'שירות',
    items: [
      { href: '/dashboard/service/cases', label: 'קריאות שירות', icon: TicketIcon },
    ],
  },
  {
    label: 'תקשורת',
    items: [
      { href: '/dashboard/chat', label: "צ'אט צוות", icon: ChatBubbleIcon },
      { href: '/dashboard/whatsapp', label: 'וואטסאפ', icon: WhatsAppIcon },
      { href: '/dashboard/email', label: 'מייל', icon: MailIcon },
      { href: '/dashboard/calls', label: 'שיחות', icon: PhoneIcon },
    ],
  },
  {
    label: 'ניהול',
    items: [
      { href: '/dashboard/reports', label: 'דוחות', icon: BarChartIcon },
      { href: '/dashboard/settings', label: 'הגדרות', icon: SettingsGearIcon },
    ],
  },
];

export default function Sidebar({
  profile,
  userEmail,
  workspaces,
  currentWorkspaceId,
  switchWorkspaceAction,
  logoutAction,
}) {
  const [wsOpen, setWsOpen] = useState(false);
  const pathname = usePathname();

  const currentIndex = workspaces.findIndex((w) => w.id === currentWorkspaceId);
  const current = workspaces[currentIndex] || workspaces[0];

  const initials = (profile?.name || userEmail || '?').trim().slice(0, 2);

  return (
    <aside
      style={{
        width: 240,
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        flexShrink: 0,
        background: 'var(--bg)',
      }}
    >
      {/* לוגו */}
      <div
        style={{
          padding: '20px 16px 16px',
          borderBottom: '1px solid var(--border)',
          borderTop: `3px solid ${WS_COLORS[currentIndex >= 0 ? currentIndex % WS_COLORS.length : 0]}`,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            background: 'var(--accent)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          ד
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>מרכז דעת</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>CRM</div>
        </div>
      </div>

      {/* בורר workspace */}
      <div style={{ padding: '12px 8px', borderBottom: '1px solid var(--border)', position: 'relative' }}>
        <button
          onClick={() => setWsOpen((o) => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 10px',
            borderRadius: 6,
            cursor: 'pointer',
            width: '100%',
            border: 'none',
            background: 'var(--bg-tertiary)',
            textAlign: 'right',
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--text)',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: WS_COLORS[currentIndex >= 0 ? currentIndex % WS_COLORS.length : 0],
              flexShrink: 0,
            }}
          />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {current?.name || 'אין workspace'}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>▾</span>
        </button>

        {wsOpen && workspaces.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 8,
              left: 8,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: 'var(--shadow-md)',
              zIndex: 100,
              marginTop: 4,
              overflow: 'hidden',
            }}
          >
            {workspaces.map((w, i) => (
              <form action={switchWorkspaceAction} key={w.id}>
                <input type="hidden" name="workspace_id" value={w.id} />
                <button
                  type="submit"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '9px 12px',
                    width: '100%',
                    border: 'none',
                    background: w.id === currentWorkspaceId ? 'var(--bg-tertiary)' : 'transparent',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: w.id === currentWorkspaceId ? 500 : 400,
                    textAlign: 'right',
                    color: 'var(--text)',
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: WS_COLORS[i % WS_COLORS.length],
                      flexShrink: 0,
                    }}
                  />
                  {w.name}
                  {w.restricted && <LockIcon size={12} style={{ marginRight: 'auto', color: 'var(--text-muted)' }} />}
                </button>
              </form>
            ))}
          </div>
        )}
      </div>

      {/* ניווט */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 4px' }}>
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} style={{ marginBottom: 6 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                padding: '8px 8px 4px',
              }}
            >
              {section.label}
            </div>
            {section.items.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    padding: '7px 10px',
                    borderRadius: 6,
                    color: active ? 'var(--text)' : 'var(--text-secondary)',
                    fontSize: 13.5,
                    textDecoration: 'none',
                    background: active ? 'var(--bg-tertiary)' : 'transparent',
                    fontWeight: active ? 500 : 400,
                  }}
                >
                  <item.icon size={16} style={{ opacity: active ? 1 : 0.7 }} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* כרטיס משתמש */}
      <div style={{ marginTop: 'auto', padding: '12px 8px', borderTop: '1px solid var(--border)' }}>
        <Link
          href="/dashboard/settings/my-preferences"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none' }}
        >
          <SettingsGearIcon size={13} /> ההעדפות שלי
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 6 }}>
          <div
            style={{
              width: 28,
              height: 28,
              background: 'var(--accent)',
              color: '#fff',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {profile?.name || userEmail}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{profile?.role || '—'}</div>
          </div>
          <LogoutButton
              logoutAction={logoutAction}
              title="התנתקות"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 6,
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                fontSize: 12,
                padding: '5px 10px',
                whiteSpace: 'nowrap',
              }}
            >
              <LogoutIcon size={14} />
              התנתקות
            </LogoutButton>
        </div>
      </div>
    </aside>
  );
}
