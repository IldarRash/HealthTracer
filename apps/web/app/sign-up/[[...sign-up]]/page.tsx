import { SignUp } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { authAppearance } from "../../../src/lib/auth-appearance";

export default async function SignUpPage() {
  const { isAuthenticated } = await auth();

  if (isAuthenticated) {
    redirect("/onboarding");
  }

  return (
    <main className="auth-page">
      <section className="auth-hero" aria-labelledby="sign-up-title">
        <p className="auth-hero__eyebrow">AI Health Coach</p>
        <h1 id="sign-up-title">Build your coaching foundation in a few minutes.</h1>
        <p>
          Create an account to set your direction, connect structured context, and keep every plan
          change approval-gated.
        </p>
        <ul className="auth-hero__signals" aria-label="Product highlights">
          <li>Structured goals and daily execution</li>
          <li>Wellness-only AI coaching</li>
          <li>Revision-safe workout and nutrition changes</li>
        </ul>
      </section>
      <section className="auth-card" aria-label="Sign up">
        <SignUp
          appearance={authAppearance}
          routing="path"
          path="/sign-up"
          signInUrl="/sign-in"
          fallbackRedirectUrl="/onboarding"
        />
      </section>
    </main>
  );
}
