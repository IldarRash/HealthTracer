import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PropsWithChildren, useState } from "react";
import { mobileEnv } from "./env";

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient());
  void mobileEnv;

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
