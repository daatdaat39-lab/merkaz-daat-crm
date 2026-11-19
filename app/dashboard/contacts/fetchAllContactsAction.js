'use server';

import { createClient } from '../../../lib/supabase/server';
import { fetchContactsPaged, shapeContacts } from './contactsListData';

// נקראת מ-ContactsBoard.js (לקוח) ברגע-שמשתמשים-בחיפוש/סינון בפעם-
// הראשונה בביקור-הנוכחי בעמוד - page.js טוען-כברירת-מחדל רק את-אנשי-
// הקשר של-המחלקה-הפעילה (מהיר); זו-הפעולה-שמביאה-את-כל-השאר, רק-כש-
// באמת-צריך. אותה-הגנה-כמו-כל-שאר-המערכת (auth.getUser() + RLS) - אין
// כאן חריגת-הרשאה, רק דחיית-הטעינה.
export async function fetchAllContactsAction() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const rows = await fetchContactsPaged(supabase, null);
  return shapeContacts(rows);
}
