"use client";

import { useLayoutEffect } from "react";
import {
  PROFILE_HUB_HASH_SCROLL_RETRY_MS,
  parseProfileHubHash,
  resolveProfileHubScrollBehavior,
  scrollToProfileHubSection,
} from "./profile-hub-hash-scroll";

/** Re-scroll profile hub anchors after async section content mounts. */
export function useProfileHubHashScroll(ready: boolean): void {
  useLayoutEffect(() => {
    if (!ready) {
      return;
    }

    const stabilize = () => {
      const sectionId = parseProfileHubHash(window.location.hash);
      if (!sectionId) {
        return;
      }

      const behavior = resolveProfileHubScrollBehavior(
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      );

      scrollToProfileHubSection(sectionId, {
        getElementById: (id) => document.getElementById(id),
        scrollIntoView: (element, scrollBehavior) => {
          element.scrollIntoView({ behavior: scrollBehavior, block: "start" });
        },
        behavior,
      });
    };

    stabilize();
    const rafId = requestAnimationFrame(stabilize);
    const timeoutId = window.setTimeout(stabilize, PROFILE_HUB_HASH_SCROLL_RETRY_MS);
    window.addEventListener("hashchange", stabilize);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
      window.removeEventListener("hashchange", stabilize);
    };
  }, [ready]);
}
