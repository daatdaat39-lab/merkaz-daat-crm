import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import PipelineBoard from './PipelineBoard';

export default async function SalesPipelinePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('current_workspace_id')
    .eq('id', user.id)
    .single();

  const workspaceId = profile?.current_workspace_id;

  let contacts = [];
  if (workspaceId) {
    const { data } = await supabase
      .from('contacts')
      .select('id, first, last, tags, source, stage, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    contacts = data || [];
  }

  async function moveStage(contactId, stage) {
    'use server';
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !contactId || !stage) return;
    await supabase.from('contacts').update({ stage }).eq('id', contactId);
  }

  return (
    <div style={{ padding: '28px 24px' }}>
      <h1 style={{ fontFamily: '"Frank Ruhl Libre",serif', margin: '0 0 20px', fontSize: 20 }}>פייפליין</h1>
      <PipelineBoard contacts={contacts} moveStageAction={moveStage} />
    </div>
  );
}
