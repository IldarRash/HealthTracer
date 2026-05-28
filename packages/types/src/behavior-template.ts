const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

export function interpolateBehaviorTemplate(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(PLACEHOLDER_PATTERN, (_match, key: string) => {
    const value = values[key];
    return value === undefined ? "" : String(value);
  });
}
