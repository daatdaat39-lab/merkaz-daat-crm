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

// מונע מ-admin (שאינו owner) לגעת בחבר שהוא owner, או להעניק תפקיד owner למישהו —
// אחרת admin יכול להשתלט על חשבון ה-owner (סיסמה/מייל) או לקדם את עצמו
async function getTargetRole(admin, workspaceId, targetUserId) {
  const { data } = await admin
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', targetUserId)
    .single();
  return data?.role || null;
}

export async function inviteMemberWithPassword({ email, name, role, dept }) {
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

  const { error: profileError } = await admin
    .from('profiles')
    .upsert({ id: userId, name: displayName, role: 'user', level: 'rep', dept: dept || null }, { onConflict: 'id' });
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

  if (ctx.role !== 'owner') {
    const targetRole = await getTargetRole(admin, ctx.workspaceId, targetUserId);
    if (targetRole === 'owner') return { error: 'רק owner יכול לאפס סיסמה של owner אחר' };
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

  if (ctx.role !== 'owner') {
    const targetRole = await getTargetRole(admin, ctx.workspaceId, targetUserId);
    if (targetRole === 'owner') return { error: 'רק owner יכול לקבוע סיסמה ל-owner אחר' };
  }

  const { error } = await admin.auth.admin.updateUserById(targetUserId, { password: newPassword });
  if (error) return { error: error.message };

  return { success: true, password: newPassword };
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

  if (ctx.role !== 'owner') {
    const targetRole = await getTargetRole(admin, ctx.workspaceId, targetUserId);
    if (targetRole === 'owner') return { error: 'רק owner יכול לשנות את כתובת המייל של owner אחר' };
  }

  const { error } = await admin.auth.admin.updateUserById(targetUserId, {
    email: newEmail,
    email_confirm: true,
  });
  if (error) return { error: error.message };

  return { success: true, email: newEmail };
}

export async function changeMemberRole(targetUserId, role) {
  const ctx = await getManagerContext();
  if (!ctx) return { error: 'אין לך הרשאה' };

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { error: e.message };
  }

  if (ctx.role !== 'owner') {
    if (role === 'owner') return { error: 'רק owner יכול להעניק תפקיד owner' };
    const targetRole = await getTargetRole(admin, ctx.workspaceId, targetUserId);
    if (targetRole === 'owner') return { error: 'רק owner יכול לשנות תפקיד של owner אחר' };
  }

  const { error } = await admin
    .from('workspace_members')
    .update({ role })
    .eq('workspace_id', ctx.workspaceId)
    .eq('user_id', targetUserId);
  if (error) return { error: error.message };

  return { success: true };
}

export async function updateMemberDept(targetUserId, dept) {
  const ctx = await getManagerContext();
  if (!ctx) return { error: 'אין לך הרשאה' };

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { error: e.message };
  }

  const { error } = await admin
    .from('profiles')
    .update({ dept: dept || null })
    .eq('id', targetUserId);
  if (error) return { error: error.message };

  return { success: true };
}

export async function removeMemberFromWorkspace(targetUserId) {
  const ctx = await getManagerContext();
  if (!ctx) return { error: 'אין לך הרשאה' };
  if (targetUserId === ctx.user.id) return { error: 'אי אפשר להסיר את עצמך' };

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { error: e.message };
  }

  if (ctx.role !== 'owner') {
    const targetRole = await getTargetRole(admin, ctx.workspaceId, targetUserId);
    if (targetRole === 'owner') return { error: 'רק owner יכול להסיר owner אחר' };
  }

  const { error } = await admin
    .from('workspace_members')
    .delete()
    .eq('workspace_id', ctx.workspaceId)
    .eq('user_id', targetUserId);
  if (error) return { error: error.message };

  return { success: true };
}
