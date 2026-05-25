import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { authAppearance } from "../../../src/lib/auth-appearance";

export default async function SignInPage() {
  const { isAuthenticated } = await auth();

  if (isAuthenticated) {
    redirect("/chat");
  }

  return (
    <main className="auth-page">
      <section className="auth-hero" aria-labelledby="sign-in-title">
        <p className="auth-hero__eyebrow">AI Health Coach</p>
        <h1 id="sign-in-title">Your modern health OS starts with a conversation.</h1>
        <p>
          Sign in to see today&apos;s plan, weekly wellness trends, and coach-approved changes in
          one calm workspace.
        </p>
        <ul className="auth-hero__signals" aria-label="Product highlights">
          <li>AI coach with typed approvals</li>
          <li>Today, Longevity, Profile, Training, Nutrition</li>
          <li>Consent-first wellness data</li>
        </ul>
      </section>
      <section className="auth-card" aria-label="Sign in">
        <SignIn
          appearance={authAppearance}
          routing="path"
          path="/sign-in"
          signUpUrl="/sign-up"
          fallbackRedirectUrl="/chat"
        />
      </section>
    </main>
  );
}
