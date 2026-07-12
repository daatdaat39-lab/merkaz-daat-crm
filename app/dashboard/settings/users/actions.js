'use server';

import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let pw = '';
  for (let i = 0; i < 10; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

async function getManagerContext() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles').select('current_workspace_id').eq('id', user.id).single();
  const workspaceId = profile?.current_workspace_id;
  if (!workspaceId) return null;

  const { data: membership } = await supabase
    .from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', user.id).single();
  if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) return null;

  return { user, workspaceId, role: membership.role };
}

// מונע מ-admin (שאינו owner) לגעת בחבר שהוא owner באותו workspace ספציפי, או להעניק תפקיד owner —
// אחרת admin יכול להשתלט על חשבון ה-owner או לקדם את עצמו
async function getTargetRole(admin, workspaceId, targetUserId) {
  const { data } = await admin
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', targetUserId)
    .single();
  return data?.role || null;
}

// בדיקה גלובלית (לא מוגבלת ל-workspace אחד): האם המשתמש הוא owner באיזשהו workspace.
// חייבים להשתמש בזו (ולא ב-getTargetRole המוגבל ל-workspace אחד) לפני פעולות שמשפיעות
// על החשבון כולו (סיסמה/מייל) — אחרת admin שאינו קשור בכלל ל-workspace של owner אחר
// יכול היה לאפס לו סיסמה רק כי הבדיקה חיפשה את התפקיד ב-workspace הלא נכון.
async function isOwnerAnywhere(admin, targetUserId) {
  const { data } = await admin
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', targetUserId)
    .eq('role', 'owner')
    .limit(1);
  return (data?.length || 0) > 0;
}

export async function inviteMemberWithPassword({ email, name, role }) {
  const ctx = await getManagerContext();
  if (!ctx) return { error: 'אין לך הרשאה להזמין משתמשים' };
  if (!email) return { error: 'יש להזין כתובת אימייל' };
  if (role === 'owner' && ctx.role !== 'owner') return { error: 'רק owner יכול להזמין משתמש בתפקיד owner' };

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { error: e.message };
  }

  const tempPassword = generatePassword();
  const displayName = (name || email.split('@')[0]).trim();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { name: displayName },
  });

  let userId = created?.user?.id;
  let isNewUser = true;

  if (createError) {
    const { data: list, error: listError } = await admin.auth.admin.listUsers();
    if (listError) return { error: createError.message };
    const existing = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!existing) return { error: createError.message };
    userId = existing.id;
    isNewUser = false;
  }

  if (ctx.role !== 'owner') {
    const existingRole = await getTargetRole(admin, ctx.workspaceId, userId);
    if (existingRole === 'owner') return { error: 'רק owner יכול לשנות הרשאות של owner קיים' };
  }

  // רק למשתמש חדש קובעים current_workspace_id אוטומטית - למשתמש קיים לא
  // רוצים "לגנוב" לו את המחלקה הפעילה כרגע רק כי הוזמן גם למחלקה נוספת
  const profileUpsert = { id: userId, name: displayName, role: 'user', level: 'rep' };
  if (isNewUser) profileUpsert.current_workspace_id = ctx.workspaceId;

  const { error: profileError } = await admin
    .from('profiles')
    .upsert(profileUpsert, { onConflict: 'id' });
  if (profileError) return { error: profileError.message };

  const { error: memberError } = await admin
    .from('workspace_members')
    .upsert({ workspace_id: ctx.workspaceId, user_id: userId, role: role || 'member' }, { onConflict: 'workspace_id,user_id' });
  if (memberError) return { error: memberError.message };

  return {
    success: true,
    email,
    name: displayName,
    password: isNewUser ? tempPassword : null,
    isNewUser,
  };
}

export async function resetMemberPassword(targetUserId) {
  const ctx = await getManagerContext();
  if (!ctx) return { error: 'אין לך הרשאה' };

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { error: e.message };
  }

  if (ctx.role !== 'owner' && await isOwnerAnywhere(admin, targetUserId)) {
    return { error: 'רק owner יכול לאפס סיסמה של owner' };
  }

  const tempPassword = generatePassword();
  const { error } = await admin.auth.admin.updateUserById(targetUserId, { password: tempPassword });
  if (error) return { error: error.message };

  return { success: true, password: tempPassword };
}

export async function setMemberPassword(targetUserId, newPassword) {
  const ctx = await getManagerContext();
  if (!ctx) return { error: 'אין לך הרשאה' };
  if (!newPassword || newPassword.length < 6) return { error: 'הסיסמה חייבת להכיל לפחות 6 תווים' };

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { error: e.message };
  }

  if (ctx.role !== 'owner' && await isOwnerAnywhere(admin, targetUserId)) {
    return { error: 'רק owner יכול לקבוע סיסמה ל-owner' };
  }

  const { error } = await admin.auth.admin.updateUserById(targetUserId, { password: newPassword });
  if (error) return { error: error.message };

  return { success: true, password: newPassword };
}

export async function updateMemberName(targetUserId, name) {
  const ctx = await getManagerContext();
  if (!ctx) return { error: 'אין לך הרשאה' };
  if (!name || !name.trim()) return { error: 'יש להזין שם' };

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { error: e.message };
  }

  const { error } = await admin.from('profiles').update({ name: name.trim() }).eq('id', targetUserId);
  if (error) return { error: error.message };

  return { success: true, name: name.trim() };
}

export async function changeMemberEmail(targetUserId, newEmail) {
  const ctx = await getManagerContext();
  if (!ctx) return { error: 'אין לך הרשאה' };
  if (!newEmail || !newEmail.includes('@')) return { error: 'כתובת אימייל לא תקינה' };

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { error: e.message };
  }

  if (ctx.role !== 'owner' && await isOwnerAnywhere(admin, targetUserId)) {
    return { error: 'רק owner יכול לשנות את כתובת המייל של owner' };
  }

  const { error } = await admin.auth.admin.updateUserById(targetUserId, {
    email: newEmail,
    email_confirm: true,
  });
  if (error) return { error: error.message };

  return { success: true, email: newEmail };
}

// קובע/מסיר חברות של משתמש ב-workspace ספציפי (מזוהה מפורשות, לא מוסק מה-workspace
// הנוכחי של המבצע) — כדי לאפשר ל-owner לנהל שיוך מחלקות מכל מסך אחד.
// role: 'member' | 'admin' | 'owner' | null (null = הסרה מה-workspace הזה)
export async function setMembership(targetUserId, workspaceId, role) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'אין לך הרשאה' };
  if (targetUserId === user.id && role !== 'owner') {
    return { error: 'אי אפשר לשנות/להסיר את ההרשאות של עצמך' };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { error: e.message };
  }

  const actorRole = await getTargetRole(admin, workspaceId, user.id);
  if (actorRole !== 'owner' && actorRole !== 'admin') {
    return { error: 'אין לך הרשאה לנהל את המחלקה הזו' };
  }

  if (actorRole !== 'owner') {
    if (role === 'owner') return { error: 'רק owner יכול להעניק תפקיד owner' };
    const targetCurrentRole = await getTargetRole(admin, workspaceId, targetUserId);
    if (targetCurrentRole === 'owner') return { error: 'רק owner יכול לשנות הרשאות של owner במחלקה זו' };
  }

  if (role === null) {
    const { error } = await admin
      .from('workspace_members')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('user_id', targetUserId);
    if (error) return { error: error.message };
    return { success: true };
  }

  const { error } = await admin
    .from('workspace_members')
    .upsert({ workspace_id: workspaceId, user_id: targetUserId, role }, { onConflict: 'workspace_id,user_id' });
  if (error) return { error: error.message };

  return { success: true };
}
