'use server';

import { createClient } from '../../../lib/supabase/server';

// חיפוש גלובלי מסרגל העליון - אנשי קשר (כולל שיוך למחלקות/שלבים, שמכסה
// גם "לידים" בהקשר הרלוונטי) ומשימות, בבת אחת. מוגבל לכמה תוצאות בכל
// קטגוריה כדי שהתפריט הנפתח יישאר קצר וממוקד.
export async function globalSearch(query) {
  const q = (query || '').trim();
  if (q.length < 2) return { contacts: [], tasks: [] };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { contacts: [], tasks: [] };

  const like = `%${q}%`;
  const [{ data: contacts }, { data: tasks }] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, first, last, phone, email, contact_departments (stage, workspaces:workspace_id (name))')
      .or(`first.ilike.${like},last.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
      .limit(8),
    supabase
      .from('tasks')
      .select('id, title, due_date, done, contact_id, contacts:contact_id (first, last)')
      .ilike('title', like)
      .limit(8),
  ]);

  return {
    contacts: (contacts || []).map((c) => ({
      id: c.id,
      name: `${c.first} ${c.last}`,
      phone: c.phone,
      email: c.email,
      departments: (c.contact_departments || []).map((d) => ({ name: d.workspaces?.name, stage: d.stage })),
    })),
    tasks: (tasks || []).map((t) => ({
      id: t.id,
      title: t.title,
      due_date: t.due_date,
      done: t.done,
      contactId: t.contact_id,
      contactName: t.contacts ? `${t.contacts.first} ${t.contacts.last}` : null,
    })),
  };
}
