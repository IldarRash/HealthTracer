const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

const ISO_DATE_PATTERN = /\d{4}-\d{2}-\d{2}/g;

export function sanitizePathForLogging(path: string | undefined): string {
  if (!path) {
    return "/";
  }

  const pathOnly = path.split("?")[0] ?? "/";

  return pathOnly.replace(UUID_PATTERN, ":id").replace(ISO_DATE_PATTERN, ":date");
}
