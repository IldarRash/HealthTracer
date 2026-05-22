import { auth } from "@clerk/nextjs/server";
import { AppLayout } from "../../src/components/app-layout";
import { ChatWorkspace } from "../../src/components/chat/chat-workspace";

export default async function ChatPage() {
  const { isAuthenticated, redirectToSignIn } = await auth();

  if (!isAuthenticated) {
    return redirectToSignIn();
  }

  return (
    <AppLayout variant="chat">
      <ChatWorkspace />
    </AppLayout>
  );
}
