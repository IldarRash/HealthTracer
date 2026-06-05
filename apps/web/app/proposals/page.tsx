import { auth } from "@clerk/nextjs/server";
import { redirectToAppSignIn } from "../../src/lib/auth-redirect";
import { AppLayout } from "../../src/components/app-layout";
import { ProposalInspector } from "../../src/components/proposals/proposal-inspector";
import { PageContent, PageHeader } from "../../src/components/ui";

export default async function ProposalsPage() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    redirectToAppSignIn("/proposals");
  }

  return (
    <AppLayout>
      <PageContent>
        <PageHeader
          eyebrow="Coach proposals"
          title="Proposal audit"
          description="Review AI-generated proposals, inspect validation results, and accept or decline changes."
        />
        <ProposalInspector />
      </PageContent>
    </AppLayout>
  );
}
