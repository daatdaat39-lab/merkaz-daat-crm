import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import WhatsappPendingClient from './WhatsappPendingClient';

// רשימת שיחות WhatsApp שממתינות לתגובה שלנו - כלומר ההודעה האחרונה
// בשיחה (לכל מספר טלפון) הגיעה מהלקוח ועדיין לא נשלחה תשובה אחריה.
// server-page-דק שמעביר-את-הנתונים ל-component-קליינט (WhatsappPendingClient)
// שתומך-ביצירת-איש-קשר-מהיר ותגובה-מהירה - בלי-שתי-היכולות-האלה אפשר-היה
// להישאר server-component-טהור, אבל הן-דורשות-אינטראקטיביות.
export default async function WhatsappPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: rows }, { data: workspaces }, { data: profile }] = await Promise.all([
    supabase
      .from('sent_whatsapp')
      .select('id, contact_id, workspace_id, phone, direction, kind, message, reason, sent_at, read_at, contacts:contact_id (id, first, last)')
      .order('sent_at', { ascending: false })
      .limit(500),
    supabase.from('workspaces').select('id, name').order('created_at', { ascending: true }),
    supabase.from('profiles').select('current_workspace_id').eq('id', user.id).single(),
  ]);

  const latestByPhone = new Map();
  for (const row of rows || []) {
    if (!latestByPhone.has(row.phone)) latestByPhone.set(row.phone, row);
  }
  const pending = [...latestByPhone.values()].filter((r) => r.direction === 'in');

  return (
    <WhatsappPendingClient
      pending={pending}
      workspaces={workspaces || []}
      defaultWorkspaceId={profile?.current_workspace_id || ''}
    />
  );
}
