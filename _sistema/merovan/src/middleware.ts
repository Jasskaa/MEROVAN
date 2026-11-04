import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "mv_sid";

// Store: gives each visitor an anonymous cart session. Admin: refreshes the Supabase session and requires login.
export async function middleware(request: NextRequest) {
  const isAdmin = request.nextUrl.pathname.startsWith("/admin") || request.nextUrl.pathname === "/login";

  if (!isAdmin) {
    if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
    const sid = crypto.randomUUID();
    request.cookies.set(SESSION_COOKIE, sid); // visible to this same request's server components
    const response = NextResponse.next({ request });
    response.cookies.set(SESSION_COOKIE, sid, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30, path: "/",
    });
    return response;
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next();
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && request.nextUrl.pathname.startsWith("/admin")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/|api/|favicon.ico|logo-merovan.webp|alta-inicial).*)"],
};
