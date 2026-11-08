// יומן ביקורת קבוע (audit_events, migration 0184) - כתיבה תמיד דרך ה-admin
// client כדי שרישום לא ייחסם ב-RLS וכדי שכשל ביומן לא ישבור את הפעולה
// עצמה (חסימת פעולת ניהול בגלל תקלה ביומן גרועה מיומן חסר). אין כאן
// עדכון/מחיקה - היומן הוא append-only גם ברמת ה-DB.
import { createAdminClient } from '../../../lib/supabase/admin';

export async function logAudit({ actorId, action, targetType = null, targetId = null, workspaceId = null, detail = {} }) {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('audit_events').insert({
      actor_id: actorId || null,
      action,
      target_type: targetType,
      target_id: targetId ? String(targetId) : null,
      workspace_id: workspaceId,
      detail,
    });
    if (error) console.error('audit log insert failed:', error.message);
  } catch (e) {
    console.error('audit log failed:', e?.message || e);
  }
}

// תוויות בעברית לפעולות ביומן (לתצוגה במסך ניהול המשתמשים)
export const AUDIT_ACTION_LABELS = {
  'user.invite': 'יצירת משתמש',
  'user.password_reset': 'איפוס סיסמה (אקראית)',
  'user.password_set': 'קביעת סיסמה',
  'user.email_change': 'שינוי אימייל',
  'user.membership_set': 'שינוי הרשאה במחלקה',
  'user.suspend': 'השבתת משתמש',
  'user.reactivate': 'הפעלת משתמש מחדש',
  'contacts.export': 'ייצוא אנשי קשר',
};
