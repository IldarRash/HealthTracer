import { describe, expect, it, vi } from "vitest";
import { PROFILE_HUB_SECTIONS } from "./context-hub-ui-state.js";
import {
  isProfileHubSectionId,
  parseProfileHubHash,
  resolveProfileHubScrollBehavior,
  scrollToProfileHubSection,
} from "./profile-hub-hash-scroll.js";

describe("profile hub hash scroll helpers", () => {
  it("recognizes every profile hub section id", () => {
    for (const section of PROFILE_HUB_SECTIONS) {
      expect(isProfileHubSectionId(section.id)).toBe(true);
    }
  });

  it("rejects unknown or malformed hash targets", () => {
    expect(isProfileHubSectionId("settings")).toBe(false);
    expect(parseProfileHubHash("")).toBeNull();
    expect(parseProfileHubHash("#")).toBeNull();
    expect(parseProfileHubHash("#unknown-section")).toBeNull();
    expect(parseProfileHubHash("%")).toBeNull();
  });

  it("parses known profile hub hash anchors", () => {
    expect(parseProfileHubHash("#account")).toBe("account");
    expect(parseProfileHubHash("coaching-hierarchy")).toBe("coaching-hierarchy");
    expect(parseProfileHubHash("#goals")).toBe("goals");
    expect(parseProfileHubHash("#personal-preferences")).toBe("personal-preferences");
    expect(parseProfileHubHash("#data-consent")).toBe("data-consent");
    expect(parseProfileHubHash("#documents")).toBe("documents");
  });

  it("uses instant scroll when reduced motion is preferred", () => {
    expect(resolveProfileHubScrollBehavior(true)).toBe("auto");
    expect(resolveProfileHubScrollBehavior(false)).toBe("smooth");
  });

  it("scrolls only when the target section element exists", () => {
    const scrollIntoView = vi.fn();
    const target = { id: "data-consent" } as Element;

    expect(
      scrollToProfileHubSection("data-consent", {
        getElementById: () => null,
        scrollIntoView,
        behavior: "auto",
      }),
    ).toBe(false);
    expect(scrollIntoView).not.toHaveBeenCalled();

    expect(
      scrollToProfileHubSection("data-consent", {
        getElementById: (id) => (id === "data-consent" ? target : null),
        scrollIntoView,
        behavior: "smooth",
      }),
    ).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith(target, "smooth");
  });
});
