import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { getPipeline } from '../../components/pipelines';
import PipelineBoard from './PipelineBoard';

export default async function SalesPipelinePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('current_workspace_id, workspaces:current_workspace_id (name)')
    .eq('id', user.id)
    .single();

  const workspaceId = profile?.current_workspace_id;
  const workspaceName = profile?.workspaces?.name;
  const pipeline = getPipeline(workspaceName);

  let contacts = [];
  if (workspaceId) {
    const { data } = await supabase
      .from('contact_departments')
      .select('id, stage, closed_reason, created_at, contacts:contact_id (id, first, last, tags, source)')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    contacts = (data || [])
      .filter((row) => row.contacts)
      .map((row) => ({
        ...row.contacts, departmentRowId: row.id, stage: row.stage, closed_reason: row.closed_reason, created_at: row.created_at,
      }));
  }

  async function moveStage(departmentRowId, stage, closedReason) {
    'use server';
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !departmentRowId || !stage) return;
    await supabase.from('contact_departments')
      .update({ stage, closed_reason: stage === 'closed' ? (closedReason || null) : null, last_activity_at: new Date().toISOString() })
      .eq('id', departmentRowId);
  }

  return (
    <div style={{ padding: '28px 24px' }}>
      <h1 style={{ fontFamily: '"Frank Ruhl Libre",serif', margin: '0 0 20px', fontSize: 20 }}>תהליכים</h1>
      <PipelineBoard contacts={contacts} moveStageAction={moveStage} stages={pipeline.order} />
    </div>
  );
}
