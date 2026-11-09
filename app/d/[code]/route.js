import { createAdminClient } from '../../../lib/supabase/admin';
import { isShortCode } from '../../dashboard/lib/shortCode';
import { loadChecklistByShortCode, registerRedirectResponse } from '../../dashboard/lib/registrationLinks';

export const dynamic = 'force-dynamic';

// קישור קצר "פרטים בלבד": עמוד הרישום בלי שלב התשלום (/register/<טוקן>?m=details).
export async function GET(request, { params }) {
  const row = isShortCode(params.code) ? await loadChecklistByShortCode(createAdminClient(), params.code) : null;
  return registerRedirectResponse(request, row, 'details');
}
