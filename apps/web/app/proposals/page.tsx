import { auth } from "@clerk/nextjs/server";
import { AppNav } from "../../src/components/app-nav";
import { ProposalInspector } from "../../src/components/proposals/proposal-inspector";

export default async function ProposalsPage() {
  const { isAuthenticated, redirectToSignIn } = await auth();

  if (!isAuthenticated) {
    return redirectToSignIn();
  }

  return (
    <main className="shell shell-wide">
      <section className="card card-wide">
        <AppNav />
        <p className="eyebrow">Phase 3 proposal inspector</p>
        <h1>Proposal audit</h1>
        <p>
          Inspect proposal status, validation results, proposed changes, and applied
          structured state references.
        </p>
        <ProposalInspector />
      </section>
    </main>
  );
}
