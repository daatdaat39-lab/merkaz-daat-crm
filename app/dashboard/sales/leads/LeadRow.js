'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { STAGE_LABELS, STAGE_COLORS, initials } from '../../components/ui';
import { assignAgent, updateLeadStage, removeDepartmentMembership } from '../../contacts/actions';
import ContactQuickActions from '../../components/ContactQuickActions';

function elapsedLabel(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return 'עודכן לפני פחות משעה';
  if (hours < 24) return `${hours} שעות מאז הטיפול האחרון`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'יום' : 'ימים'} מאז הטיפול האחרון`;
}

export default function LeadRow({ contact: c, agents, workspaceId, workspaceName, stages = [], sendConnections = [], whatsappTemplates = [] }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const hours = c.last_activity_at ? (Date.now() - new Date(c.last_activity_at).getTime()) / 3600000 : 0;
  const overdue = hours >= 24;

  function handleAgentChange(e) {
    startTransition(async () => {
      await assignAgent(c.id, workspaceId, e.target.value || null);
      router.refresh();
    });
  }

  function handleStageChange(e) {
    startTransition(async () => {
      await updateLeadStage(c.departmentRowId, e.target.value, null);
      router.refresh();
    });
  }

  function handleRemove() {
    if (!confirm(`להסיר את ${c.first} ${c.last} ממחלקת "${workspaceName}"? הכרטיס עצמו לא נמחק.`)) return;
    startTransition(async () => {
      await removeDepartmentMembership(c.id, workspaceId);
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
      <td style={{ padding: '10px 16px', fontSize: 13 }}>
        <select
          value={c.stage}
          onChange={handleStageChange}
          disabled={isPending}
          style={{
            border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 11, fontWeight: 500, cursor: 'pointer',
            background: (STAGE_COLORS[c.stage] || STAGE_COLORS.open).bg,
            color: (STAGE_COLORS[c.stage] || STAGE_COLORS.open).color,
          }}
        >
          {stages.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
        </select>
      </td>
      <td style={{ padding: '10px 16px', fontSize: 13 }}>{c.phone || '—'}</td>
      <td style={{ padding: '10px 16px', fontSize: 13 }}>{c.email || '—'}</td>
      <td style={{ padding: '10px 16px', fontSize: 13 }}>{c.source || '—'}</td>
      <td style={{ padding: '10px 16px', fontSize: 12.5 }}>
        {c.inquiryCount > 1 && (
          <div style={{ color: 'var(--danger, #a3392f)', fontWeight: 600, fontSize: 11, marginBottom: 2 }}>
            🔄 פנה שוב! ({c.inquiryCount} פניות)
          </div>
        )}
        {c.latestReason || '—'}
      </td>
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
      <td style={{ padding: '10px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ContactQuickActions
            contact={{ id: c.id, phone: c.phone, email: c.email, frozen: c.frozen, latestReason: c.latestReason }}
            departments={workspaceId ? [{ workspaceId, workspaceName }] : []}
            sendConnections={sendConnections}
            whatsappTemplates={whatsappTemplates}
          />
          <button
            onClick={handleRemove}
            disabled={isPending}
            title="הסרה ממחלקה זו"
            style={{ background: 'none', border: 'none', color: 'var(--danger, #a3392f)', fontSize: 14, cursor: 'pointer', padding: 4 }}
          >
            🗑
          </button>
        </div>
      </td>
    </tr>
  );
}
