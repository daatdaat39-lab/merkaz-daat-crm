'use server';

import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfAnyWorkspace } from '../../lib/contactGuards';

// courses הוא קטלוג גלובלי (לא per-מחלקה, ר' migration 0148) - owner/admin
// של כל מחלקה יכול לנהל אותו, אותו דפוס-הרשאה כמו settings/reference-content.
async function requireManager() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const allowed = await isManagerOfAnyWorkspace(supabase, user.id);
  if (!allowed) return { error: 'רק owner/admin יכול לערוך את קטלוג הקורסים' };
  return { supabase };
}

export async function createCourse({ name, code, description, price, durationType, durationDays }) {
  const ctx = await requireManager();
  if (ctx.error) return ctx;
  const { supabase } = ctx;
  const cleanName = (name || '').trim();
  if (!cleanName) return { error: 'יש להזין שם קורס' };

  const { count } = await supabase.from('courses').select('id', { count: 'exact', head: true });
  const { error } = await supabase.from('courses').insert({
    name: cleanName,
    code: (code || '').trim() || null,
    description: (description || '').trim() || null,
    price: price === '' || price === null || price === undefined ? null : Number(price),
    duration_type: durationType || 'fixed_dates',
    duration_days: durationType === 'duration_from_purchase' && durationDays ? Number(durationDays) : null,
    sort_order: (count || 0) * 10,
  });
  if (error) return { error: error.message };
  return { success: true };
}

export async function updateCourse(id, { name, code, description, price, durationType, durationDays, isActive }) {
  const ctx = await requireManager();
  if (ctx.error) return ctx;
  const { supabase } = ctx;
  const changes = {};
  if (name !== undefined) {
    if (!name.trim()) return { error: 'שם קורס לא יכול להיות ריק' };
    changes.name = name.trim();
  }
  if (code !== undefined) changes.code = code.trim() || null;
  if (description !== undefined) changes.description = description.trim() || null;
  if (price !== undefined) changes.price = price === '' ? null : Number(price);
  if (durationType !== undefined) changes.duration_type = durationType;
  if (durationDays !== undefined) changes.duration_days = durationType === 'duration_from_purchase' && durationDays ? Number(durationDays) : null;
  if (isActive !== undefined) changes.is_active = isActive;

  const { error } = await supabase.from('courses').update(changes).eq('id', id);
  if (error) return { error: error.message };
  return { success: true };
}
