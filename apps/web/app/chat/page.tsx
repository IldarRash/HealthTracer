import { AppLayout } from "../../src/components/app-layout";
import { ChatWorkspace } from "../../src/components/chat/chat-workspace";

export default function ChatPage() {
  return (
    <AppLayout variant="chat">
      <ChatWorkspace />
    </AppLayout>
  );
}
