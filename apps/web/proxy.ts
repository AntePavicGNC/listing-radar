import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, isValidAuthCookie } from "@/lib/auth";

// Next.js 16: Middleware heißt jetzt "Proxy" (proxy.ts, Funktion `proxy`, Node-Runtime).
// Schützt die gesamte App per Passwort-Cookie. Öffentlich bleiben:
// - /login + /api/login : der Login-Flow selbst
// - /api/ingest         : Apify-Webhook (nutzt später INGEST_SECRET statt Passwort)
// - /api/health         : harmloser DB-Status-Check
const PUBLIC_PREFIXES = ["/login", "/api/login", "/api/ingest", "/api/health"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(AUTH_COOKIE)?.value;
  if (await isValidAuthCookie(cookie)) {
    return NextResponse.next();
  }

  // Nicht authentifiziert: API -> 401 (JSON), Seiten -> Redirect auf /login
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Läuft auf allem außer Next-Internals und favicon. API-Routen werden bewusst
  // mitgematcht, damit geschützte APIs wirklich geschützt sind (Ausnahmen via PUBLIC_PREFIXES).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
