import { createAdminClient } from '../../../lib/supabase/admin';
import { isShortCode } from '../../dashboard/lib/shortCode';
import { loadChecklistByShortCode, paymentRedirectResponse } from '../../dashboard/lib/registrationLinks';

export const dynamic = 'force-dynamic';

// קישור קצר "תשלום בלבד": מפנה ישר לעמוד התשלום האישי של קשר.
export async function GET(request, { params }) {
  const admin = createAdminClient();
  const row = isShortCode(params.code) ? await loadChecklistByShortCode(admin, params.code) : null;
  return paymentRedirectResponse(request, admin, row);
}
