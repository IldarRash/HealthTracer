import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Public routes: sign-in/sign-up Clerk catch-all + home root.
 * Everything else is protected — unauthenticated requests are redirected to /sign-in.
 */
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/",
  "/api-proxy(.*)",
]);

export default clerkMiddleware(
  async (auth, req) => {
    if (!isPublicRoute(req)) {
      await auth.protect();
    }
  },
  {
    // Dev-only tolerance: a lagging local system clock makes fresh Clerk tokens look
    // issued-in-the-future (default tolerance 5s) and loops the sign-in redirect.
    clockSkewInMs: process.env.NODE_ENV === "development" ? 60_000 : undefined,
  },
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
