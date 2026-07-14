import { createClient } from '../../../../lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { Tag, initials } from '../../components/ui';
import { calculateAge, calculateHebrewDate } from '../../lib/hebrewDate';
import { updateContactNotes } from '../actions';
import { toggleTask } from '../../tasks/actions';
import ContactTabs from './ContactTabs';
import DepartmentSwitcher from './DepartmentSwitcher';
import ContactEditForm from './ContactEditForm';
import ContactSettingsMenu from './ContactSettingsMenu';
import NotConnectedButton from '../../components/NotConnectedButton';

// תוכן הכרטיס המלא - מקור אמת יחיד שגם העמוד המלא (contacts/[id]/page.js)
// וגם החלון הצף (@modal/(.)contacts/[id]/page.js) עוטפים ומציגים.
// isModal שולט רק בהבדלים קוסמטיים (קישור חזרה, ריווח חיצוני).
export default async function ContactDetailContent({ contactId, isModal }) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // אנשי קשר משותפים לכולם - לא מסוננים לפי workspace
  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .single();

  if (!contact) notFound();

  const [{ data: departmentRows }, { data: allWorkspaces }, { data: meetings }, { data: tasks }, { data: tagRows }, { data: viewerMemberships }] = await Promise.all([
    supabase
      .from('contact_departments')
      .select('id, stage, closed_reason, workspace_id, workspaces:workspace_id (name), lead_inquiries (reason, note, created_at)')
      .eq('contact_id', contact.id),
    supabase.from('workspaces').select('id, name').order('name'),
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
    supabase.from('contacts').select('tags'),
    supabase.from('workspace_members').select('workspace_id').eq('user_id', user.id),
  ]);

  const departments = (departmentRows || []).map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceName: row.workspaces?.name || 'מחלקה',
    stage: row.stage,
    closedReason: row.closed_reason,
    inquiries: [...(row.lead_inquiries || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
  }));

  const viewerWorkspaceIds = (viewerMemberships || []).map((m) => m.workspace_id);
  const visibleDepartmentNames = departments
    .filter((d) => viewerWorkspaceIds.includes(d.workspaceId))
    .map((d) => d.workspaceName);

  const existingTags = Array.from(new Set((tagRows || []).flatMap((c) => c.tags || []))).sort();
  const age = calculateAge(contact.birth_date);
  const hebrewDate = calculateHebrewDate(contact.birth_date);

  const outerStyle = isModal
    ? { padding: '24px' }
    : { maxWidth: 1000, margin: '0 auto', padding: '28px 24px' };

  return (
    <div style={outerStyle}>
      {!isModal && (
        <a href="/dashboard/contacts" style={{ fontSize: 12.5, color: '#6b6b6b', textDecoration: 'none' }}>
          ← חזרה לרשימת אנשי הקשר
        </a>
      )}

      {contact.frozen && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, margin: isModal ? '0 0 16px' : '16px 0 0' }}>
          ❄ איש הקשר מוקפא — לא ניתן לערוך, לשנות שלב, או להוסיף משימות עד הפשרה.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '16px 0 24px' }}>
        <div style={{
          width: 44, height: 44, background: '#0a0a0a', color: '#fff', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, flexShrink: 0,
        }}>
          {initials(contact.first, contact.last)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{contact.first} {contact.last}</div>
          <div style={{ fontSize: 12.5, color: '#6b6b6b', display: 'flex', gap: 6, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' }}>
            {visibleDepartmentNames.map((name) => <span key={name}>{name}</span>)}
            {visibleDepartmentNames.length === 0 && <span>לא משויך למחלקה שלך</span>}
          </div>
        </div>
        <ContactSettingsMenu contact={contact} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <NotConnectedButton label="חיוג" icon="📞" message="חיוג מתוך המערכת (ימות המשיח) — עדיין לא מחובר" />
        <NotConnectedButton label="וואטסאפ" icon="💬" message="שליחת וואטסאפ — עדיין לא מחובר" />
        <NotConnectedButton label="מייל" icon="✉️" message="שליחת מייל — עדיין לא מחובר" />
        <NotConnectedButton label="קביעת פגישה ביומן" icon="📅" message="חיבור ל-Google Calendar — עדיין לא מחובר" />
        <NotConnectedButton label="סיכום AI" icon="✨" message="סיכום שיחות ב-AI — עדיין לא מחובר" />
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: isModal ? 'wrap' : 'nowrap' }}>
        {/* עמודה שמאלית - מידע קבוע */}
        <div style={{ width: 240, flexShrink: 0 }}>
          <div style={{ background: '#f9f9f9', border: '1px solid #e5e5e5', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', marginBottom: 10 }}>
              פרטים אישיים
            </div>
            <InfoRow label="טלפון" value={contact.phone} />
            <InfoRow label="טלפון נוסף" value={contact.phone2} />
            <InfoRow label="מייל" value={contact.email} />
            <InfoRow label="מקור" value={contact.source} />
            <InfoRow label="ת.ז / מזהה" value={contact.idnum} />
            <InfoRow label="תאריך לידה" value={contact.birth_date ? new Date(contact.birth_date).toLocaleDateString('he-IL') : null} />
            <InfoRow label="גיל" value={age} />
            <InfoRow label="תאריך עברי" value={hebrewDate} />
            <InfoRow label="מגדר" value={contact.gender} />
            <InfoRow label="נוצר בתאריך" value={new Date(contact.created_at).toLocaleDateString('he-IL')} />
            <div style={{ marginTop: 12 }}>
              {(contact.tags || []).map((t) => <Tag key={t}>{t}</Tag>)}
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, padding: 16, marginTop: 12 }}>
            <DepartmentSwitcher
              contactId={contact.id}
              departments={departments}
              allWorkspaces={allWorkspaces || []}
              viewerWorkspaceIds={viewerWorkspaceIds}
              frozen={contact.frozen}
            />
          </div>

          <ContactEditForm contact={contact} existingTags={existingTags} />

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
            contactId={contact.id}
            toggleTaskAction={toggleTask}
            updateNotesAction={updateContactNotes}
            frozen={contact.frozen}
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
