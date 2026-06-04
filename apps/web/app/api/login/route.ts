import { NextResponse } from "next/server";
import { AUTH_COOKIE, expectedAuthToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expectedPassword = process.env.APP_PASSWORD;
  if (!expectedPassword) {
    return NextResponse.json(
      { ok: false, error: "APP_PASSWORD ist nicht gesetzt (siehe apps/web/.env)." },
      { status: 500 },
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    if (typeof body?.password === "string") password = body.password;
  } catch {
    password = "";
  }

  if (password !== expectedPassword) {
    return NextResponse.json({ ok: false, error: "Falsches Passwort." }, { status: 401 });
  }

  const token = await expectedAuthToken();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, token ?? "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 Tage
  });
  return response;
}
