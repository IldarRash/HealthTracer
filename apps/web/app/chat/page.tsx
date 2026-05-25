import { auth } from "@clerk/nextjs/server";
import { redirectToAppSignIn } from "../../src/lib/auth-redirect";
import { AppLayout } from "../../src/components/app-layout";
import { ChatWorkspace } from "../../src/components/chat/chat-workspace";

export default async function ChatPage() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    redirectToAppSignIn("/chat");
  }

  return (
    <AppLayout variant="chat">
      <ChatWorkspace />
    </AppLayout>
  );
}
