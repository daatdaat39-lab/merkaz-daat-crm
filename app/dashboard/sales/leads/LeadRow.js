'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { StageBadge, initials } from '../../components/ui';
import { assignAgent } from '../../contacts/actions';

function elapsedLabel(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return 'עודכן לפני פחות משעה';
  if (hours < 24) return `${hours} שעות מאז הטיפול האחרון`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'יום' : 'ימים'} מאז הטיפול האחרון`;
}

export default function LeadRow({ contact: c, agents }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const hours = c.last_activity_at ? (Date.now() - new Date(c.last_activity_at).getTime()) / 3600000 : 0;
  const overdue = hours >= 24;

  function handleAgentChange(e) {
    startTransition(async () => {
      await assignAgent(c.id, e.target.value || null);
      router.refresh();
    });
  }

  return (
    <tr style={{ borderBottom: '1px solid var(--bg-tertiary)', background: overdue ? 'var(--danger-soft, #fdecea)' : 'transparent' }}>
      <td style={{ padding: '10px 16px', fontSize: 13 }}>
        <Link href={`/dashboard/contacts/${c.id}`} style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: 'inherit', fontWeight: 500 }}>
          <span style={{ width: 26, height: 26, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>
            {initials(c.first, c.last)}
          </span>
          {c.first} {c.last}
        </Link>
      </td>
      <td style={{ padding: '10px 16px', fontSize: 13 }}><StageBadge stage={c.stage} /></td>
      <td style={{ padding: '10px 16px', fontSize: 13 }}>{c.phone || '—'}</td>
      <td style={{ padding: '10px 16px', fontSize: 13 }}>{c.email || '—'}</td>
      <td style={{ padding: '10px 16px', fontSize: 13 }}>{c.source || '—'}</td>
      <td style={{ padding: '10px 16px', fontSize: 12.5 }}>
        {overdue && <span style={{ color: 'var(--danger, #a3392f)', fontWeight: 600 }}>⚠ </span>}
        {elapsedLabel(c.last_activity_at) || '—'}
      </td>
      <td style={{ padding: '10px 16px', fontSize: 12.5 }}>
        <select
          value={c.agent_id || ''}
          onChange={handleAgentChange}
          disabled={isPending}
          style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 6px', fontSize: 12 }}
        >
          <option value="">ללא נציג</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </td>
    </tr>
  );
}
