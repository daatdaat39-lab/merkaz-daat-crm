'use client';

import { useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import NotConnectedButton from './NotConnectedButton';
import AddContactForm from '../contacts/AddContactForm';
import { WS_COLORS } from './ui';
import { globalSearch } from './globalSearchActions';

const TITLES = {
  '/dashboard': 'לוח בקרה',
  '/dashboard/contacts': 'אנשי קשר',
  '/dashboard/tasks': 'משימות',
  '/dashboard/calendar': 'יומן',
  '/dashboard/sales': 'דשבורד מכירות',
  '/dashboard/sales/pipeline': 'תהליכים',
  '/dashboard/sales/leads': 'לידים',
  '/dashboard/approvals': 'בקשות אישור',
  '/dashboard/chat': "צ'אט צוות",
  '/dashboard/whatsapp': 'וואטסאפ',
  '/dashboard/email': 'מייל',
  '/dashboard/calls': 'שיחות',
  '/dashboard/reports': 'דוחות',
  '/dashboard/settings': 'הגדרות',
  '/dashboard/inbox': 'הודעות',
};

export default function Topbar({ workspaceColorIndex = 0, workspaces = [], defaultWorkspaceId = '', existingTags = [], tagGroups = null, pendingWhatsappReplies = 0, unreadShareCount = 0, stageLabels = {} }) {
  const pathname = usePathname();
  const router = useRouter();
  const title = pathname.startsWith('/dashboard/contacts/') ? 'איש קשר' : (TITLES[pathname] || 'מרכז דעת');
  const accent = WS_COLORS[workspaceColorIndex >= 0 ? workspaceColorIndex % WS_COLORS.length : 0];

  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const debounceRef = useRef(null);

  function handleSearchChange(value) {
    setQuery(value);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) { setResults(null); return; }
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const res = await globalSearch(value);
        setResults(res);
      });
    }, 250);
  }

  function goTo(path) {
    setOpen(false);
    setQuery('');
    setResults(null);
    router.push(path);
  }

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

      <div style={{ position: 'relative', width: 240 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-secondary)',
          border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px',
        }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>🔍</span>
          <input
            value={query}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="חיפוש אנשי קשר / משימות..."
            style={{ border: 'none', background: 'transparent', fontSize: 13, outline: 'none', width: '100%' }}
          />
        </div>

        {open && query.trim().length >= 2 && (
          <div style={{
            position: 'absolute', top: '100%', insetInlineStart: 0, insetInlineEnd: 0, marginTop: 4, minWidth: 320,
            background: '#fff', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 360, overflowY: 'auto',
            boxShadow: '0 10px 30px rgba(0,0,0,0.14)', zIndex: 300,
          }}>
            {!results && <div style={{ padding: '10px 14px', fontSize: 12.5, color: 'var(--text-muted)' }}>מחפש...</div>}
            {results && results.contacts.length === 0 && results.tasks.length === 0 && (
              <div style={{ padding: '10px 14px', fontSize: 12.5, color: 'var(--text-muted)' }}>אין תוצאות</div>
            )}
            {results && results.contacts.length > 0 && (
              <div>
                <div style={{ padding: '8px 14px 4px', fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>אנשי קשר</div>
                {results.contacts.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); goTo(`/dashboard/contacts/${c.id}`); }}
                    style={{ display: 'block', width: '100%', textAlign: 'right', background: 'none', border: 'none', borderBottom: '1px solid #f0f0f0', padding: '8px 14px', fontSize: 12.5, cursor: 'pointer' }}
                  >
                    <div style={{ fontWeight: 500 }}>{c.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11, display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                      {c.phone && <span>{c.phone}</span>}
                      {c.departments.map((d, i) => <span key={i}>{d.name} · {stageLabels[d.stage] || d.stage}</span>)}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {results && results.tasks.length > 0 && (
              <div>
                <div style={{ padding: '8px 14px 4px', fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>משימות</div>
                {results.tasks.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); goTo('/dashboard/tasks'); }}
                    style={{ display: 'block', width: '100%', textAlign: 'right', background: 'none', border: 'none', borderBottom: '1px solid #f0f0f0', padding: '8px 14px', fontSize: 12.5, cursor: 'pointer' }}
                  >
                    <div style={{ fontWeight: 500, textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>
                      {t.contactName && <span>{t.contactName}</span>}
                      {t.due_date && <span> · יעד: {new Date(t.due_date).toLocaleDateString('he-IL')}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
        <NotConnectedButton icon="📞" label="שיחות" variant="icon" message="חיבור טלפוניה — עדיין לא מחובר" />
        <button
          onClick={() => router.push('/dashboard/inbox')}
          title={unreadShareCount > 0 ? `${unreadShareCount} הודעות חדשות על אנשי קשר ששותפו איתך` : 'הודעות — אין הודעות חדשות'}
          style={{
            position: 'relative', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', cursor: 'pointer', fontSize: 14,
          }}
        >
          🔔
          {unreadShareCount > 0 && (
            <span style={{
              position: 'absolute', top: -5, insetInlineEnd: -5, background: 'var(--danger, #a3392f)', color: '#fff',
              borderRadius: 999, fontSize: 10, fontWeight: 700, minWidth: 16, height: 16, display: 'flex',
              alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1,
            }}>
              {unreadShareCount}
            </span>
          )}
        </button>
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
          tagGroups={tagGroups}
        />
      </div>
    </div>
  );
}
