export type ClerkAuthContext = {
  clerkUserId: string;
  email: string;
  displayName: string | null;
};

export type AuthenticatedRequest = {
  headers: Record<string, string | string[] | undefined>;
  auth?: ClerkAuthContext;
};
