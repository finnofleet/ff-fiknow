import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/auth/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match alle Pfade ausser:
     * - _next/static / _next/image (Build-Assets)
     * - favicon.ico
     * - .svg / .png / .jpg / .webp (statische Bilder)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
