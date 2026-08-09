'use server';

import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfWorkspace } from '../../lib/contactGuards';

async function requireWorkspaceManager(workspaceId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const allowed = await isManagerOfWorkspace(supabase, user.id, workspaceId);
  if (!allowed) return { error: 'רק בעלים/מנהל של המחלקה יכול לערוך מקורות לידים' };
  return { supabase, user };
}

export async function createLeadSource(workspaceId, { name, linkPattern }) {
  const ctx = await requireWorkspaceManager(workspaceId);
  if (ctx.error) return ctx;
  const { supabase } = ctx;
  const cleanName = (name || '').trim();
  if (!cleanName) return { error: 'יש להזין שם מקור' };

  const { error } = await supabase.from('lead_sources').insert({
    workspace_id: workspaceId, name: cleanName, link_pattern: (linkPattern || '').trim() || null,
  });
  if (error) return { error: error.message };
  return { success: true };
}

export async function deleteLeadSource(id, workspaceId) {
  const ctx = await requireWorkspaceManager(workspaceId);
  if (ctx.error) return ctx;
  const { error } = await ctx.supabase.from('lead_sources').delete().eq('id', id).eq('workspace_id', workspaceId);
  if (error) return { error: error.message };
  return { success: true };
}

// שיוך תיבת ברירת המחדל של המחלקה + כלל ניתוב לקמפיין - להבדיל מחיבור
// תיבה ייעודית לקמפיין, שקורה דרך /api/auth/gmail/start?campaign_id=...
// ולא דרך הפעולה הזו.
export async function updateCampaignRouting(campaignId, workspaceId, { emailConnectionId, routeMatchText }) {
  const ctx = await requireWorkspaceManager(workspaceId);
  if (ctx.error) return ctx;
  const { error } = await ctx.supabase.from('campaigns')
    .update({ email_connection_id: emailConnectionId || null, route_match_text: (routeMatchText || '').trim() || null })
    .eq('id', campaignId).eq('workspace_id', workspaceId);
  if (error) return { error: error.message };
  return { success: true };
}

// ניתוק חיבור מייל - גם תיבת ברירת מחדל של מחלקה וגם תיבה ייעודית של
// קמפיין. אם קמפיין אחר הצביע לתיבה הזו כתיבת-שיתוף (campaigns.
// email_connection_id) - ה-FK (on delete set null) מנקה את השיוך שלו
// אוטומטית, בלי לגעת בקמפיין עצמו.
export async function disconnectEmailConnection(id, workspaceId) {
  const ctx = await requireWorkspaceManager(workspaceId);
  if (ctx.error) return ctx;
  const { error } = await ctx.supabase.from('email_connections').delete().eq('id', id).eq('workspace_id', workspaceId);
  if (error) return { error: error.message };
  return { success: true };
}
