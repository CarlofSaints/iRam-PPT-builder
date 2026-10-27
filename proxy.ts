import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSession } from "./lib/pptSession";

/* Every API route needs the signed session from the Hub sign-in, except the sign-in itself. */
export async function proxy(req: NextRequest) {
  if (req.nextUrl.pathname === "/api/sso/callback") return NextResponse.next();
  if (await readSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  return NextResponse.json({ error: "Not signed in" }, { status: 401 });
}

export const config = {
  matcher: ["/api/:path*"],
};
