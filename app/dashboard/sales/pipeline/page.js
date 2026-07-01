import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { STAGE_LABELS, STAGE_ORDER } from '../../components/ui';

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

  async function moveStage(formData) {
    'use server';
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const contactId = formData.get('contact_id');
    const stage = formData.get('stage');
    await supabase.from('contacts').update({ stage }).eq('id', contactId);
    redirect('/dashboard/sales/pipeline');
  }

  return (
    <div style={{ padding: '28px 24px' }}>
      <h1 style={{ fontFamily: '"Frank Ruhl Libre",serif', margin: '0 0 20px', fontSize: 20 }}>פייפליין</h1>

      <div style={{ display: 'flex', gap: 0, overflowX: 'auto', paddingBottom: 8 }}>
        {STAGE_ORDER.map((stage, i) => {
          const stageContacts = contacts.filter((c) => c.stage === stage);
          const nextStage = STAGE_ORDER[i + 1];
          return (
            <div key={stage} style={{ minWidth: 220, flexShrink: 0, borderLeft: i > 0 ? '1px solid #e5e5e5' : 'none' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #e5e5e5', background: '#f9f9f9' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6b6b6b' }}>{STAGE_LABELS[stage]}</div>
                <div style={{ fontSize: 11, color: '#9b9b9b' }}>{stageContacts.length} לידים</div>
              </div>
              <div style={{ padding: 8, minHeight: 100 }}>
                {stageContacts.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      background: '#fff', border: '1px solid #e5e5e5', borderRadius: 6, padding: '10px 12px',
                      marginBottom: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    }}
                  >
                    <Link href={`/dashboard/contacts/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{c.first} {c.last}</div>
                    </Link>
                    <div style={{ fontSize: 11, color: '#9b9b9b', marginBottom: 6 }}>
                      {c.source && <span style={{ background: '#f0f0f0', color: '#333', padding: '1px 6px', borderRadius: 4, fontSize: 10 }}>{c.source}</span>}
                    </div>
                    {nextStage && (
                      <form action={moveStage}>
                        <input type="hidden" name="contact_id" value={c.id} />
                        <input type="hidden" name="stage" value={nextStage} />
                        <button
                          type="submit"
                          style={{
                            width: '100%', fontSize: 11, padding: '5px 0', borderRadius: 5,
                            border: '1px solid #e5e5e5', background: '#fff', cursor: 'pointer', color: '#333',
                          }}
                        >
                          העבר ל-{STAGE_LABELS[nextStage]} ←
                        </button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
