import { auth } from "@clerk/nextjs/server";
import { redirectToAppSignIn } from "../../src/lib/auth-redirect";
import { AppSidebar } from "../../src/components/app-sidebar";
import { ProposalInspector } from "../../src/components/proposals/proposal-inspector";

export default async function ProposalsPage() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    redirectToAppSignIn("/proposals");
  }

  return (
    <main className="shell shell-wide">
      <section className="card card-wide">
        <AppSidebar />
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
