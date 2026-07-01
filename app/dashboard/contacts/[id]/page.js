import { createClient } from '../../../../lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { StageBadge, Tag, initials, STAGE_ORDER, STAGE_LABELS } from '../../components/ui';
import ContactTabs from './ContactTabs';
import StageSelector from './StageSelector';
import NotConnectedButton from '../../components/NotConnectedButton';

export default async function ContactDetailPage({ params }) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('current_workspace_id')
    .eq('id', user.id)
    .single();

  const workspaceId = profile?.current_workspace_id;

  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', params.id)
    .eq('workspace_id', workspaceId)
    .single();

  if (!contact) notFound();

  const [{ data: meetings }, { data: tasks }] = await Promise.all([
    supabase
      .from('meetings')
      .select('id, title, meeting_date, meeting_time, type, location, notes')
      .eq('contact_id', contact.id)
      .order('meeting_date', { ascending: false }),
    supabase
      .from('tasks')
      .select('id, title, due_date, done')
      .eq('contact_id', contact.id)
      .order('created_at', { ascending: false }),
  ]);

  async function updateStage(formData) {
    'use server';
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const stage = formData.get('stage');
    await supabase
      .from('contacts')
      .update({ stage })
      .eq('id', contact.id);
    redirect(`/dashboard/contacts/${contact.id}`);
  }

  async function toggleTask(formData) {
    'use server';
    const supabase = createClient();
    const taskId = formData.get('task_id');
    const done = formData.get('done') === 'true';
    await supabase.from('tasks').update({ done }).eq('id', taskId);
    redirect(`/dashboard/contacts/${contact.id}`);
  }

  async function updateNotes(formData) {
    'use server';
    const supabase = createClient();
    const notes = formData.get('notes');
    await supabase.from('contacts').update({ notes }).eq('id', contact.id);
    redirect(`/dashboard/contacts/${contact.id}`);
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 24px' }}>
      <a href="/dashboard/contacts" style={{ fontSize: 12.5, color: '#6b6b6b', textDecoration: 'none' }}>
        ← חזרה לרשימת אנשי הקשר
      </a>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '16px 0 24px' }}>
        <div style={{
          width: 44, height: 44, background: '#0a0a0a', color: '#fff', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, flexShrink: 0,
        }}>
          {initials(contact.first, contact.last)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{contact.first} {contact.last}</div>
          <div style={{ fontSize: 12.5, color: '#6b6b6b', display: 'flex', gap: 10, marginTop: 3, alignItems: 'center' }}>
            <StageBadge stage={contact.stage} />
            {contact.dept && <span>{contact.dept}</span>}
          </div>
        </div>
        <StageSelector currentStage={contact.stage} action={updateStage} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <NotConnectedButton label="חיוג" icon="📞" message="חיוג מתוך המערכת (ימות המשיח) — עדיין לא מחובר" />
        <NotConnectedButton label="וואטסאפ" icon="💬" message="שליחת וואטסאפ — עדיין לא מחובר" />
        <NotConnectedButton label="מייל" icon="✉️" message="שליחת מייל — עדיין לא מחובר" />
        <NotConnectedButton label="קביעת פגישה ביומן" icon="📅" message="חיבור ל-Google Calendar — עדיין לא מחובר" />
        <NotConnectedButton label="סיכום AI" icon="✨" message="סיכום שיחות ב-AI — עדיין לא מחובר" />
        <NotConnectedButton label="בדיקת כפילויות" icon="🔗" message="זיהוי ומיזוג כפילויות — עדיין לא מחובר" />
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        {/* עמודה שמאלית - מידע קבוע */}
        <div style={{ width: 240, flexShrink: 0 }}>
          <div style={{ background: '#f9f9f9', border: '1px solid #e5e5e5', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', marginBottom: 10 }}>
              פרטי קשר
            </div>
            <InfoRow label="טלפון" value={contact.phone} />
            <InfoRow label="מייל" value={contact.email} />
            <InfoRow label="מקור" value={contact.source} />
            <InfoRow label="נוצר בתאריך" value={new Date(contact.created_at).toLocaleDateString('he-IL')} />
            <div style={{ marginTop: 12 }}>
              {(contact.tags || []).map((t) => <Tag key={t}>{t}</Tag>)}
            </div>
          </div>

          <div style={{ background: '#f9f9f9', border: '1px solid #e5e5e5', borderRadius: 8, padding: 16, marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', marginBottom: 10 }}>
              מסמכים
            </div>
            <div style={{ fontSize: 12, color: '#9b9b9b', marginBottom: 10 }}>אין מסמכים</div>
            <NotConnectedButton
              label="העלאת מסמך"
              icon="📎"
              message="העלאת תעודת בגרות / גיליון ציונים — עדיין לא מחובר"
              style={{ width: '100%', justifyContent: 'center' }}
            />
          </div>

          <div style={{ background: '#f9f9f9', border: '1px solid #e5e5e5', borderRadius: 8, padding: 16, marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', marginBottom: 10 }}>
              הקלטות שיחה
            </div>
            <div style={{ fontSize: 12, color: '#9b9b9b' }}>אין הקלטות (טלפוניה לא מחוברת)</div>
          </div>
        </div>

        {/* עמודה ראשית - טאבים */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <ContactTabs
            meetings={meetings || []}
            tasks={tasks || []}
            notes={contact.notes}
            toggleTaskAction={toggleTask}
            updateNotesAction={updateNotes}
          />
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10.5, color: '#9b9b9b' }}>{label}</div>
      <div style={{ fontSize: 13 }}>{value || '—'}</div>
    </div>
  );
}
