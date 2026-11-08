'use server';

import crypto from 'crypto';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { logAudit } from '../../lib/audit';

// crypto.randomInt ולא Math.random - סיסמה זמנית היא סוד, ו-Math.random אינו
// מחולל קריפטוגרפי (ניתן לחיזוי). אורך 12 כדי לעמוד גם במינימום 10 שנקבע
// ל-setMemberPassword.
const MIN_PASSWORD_LENGTH = 10;
function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let pw = '';
  for (let i = 0; i < 12; i++) pw += chars[crypto.randomInt(chars.length)];
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

// admin (שאינו owner) רשאי לנהל רק חברים של המחלקה שהוא מנהל כרגע - בלי הבדיקה
// הזו אפשר היה לאפס סיסמה/לשנות מייל לכל משתמש בארגון רק על סמך ה-id שלו
// (השתלטות על חשבונות בין-מחלקתית). owner רשאי לנהל כל משתמש, כי מסך
// "כל המשתמשים" מיועד לו (ר' AllUsersTable).
async function checkTargetInScope(admin, ctx, targetUserId) {
  if (!targetUserId) return 'משתמש לא תקין';
  if (ctx.role === 'owner') return null;
  const role = await getTargetRole(admin, ctx.workspaceId, targetUserId);
  if (!role) return 'אפשר לנהל רק חברים של המחלקה שלך';
  return null;
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

  // פרופיל נכתב רק למשתמש חדש (כולל current_workspace_id) - משתמש קיים לא
  // נוגעים בפרופיל שלו בכלל: לא "גונבים" לו את המחלקה הפעילה, ובעיקר לא
  // מאפשרים ל-admin של מחלקה אחת לדרוס שם/תפקיד של משתמש מחלקה אחרת רק
  // בהזמנה לפי מייל.
  if (isNewUser) {
    const { error: profileError } = await admin
      .from('profiles')
      .upsert({ id: userId, name: displayName, role: 'user', level: 'rep', current_workspace_id: ctx.workspaceId, must_change_password: true }, { onConflict: 'id' });
    if (profileError) return { error: profileError.message };
  }

  const { error: memberError } = await admin
    .from('workspace_members')
    .upsert({ workspace_id: ctx.workspaceId, user_id: userId, role: role || 'member' }, { onConflict: 'workspace_id,user_id' });
  if (memberError) return { error: memberError.message };

  await logAudit({ actorId: ctx.user.id, action: 'user.invite', targetType: 'user', targetId: userId, workspaceId: ctx.workspaceId, detail: { email, role: role || 'member', isNewUser } });

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

  const scopeError = await checkTargetInScope(admin, ctx, targetUserId);
  if (scopeError) return { error: scopeError };
  if (ctx.role !== 'owner' && await isOwnerAnywhere(admin, targetUserId)) {
    return { error: 'רק owner יכול לאפס סיסמה של owner' };
  }

  const tempPassword = generatePassword();
  const { error } = await admin.auth.admin.updateUserById(targetUserId, { password: tempPassword });
  if (error) return { error: error.message };
  // סיסמה זמנית שנמסרת בהודעה חייבת להיות מוחלפת בכניסה הראשונה
  await admin.from('profiles').update({ must_change_password: true }).eq('id', targetUserId);
  await logAudit({ actorId: ctx.user.id, action: 'user.password_reset', targetType: 'user', targetId: targetUserId, workspaceId: ctx.workspaceId });

  return { success: true, password: tempPassword };
}

export async function setMemberPassword(targetUserId, newPassword) {
  const ctx = await getManagerContext();
  if (!ctx) return { error: 'אין לך הרשאה' };
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) return { error: `הסיסמה חייבת להכיל לפחות ${MIN_PASSWORD_LENGTH} תווים` };

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { error: e.message };
  }

  const scopeError = await checkTargetInScope(admin, ctx, targetUserId);
  if (scopeError) return { error: scopeError };
  if (ctx.role !== 'owner' && await isOwnerAnywhere(admin, targetUserId)) {
    return { error: 'רק owner יכול לקבוע סיסמה ל-owner' };
  }

  const { error } = await admin.auth.admin.updateUserById(targetUserId, { password: newPassword });
  if (error) return { error: error.message };
  await admin.from('profiles').update({ must_change_password: true }).eq('id', targetUserId);
  await logAudit({ actorId: ctx.user.id, action: 'user.password_set', targetType: 'user', targetId: targetUserId, workspaceId: ctx.workspaceId });

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

  const scopeError = await checkTargetInScope(admin, ctx, targetUserId);
  if (scopeError) return { error: scopeError };

  const { error } = await admin.from('profiles').update({ name: name.trim() }).eq('id', targetUserId);
  if (error) return { error: error.message };

  return { success: true, name: name.trim() };
}

// שלוחת-015 של הנציג (חיוג-יזום, ר' lib/hallo015/clickToDial.js) - הערך
// הארוך מרשימת "Telephone lines" בפאנל של 015 (למשל "5668598446"),
// לא השלוחה-הקצרה. ריק = חיוג-יזום לא-זמין לנציג הזה (כפתור-נופל-חזרה
// ל-NotConnectedButton).
export async function updateMemberExtension(targetUserId, extension) {
  const ctx = await getManagerContext();
  if (!ctx) return { error: 'אין לך הרשאה' };

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { error: e.message };
  }

  const scopeError = await checkTargetInScope(admin, ctx, targetUserId);
  if (scopeError) return { error: scopeError };

  const value = (extension || '').trim() || null;
  const { error } = await admin.from('profiles').update({ hallo015_extension: value }).eq('id', targetUserId);
  if (error) return { error: error.message };

  return { success: true, extension: value };
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

  const scopeError = await checkTargetInScope(admin, ctx, targetUserId);
  if (scopeError) return { error: scopeError };
  if (ctx.role !== 'owner' && await isOwnerAnywhere(admin, targetUserId)) {
    return { error: 'רק owner יכול לשנות את כתובת המייל של owner' };
  }

  const { error } = await admin.auth.admin.updateUserById(targetUserId, {
    email: newEmail,
    email_confirm: true,
  });
  if (error) return { error: error.message };
  await logAudit({ actorId: ctx.user.id, action: 'user.email_change', targetType: 'user', targetId: targetUserId, workspaceId: ctx.workspaceId, detail: { newEmail } });

  return { success: true, email: newEmail };
}

// קובע/מסיר חברות של משתמש ב-workspace ספציפי (מזוהה מפורשות, לא מוסק מה-workspace
// הנוכחי של המבצע) — כדי לאפשר ל-owner לנהל שיוך מחלקות מכל מסך אחד.
// role: 'member' | 'telemarketer' | 'admin' | 'owner' | null (null = הסרה מה-workspace הזה)
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
    await logAudit({ actorId: user.id, action: 'user.membership_set', targetType: 'user', targetId: targetUserId, workspaceId, detail: { role: null } });
    return { success: true };
  }

  const { error } = await admin
    .from('workspace_members')
    .upsert({ workspace_id: workspaceId, user_id: targetUserId, role }, { onConflict: 'workspace_id,user_id' });
  if (error) return { error: error.message };
  await logAudit({ actorId: user.id, action: 'user.membership_set', targetType: 'user', targetId: targetUserId, workspaceId, detail: { role } });

  return { success: true };
}

// ---------- השבתה / הפעלה מחדש (offboarding) ----------
// השבתה במקום מחיקה: ההיסטוריה של המשתמש (פעילות, לידים שטיפל בהם) נשמרת,
// אבל הוא לא יכול להתחבר ולא רואה כלום. שני מנגנונים יחד: חסימה ברמת
// Supabase Auth (ban - אי אפשר להתחבר או לחדש סשן) + profiles.status =
// 'suspended' שנבדק ב-middleware בכל בקשה, כך שגם סשן פתוח נחסם מיד
// (בלי לחכות לפקיעת ה-access token).
export async function suspendUser(targetUserId, { reassignToUserId } = {}) {
  const ctx = await getManagerContext();
  if (!ctx) return { error: 'אין לך הרשאה' };
  if (targetUserId === ctx.user.id) return { error: 'אי אפשר להשבית את החשבון של עצמך' };

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { error: e.message };
  }

  const scopeError = await checkTargetInScope(admin, ctx, targetUserId);
  if (scopeError) return { error: scopeError };
  if (ctx.role !== 'owner' && await isOwnerAnywhere(admin, targetUserId)) {
    return { error: 'רק owner יכול להשבית owner' };
  }

  // העברת עבודה פתוחה (לידים, קריאות שירות פתוחות, משימות פתוחות) לנציג אחר
  // לפני ההשבתה - בלי זה הם נשארים משויכים לחשבון שאיש לא רואה.
  let reassigned = null;
  if (reassignToUserId) {
    if (reassignToUserId === targetUserId) return { error: 'אי אפשר להעביר את העבודה לאותו משתמש' };
    const { data: receiver } = await admin.from('profiles').select('id, status').eq('id', reassignToUserId).maybeSingle();
    if (!receiver || receiver.status === 'suspended') return { error: 'המשתמש שנבחר לקבלת העבודה לא זמין' };

    const [leads, cases, tasks] = await Promise.all([
      admin.from('contact_departments').update({ agent_id: reassignToUserId }).eq('agent_id', targetUserId).eq('opened_process', true).select('id'),
      admin.from('service_cases').update({ assigned_to: reassignToUserId }).eq('assigned_to', targetUserId).neq('status', 'closed').select('id'),
      admin.from('tasks').update({ assigned_to: reassignToUserId }).eq('assigned_to', targetUserId).eq('done', false).select('id'),
    ]);
    const firstError = leads.error || cases.error || tasks.error;
    if (firstError) return { error: 'העברת העבודה נכשלה: ' + firstError.message };
    reassigned = { leads: leads.data?.length || 0, cases: cases.data?.length || 0, tasks: tasks.data?.length || 0 };
  }

  const { error: banError } = await admin.auth.admin.updateUserById(targetUserId, { ban_duration: '876000h' });
  if (banError) return { error: banError.message };
  const { error: profileError } = await admin
    .from('profiles')
    .update({ status: 'suspended', suspended_at: new Date().toISOString() })
    .eq('id', targetUserId);
  if (profileError) return { error: profileError.message };

  await logAudit({
    actorId: ctx.user.id, action: 'user.suspend', targetType: 'user', targetId: targetUserId,
    workspaceId: ctx.workspaceId, detail: { reassignedTo: reassignToUserId || null, reassigned },
  });
  return { success: true, reassigned };
}

export async function reactivateUser(targetUserId) {
  const ctx = await getManagerContext();
  if (!ctx) return { error: 'אין לך הרשאה' };

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { error: e.message };
  }

  const scopeError = await checkTargetInScope(admin, ctx, targetUserId);
  if (scopeError) return { error: scopeError };

  const { error: banError } = await admin.auth.admin.updateUserById(targetUserId, { ban_duration: 'none' });
  if (banError) return { error: banError.message };
  const { error: profileError } = await admin
    .from('profiles')
    .update({ status: 'active', suspended_at: null })
    .eq('id', targetUserId);
  if (profileError) return { error: profileError.message };

  await logAudit({ actorId: ctx.user.id, action: 'user.reactivate', targetType: 'user', targetId: targetUserId, workspaceId: ctx.workspaceId });
  return { success: true };
}
