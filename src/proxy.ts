/**
 * Next.js proxy (formerly "middleware").
 * Refreshes the Supabase session on every matched request.
 */
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT Next internals, static files, images, and the API.
     * Keeps sessions fresh on every page navigation.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api).*)",
  ],
};
