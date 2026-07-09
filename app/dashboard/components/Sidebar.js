'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WS_COLORS } from './ui';

const NAV_SECTIONS = [
  {
    label: 'כללי',
    items: [
      { href: '/dashboard', label: 'דשבורד', icon: '🏠' },
      { href: '/dashboard/contacts', label: 'אנשי קשר', icon: '👥' },
      { href: '/dashboard/tasks', label: 'משימות', icon: '✅' },
      { href: '/dashboard/calendar', label: 'יומן', icon: '📅' },
    ],
  },
  {
    label: 'מכירות',
    items: [
      { href: '/dashboard/sales', label: 'דשבורד מכירות', icon: '📈' },
      { href: '/dashboard/sales/pipeline', label: 'תהליכים', icon: '🔀' },
      { href: '/dashboard/sales/leads', label: 'לידים', icon: '🎯' },
    ],
  },
  {
    label: 'תקשורת',
    items: [
      { href: '/dashboard/whatsapp', label: 'וואטסאפ', icon: '💬' },
      { href: '/dashboard/email', label: 'מייל', icon: '✉️' },
      { href: '/dashboard/calls', label: 'שיחות', icon: '📞' },
    ],
  },
  {
    label: 'ניהול',
    items: [
      { href: '/dashboard/reports', label: 'דוחות', icon: '📊' },
      { href: '/dashboard/settings', label: 'הגדרות', icon: '⚙️' },
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
        borderLeft: '1px solid #e5e5e5',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        flexShrink: 0,
        background: '#ffffff',
      }}
    >
      {/* לוגו */}
      <div
        style={{
          padding: '20px 16px 16px',
          borderBottom: '1px solid #e5e5e5',
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
            background: '#0a0a0a',
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
          <div style={{ fontSize: 11, color: '#9b9b9b' }}>CRM</div>
        </div>
      </div>

      {/* בורר workspace */}
      <div style={{ padding: '12px 8px', borderBottom: '1px solid #e5e5e5', position: 'relative' }}>
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
            background: '#f2f2f2',
            textAlign: 'right',
            fontSize: 13,
            fontWeight: 500,
            color: '#0a0a0a',
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
          <span style={{ color: '#9b9b9b', fontSize: 10 }}>▾</span>
        </button>

        {wsOpen && workspaces.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 8,
              left: 8,
              background: '#fff',
              border: '1px solid #e5e5e5',
              borderRadius: 8,
              boxShadow: '0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.05)',
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
                    background: w.id === currentWorkspaceId ? '#f2f2f2' : 'transparent',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: w.id === currentWorkspaceId ? 500 : 400,
                    textAlign: 'right',
                    color: '#0a0a0a',
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
                  {w.restricted && <span style={{ marginRight: 'auto', fontSize: 11 }}>🔒</span>}
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
                color: '#9b9b9b',
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
                    color: active ? '#0a0a0a' : '#6b6b6b',
                    fontSize: 13.5,
                    textDecoration: 'none',
                    background: active ? '#f2f2f2' : 'transparent',
                    fontWeight: active ? 500 : 400,
                  }}
                >
                  <span style={{ opacity: active ? 1 : 0.7 }}>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* כרטיס משתמש */}
      <div style={{ marginTop: 'auto', padding: '12px 8px', borderTop: '1px solid #e5e5e5' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 6 }}>
          <div
            style={{
              width: 28,
              height: 28,
              background: '#0a0a0a',
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
            <div style={{ fontSize: 11, color: '#9b9b9b' }}>{profile?.role || '—'}</div>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              title="התנתקות"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'transparent',
                border: '1px solid #e5e5e5',
                borderRadius: 6,
                cursor: 'pointer',
                color: '#6b6b6b',
                fontSize: 12,
                padding: '5px 10px',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: 14 }}>⏻</span>
              התנתקות
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
