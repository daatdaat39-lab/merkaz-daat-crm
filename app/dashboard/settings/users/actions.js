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

  return { user, workspaceId };
}

export async function inviteMemberWithPassword({ email, name, role }) {
  const ctx = await getManagerContext();
  if (!ctx) return { error: 'אין לך הרשאה להזמין משתמשים' };
  if (!email) return { error: 'יש להזין כתובת אימייל' };

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

  const { error: profileError } = await admin
    .from('profiles')
    .upsert({ id: userId, name: displayName, role: 'user', level: 'rep' }, { onConflict: 'id' });
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

  const tempPassword = generatePassword();
  const { error } = await admin.auth.admin.updateUserById(targetUserId, { password: tempPassword });
  if (error) return { error: error.message };

  return { success: true, password: tempPassword };
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

  const { error } = await admin
    .from('workspace_members')
    .update({ role })
    .eq('workspace_id', ctx.workspaceId)
    .eq('user_id', targetUserId);
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

  const { error } = await admin
    .from('workspace_members')
    .delete()
    .eq('workspace_id', ctx.workspaceId)
    .eq('user_id', targetUserId);
  if (error) return { error: error.message };

  return { success: true };
}
