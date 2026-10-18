'use server';

import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isMemberOfWorkspace } from '../../lib/contactGuards';
import { loadContactCardData } from '../../contacts/[id]/loadContactCardData';
import { ensureLeadActionChip } from '../../lib/aiActionChip';

const BATCH_CAP = 25;

// כפתור-רענון-ידני ברשימת-הלידים (לא קורא ל-AI על כל שורה בכל טעינה -
// יקר/איטי מדי). מרענן עד BATCH_CAP לידים שסומנו stale, אחד-אחד דרך
// loadContactCardData (אותה שאילתת-תקשורת שכבר קיימת, לא שכפול).
export async function refreshStaleActionChips(workspaceId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const allowed = await isMemberOfWorkspace(supabase, user.id, workspaceId);
  if (!allowed) return { error: 'אין לך גישה למחלקה הזו' };

  const { data: staleRows } = await supabase
    .from('contact_departments')
    .select('id, contact_id, extra_fields')
    .eq('workspace_id', workspaceId)
    .eq('ai_action_summary_stale', true)
    .limit(BATCH_CAP);

  if (!staleRows || staleRows.length === 0) return { success: true, refreshed: 0 };

  let refreshed = 0;
  for (const row of staleRows) {
    const cardData = await loadContactCardData(row.contact_id);
    if (cardData.notFound || cardData.redirectToLogin) continue;
    const { props } = cardData;
    const department = props.departments.find((d) => d.id === row.id);
    if (!department) continue;
    const result = await ensureLeadActionChip(supabase, {
      id: row.id, stale: true, cachedSummary: department.aiActionSummary,
      contactName: `${props.contact.first} ${props.contact.last}`, courseId: row.extra_fields?.course_id,
      communication: {
        inquiries: department.inquiries, meetings: props.meetings, tasks: props.tasks,
        sentEmails: props.sentEmails, sentWhatsapp: props.sentWhatsapp, callHistory: props.callHistory, phoneCalls: props.phoneCalls,
      },
    });
    if (result) refreshed += 1;
  }
  return { success: true, refreshed, attempted: staleRows.length };
}
