import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

export async function middleware(request) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          return request.cookies.get(name)?.value;
        },
        set(name, value, options) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name, options) {
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    const redirectUrl = new URL('/login', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  // אימות דו-שלבי (OTP) - כבוי כברירת מחדל (דגל תכונה), כדי שהתכונה
  // תהיה מוכנה בקוד בלי לנעול אף משתמש קיים עד שמישהו מפעיל אותה
  // במפורש ב-Vercel (NEXT_PUBLIC_OTP_LOGIN_REQUIRED=true - חייב
  // NEXT_PUBLIC_ כי login/page.js צריך לבדוק אותו גם בצד לקוח), אותו
  // דפוס בדיוק כמו isZoomConfigured()/NotConnectedButton לאינטגרציות
  // אופציונליות.
  if (user && process.env.NEXT_PUBLIC_OTP_LOGIN_REQUIRED === 'true') {
    const otpVerified = request.cookies.get('otp_verified')?.value === 'true';
    if (!otpVerified) {
      const redirectUrl = new URL('/verify-otp', request.url);
      return NextResponse.redirect(redirectUrl);
    }
  }

  // תפקיד "טלפן" נעול - רואה אך ורק את תור-השיחות, שום עמוד אחר במערכת.
  // נבדק כאן (לפני הרנדור) ולא רק בשלד (layout.js) כדי שהחסימה תהיה
  // אמיתית ולא רק "מסתירים תפריט" - ר' migration 0094 להוספת הערך הזה
  // ל-workspace_members.role.
  if (user && request.nextUrl.pathname.startsWith('/dashboard')) {
    const { data: telemarketerRow } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'telemarketer')
      .limit(1)
      .maybeSingle();
    if (telemarketerRow) {
      const CALLING_PATH_RE = /^\/dashboard\/sales\/campaigns\/(calling(\/.*)?|[^/]+\/calling(\/.*)?)$/;
      if (!CALLING_PATH_RE.test(request.nextUrl.pathname)) {
        return NextResponse.redirect(new URL('/dashboard/sales/campaigns/calling', request.url));
      }
    }
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
