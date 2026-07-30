import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { respondApprovalRequest, resendApprovalRequest } from './actions';
import ApprovalRow from './ApprovalRow';

// עמוד בקשות אישור - בקשות שממתינות לתגובה שלי, ובקשות שאני שלחתי
// (כדי לעקוב אחרי הסטטוס ולשלוח מחדש אם נדרשו פרטים נוספים)
export default async function ApprovalsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: incoming }, { data: outgoing }] = await Promise.all([
    supabase
      .from('approval_requests')
      .select('id, task_id, meeting_id, requested_by, requested_to, note, status, response_note, created_at, tasks (title, due_date), meetings (title, meeting_date, meeting_time, contacts (first, last))')
      .eq('requested_to', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('approval_requests')
      .select('id, task_id, meeting_id, requested_by, requested_to, note, status, response_note, created_at, tasks (title, due_date), meetings (title, meeting_date, meeting_time, contacts (first, last))')
      .eq('requested_by', user.id)
      .order('created_at', { ascending: false }),
  ]);

  const allRows = [...(incoming || []), ...(outgoing || [])];
  const userIds = Array.from(new Set(allRows.flatMap((r) => [r.requested_by, r.requested_to])));
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('id, name').in('id', userIds)
    : { data: [] };
  const nameById = Object.fromEntries((profiles || []).map((p) => [p.id, p.name || 'משתמש']));

  const pendingIncoming = (incoming || []).filter((r) => r.status === 'pending');
  const otherIncoming = (incoming || []).filter((r) => r.status !== 'pending');

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 24px' }}>
      <h1 style={{ fontFamily: '"Frank Ruhl Libre",serif', margin: '0 0 20px', fontSize: 20 }}>בקשות אישור</h1>

      <div style={{ fontSize: 12, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', marginBottom: 8 }}>
        ממתינות לאישור שלי ({pendingIncoming.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {pendingIncoming.length === 0 && <div style={{ fontSize: 13, color: '#9b9b9b' }}>אין בקשות ממתינות</div>}
        {pendingIncoming.map((r) => (
          <ApprovalRow key={r.id} r={r} nameById={nameById} mode="incoming" respondAction={respondApprovalRequest} resendAction={resendApprovalRequest} />
        ))}
      </div>

      {otherIncoming.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', marginBottom: 8 }}>
            טופלו על ידי ({otherIncoming.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {otherIncoming.map((r) => (
              <ApprovalRow key={r.id} r={r} nameById={nameById} mode="incoming" respondAction={respondApprovalRequest} resendAction={resendApprovalRequest} />
            ))}
          </div>
        </>
      )}

      <div style={{ fontSize: 12, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', marginBottom: 8 }}>
        הבקשות ששלחתי ({(outgoing || []).length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(outgoing || []).length === 0 && <div style={{ fontSize: 13, color: '#9b9b9b' }}>לא שלחת עדיין בקשות אישור</div>}
        {(outgoing || []).map((r) => (
          <ApprovalRow key={r.id} r={r} nameById={nameById} mode="outgoing" respondAction={respondApprovalRequest} resendAction={resendApprovalRequest} />
        ))}
      </div>
    </div>
  );
}
