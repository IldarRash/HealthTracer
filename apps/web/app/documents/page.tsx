import { auth } from "@clerk/nextjs/server";
import { AppLayout } from "../../src/components/app-layout";
import { DocumentsWorkspace } from "../../src/components/documents/documents-workspace";
import { PageContent, PageHeader } from "../../src/components/ui";

export default async function DocumentsPage() {
  const { isAuthenticated, redirectToSignIn } = await auth();

  if (!isAuthenticated) {
    return redirectToSignIn();
  }

  return (
    <AppLayout>
      <PageHeader
        title="Documents"
        description="Upload health documents with explicit consent, review structured summaries, and search approved context for wellness coaching."
      />
      <PageContent>
        <DocumentsWorkspace />
      </PageContent>
    </AppLayout>
  );
}
