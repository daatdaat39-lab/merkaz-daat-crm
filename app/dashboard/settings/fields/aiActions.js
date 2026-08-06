'use server';

// "עם AI" ליצירת שדה - שלב ההצעה בלבד (לא יוצר כלום). מריץ ולידציה
// מחמירה על מה שה-AI החזיר: מפתחות שדה מקוריים בדיוק כפי שנשלחו, נוסחה
// שעוברת פארסינג בטוח (safeExpression.js, בלי eval). אם משהו לא תקין -
// זה הופך לשאלת הבהרה נוספת במקום הצעה שבורה. יצירת השדה בפועל עדיין
// קוראת ל-createField הרגיל (actions.js), רק אחרי אישור מפורש בממשק.
import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfWorkspace } from '../../lib/contactGuards';
import { suggestFieldFromDescription } from '../../../../lib/ai/suggestFieldFromDescription';
import { parseFormula, collectFieldRefs } from '../../lib/safeExpression';

const VALID_TYPES = new Set(['text', 'number', 'date', 'select', 'computed']);

async function requireManager(workspaceId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const allowed = await isManagerOfWorkspace(supabase, user.id, workspaceId);
  if (!allowed) return { error: 'רק owner/admin של המחלקה יכול ליצור שדות' };
  return { supabase };
}

function sanitizeKey(raw) {
  return (raw || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

export async function suggestFieldConfig(workspaceId, conversation) {
  const ctx = await requireManager(workspaceId);
  if (ctx.error) return ctx;
  const { supabase } = ctx;

  const { data: workspace } = await supabase.from('workspaces').select('name').eq('id', workspaceId).single();
  const { data: existingRows } = await supabase.from('workspace_extra_fields')
    .select('field_key, label, type').eq('workspace_id', workspaceId);
  const existingFields = (existingRows || []).map((f) => ({ key: f.field_key, label: f.label, type: f.type }));
  const existingKeys = new Set(existingFields.map((f) => f.key));

  let result;
  try {
    result = await suggestFieldFromDescription({ workspaceName: workspace?.name || '', existingFields, conversation });
  } catch (e) {
    return { error: e.message || 'הבקשה ל-AI נכשלה' };
  }

  if (result.needsClarification) return { needsClarification: true, question: result.question };

  const key = sanitizeKey(result.fieldKey) || 'field';
  const finalKey = existingKeys.has(key) ? `${key}_2` : key;
  const label = (result.label || '').trim();
  const type = VALID_TYPES.has(result.type) ? result.type : 'text';

  if (!label) {
    return { needsClarification: true, question: 'איך תרצה לקרוא לשדה הזה (תווית בעברית)?' };
  }

  if (type === 'computed') {
    if (!result.expression) {
      return { needsClarification: true, question: 'איזה חישוב בדיוק תרצה שהשדה הזה יבצע?' };
    }
    let ast;
    try {
      ast = parseFormula(result.expression);
    } catch (e) {
      // חשוב: מחזירים את הנוסחה שכשלה ואת שגיאת הפארסינג המדויקת כחלק
      // מהשאלה - זו נכנסת בחזרה להיסטוריית השיחה (ר' AiFieldWizard.js),
      // כך שבניסיון הבא ה-AI *רואה* מה בדיוק הוא כתב ולמה זה נכשל, במקום
      // לקבל שוב שאלה כללית וסתמית ולנחש עיוור בלולאה אינסופית.
      return {
        needsClarification: true,
        question: `ניסיתי ליצור את הנוסחה "${result.expression}" אבל היא לא תקינה (שגיאה: ${e.message}). חשוב: יש להשתמש אך ורק במפתחות הטכניים המדויקים מהרשימה שסופקה (לא בתוויות בעברית, לא בנקודות "..."), ולציין כל שדה בנפרד בתור ארגומנט משלו. אפשר לנסות שוב?`,
      };
    }
    const refs = Array.from(collectFieldRefs(ast));
    const unknownRefs = refs.filter((r) => r !== 'today' && !existingKeys.has(r));
    if (unknownRefs.length > 0) {
      return {
        needsClarification: true,
        question: `הנוסחה "${result.expression}" מפנה לשדות שלא קיימים בדיוק כך: ${unknownRefs.map((r) => `"${r}"`).join(', ')}. יש להשתמש רק במפתחות הטכניים המדויקים מהרשימה שסופקה למעלה (העתקה מדויקת, לא תרגום של התווית). אפשר לנסות שוב עם המפתחות הנכונים?`,
      };
    }
    return {
      needsClarification: false,
      suggestion: { fieldKey: finalKey, label, type: 'computed', options: { formula: 'expression', expression: result.expression, unit: result.unit || null }, explanation: result.explanation },
    };
  }

  return {
    needsClarification: false,
    suggestion: { fieldKey: finalKey, label, type, options: type === 'select' ? result.options : [], explanation: result.explanation },
  };
}
