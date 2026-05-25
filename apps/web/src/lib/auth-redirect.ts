import { redirect } from "next/navigation";

export function redirectToAppSignIn(returnTo: string): never {
  const params = new URLSearchParams({ redirect_url: returnTo });
  redirect(`/sign-in?${params.toString()}`);
}
