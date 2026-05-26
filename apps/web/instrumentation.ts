export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logWebStartupDiagnostics } = await import("./src/lib/server-log");
    logWebStartupDiagnostics();
  }
}
