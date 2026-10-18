'use server';

import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isMemberOfWorkspace } from '../../lib/contactGuards';
import { loadContactCardData } from '../../contacts/[id]/loadContactCardData';
import { ensureCaseActionChip } from '../../lib/aiActionChip';

const BATCH_CAP = 25;

// כפתור-רענון-ידני בלוח-הקריאות - אותו עיקרון בדיוק כמו
// sales/leads/aiChipActions.js (לא קורא ל-AI על כל כרטיס בכל טעינה).
export async function refreshStaleCaseActionChips(workspaceId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const allowed = await isMemberOfWorkspace(supabase, user.id, workspaceId);
  if (!allowed) return { error: 'אין לך גישה למחלקה הזו' };

  const { data: staleRows } = await supabase
    .from('service_cases')
    .select('id, contact_id, course_id')
    .eq('workspace_id', workspaceId)
    .eq('ai_action_summary_stale', true)
    .limit(BATCH_CAP);

  if (!staleRows || staleRows.length === 0) return { success: true, refreshed: 0 };

  let refreshed = 0;
  for (const row of staleRows) {
    const cardData = await loadContactCardData(row.contact_id);
    if (cardData.notFound || cardData.redirectToLogin) continue;
    const { props } = cardData;
    const result = await ensureCaseActionChip(supabase, {
      id: row.id, stale: true, cachedSummary: null,
      contactName: `${props.contact.first} ${props.contact.last}`, courseId: row.course_id,
      communication: {
        inquiries: props.allInquiries, meetings: props.meetings, tasks: props.tasks,
        sentEmails: props.sentEmails, sentWhatsapp: props.sentWhatsapp, callHistory: props.callHistory, phoneCalls: props.phoneCalls,
      },
    });
    if (result) refreshed += 1;
  }
  return { success: true, refreshed, attempted: staleRows.length };
}
