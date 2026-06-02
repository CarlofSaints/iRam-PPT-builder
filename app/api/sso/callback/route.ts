import { NextRequest, NextResponse } from "next/server";
import { verifySSOToken } from "@/lib/sso";

export async function POST(req: NextRequest) {
  const { token } = (await req.json()) as { token?: string };
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const secret = process.env.IRAM_SSO_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "SSO not configured" }, { status: 500 });
  }

  const payload = verifySSOToken(token, secret);
  if (!payload) {
    return NextResponse.json(
      { error: "Invalid or expired SSO token" },
      { status: 401 },
    );
  }

  // Check module access
  if (!payload.modules.includes("ppt")) {
    return NextResponse.json(
      { error: "You do not have access to PPT Builder" },
      { status: 403 },
    );
  }

  // PPT Builder has no local user store — return session directly from token
  return NextResponse.json({
    id: payload.sub,
    name: payload.name,
    surname: payload.surname,
    email: payload.email,
    role: "user",
  });
}
