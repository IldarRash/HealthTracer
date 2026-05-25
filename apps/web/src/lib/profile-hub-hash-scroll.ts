import {
  PROFILE_HUB_SECTIONS,
  type ProfileHubSectionId,
} from "./context-hub-ui-state";

const PROFILE_HUB_SECTION_ID_SET = new Set<string>(
  PROFILE_HUB_SECTIONS.map((section) => section.id),
);

/** Delayed retry so embedded workspaces can finish their first layout pass. */
export const PROFILE_HUB_HASH_SCROLL_RETRY_MS = 150;

export function isProfileHubSectionId(id: string): id is ProfileHubSectionId {
  return PROFILE_HUB_SECTION_ID_SET.has(id);
}

export function parseProfileHubHash(hash: string): ProfileHubSectionId | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) {
    return null;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }

  return isProfileHubSectionId(decoded) ? decoded : null;
}

export function resolveProfileHubScrollBehavior(prefersReducedMotion: boolean): ScrollBehavior {
  return prefersReducedMotion ? "auto" : "smooth";
}

type ScrollToProfileHubSectionDeps = {
  getElementById: (id: string) => Element | null;
  scrollIntoView: (element: Element, behavior: ScrollBehavior) => void;
  behavior: ScrollBehavior;
};

export function scrollToProfileHubSection(
  sectionId: ProfileHubSectionId,
  deps: ScrollToProfileHubSectionDeps,
): boolean {
  const element = deps.getElementById(sectionId);
  if (!element) {
    return false;
  }

  deps.scrollIntoView(element, deps.behavior);
  return true;
}
