export function isPostgresUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const directCode = (error as { code?: string }).code;
  if (directCode === "23505") {
    return true;
  }

  const cause = (error as { cause?: unknown }).cause;
  if (typeof cause === "object" && cause !== null) {
    return (cause as { code?: string }).code === "23505";
  }

  return false;
}
