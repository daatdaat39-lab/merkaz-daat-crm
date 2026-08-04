import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfAnyWorkspace } from '../../lib/contactGuards';
import PipelinesClient from './PipelinesClient';

// ניהול שלבי pipeline לכל מחלקה (מיגרציה 0036) - מחליף את PIPELINES/
// STAGE_LABELS/STAGE_COLORS הקבועים בקוד. owner/admin בלבד (נבדק שוב לכל
// מחלקה בנפרד בתוך actions.js, כי מנהל מחלקה אחת בלבד לא אמור לערוך שלבים
// של מחלקה אחרת).
export default async function PipelinesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const allowed = await isManagerOfAnyWorkspace(supabase, user.id);
  if (!allowed) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>
        <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
        <div style={{ marginTop: 20, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', fontSize: 12.5, color: '#92400e' }}>
          רק owner/admin יכול לערוך שלבי pipeline.
        </div>
      </div>
    );
  }

  const { data: workspaces } = await supabase.from('workspaces').select('id, name').order('created_at', { ascending: true });

  const [{ data: stageRows }, { data: automationRows }, { data: whatsappTemplates }, { data: emailTemplates }] = await Promise.all([
    supabase
      .from('pipeline_stages')
      .select('id, workspace_id, stage_key, label, color_bg, color_fg, sort_order, is_lead_stage, is_won_stage, is_side_stage')
      .order('sort_order', { ascending: true, nullsFirst: false }),
    supabase.from('stage_automations').select('id, workspace_id, stage_key, action_type, whatsapp_template_id, email_template_id, task_title, task_due_offset_days'),
    supabase.from('whatsapp_templates').select('id, name').order('created_at'),
    supabase.from('email_templates').select('id, name').order('created_at'),
  ]);

  const stagesByWorkspaceId = {};
  for (const row of stageRows || []) {
    stagesByWorkspaceId[row.workspace_id] = stagesByWorkspaceId[row.workspace_id] || [];
    stagesByWorkspaceId[row.workspace_id].push(row);
  }

  const automationsByStageId = {};
  const stageIdByKey = Object.fromEntries((stageRows || []).map((s) => [`${s.workspace_id}:${s.stage_key}`, s.id]));
  for (const a of automationRows || []) {
    const stageId = stageIdByKey[`${a.workspace_id}:${a.stage_key}`];
    if (!stageId) continue;
    automationsByStageId[stageId] = automationsByStageId[stageId] || [];
    automationsByStageId[stageId].push(a);
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>
      <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
      <h1 style={{ fontFamily: 'var(--font-heading)', margin: '14px 0 4px', fontSize: 20 }}>שלבי pipeline</h1>
      <p style={{ margin: '0 0 20px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
        עריכת שלבי התהליך לכל מחלקה - הוספה, מחיקה, שינוי תווית/צבע, קביעת שלב-ניצחון, ואוטומציה לכל שלב. המפתח הטכני קבוע לאחר יצירה.
      </p>
      <PipelinesClient
        workspaces={workspaces || []}
        stagesByWorkspaceId={stagesByWorkspaceId}
        automationsByStageId={automationsByStageId}
        whatsappTemplates={whatsappTemplates || []}
        emailTemplates={emailTemplates || []}
      />
    </div>
  );
}
