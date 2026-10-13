'use server';

import { createClient } from '../../../lib/supabase/server';

// "נוכחות" - טבלת-heartbeat פשוטה (agent_presence, migration 0153),
// לא Presence API אמיתי - עקבי עם שאר המערכת. נקרא מ-AgentPresenceHeartbeat.js.
export async function heartbeatPresence(workspaceId) {
  if (!workspaceId) return { success: false };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false };
  await supabase.from('agent_presence')
    .upsert({ user_id: user.id, workspace_id: workspaceId, last_heartbeat_at: new Date().toISOString() }, { onConflict: 'user_id,workspace_id' });
  return { success: true };
}
