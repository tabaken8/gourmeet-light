// Minimal middleware - no locale routing, just pass through.
// Locale is read from NEXT_LOCALE cookie in src/i18n/request.ts
import { NextResponse } from "next/server";

export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
