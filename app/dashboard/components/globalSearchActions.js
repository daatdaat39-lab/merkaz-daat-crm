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
  // חיפוש-גמיש - מפוצל-למילים (כמו-כבר-ב-ContactsBoard.js), לא-עוד
  // ilike-על-המחרוזת-השלמה-כנגד-עמודה-בודדת: "ישראל ערד" (שם+משפחה)
  // לא-יכול-היה-להתאים-לאף-עמודה-בודדת-אחת (first/last נפרדים) - מריצים
  // ilike לכל-מילה-בנפרד על first/last, מאחדים-מועמדים, ואז-דורשים-
  // שכל-מילה-אכן-מופיעה-ב-first+last (AND, בלי-תלות-בסדר).
  const words = q.split(/\s+/).filter(Boolean);
  const contactSelect = 'id, first, last, phone, email, contact_departments (stage, workspaces:workspace_id (name))';
  // שאילתות נפרדות ומפורמטות במקום .or() בנוי ממחרוזת - ר' הערה ב-checkPossibleDuplicates ב-contacts/actions.js
  const [contactResults, { data: tasks }] = await Promise.all([
    Promise.all([
      ...words.flatMap((w) => [
        supabase.from('contacts').select(contactSelect).ilike('first', `%${w}%`).limit(10),
        supabase.from('contacts').select(contactSelect).ilike('last', `%${w}%`).limit(10),
      ]),
      supabase.from('contacts').select(contactSelect).ilike('phone', like).limit(8),
      supabase.from('contacts').select(contactSelect).ilike('email', like).limit(8),
    ]),
    supabase
      .from('tasks')
      .select('id, title, due_date, done, contact_id, contacts:contact_id (first, last)')
      .ilike('title', like)
      .limit(8),
  ]);

  const candidatesById = new Map();
  for (const { data } of contactResults) {
    for (const row of data || []) {
      if (!candidatesById.has(row.id)) candidatesById.set(row.id, row);
    }
  }
  // דרישת-AND-מפורשת רק-על-מועמדים-שכבר-הגיעו-מה-ilike-ים-לפי-מילה
  // (טלפון/מייל כבר-תואמים-את-המחרוזת-השלמה, לא-צריכים-את-הבדיקה-הזו).
  const contacts = Array.from(candidatesById.values())
    .filter((c) => {
      const fullName = `${c.first} ${c.last}`.toLowerCase();
      return words.every((w) => fullName.includes(w.toLowerCase()))
        || (c.phone || '').includes(q) || (c.email || '').toLowerCase().includes(q.toLowerCase());
    })
    .slice(0, 8);

  return {
    contacts: contacts.map((c) => ({
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
