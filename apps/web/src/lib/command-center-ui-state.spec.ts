import { describe, expect, it } from "vitest";
import {
  canvasStateMessageClass,
  canvasStateMessageCompactClass,
  semanticStatusBadgeClass,
  sessionStatusBadgeClass,
} from "./command-center-ui-state";

describe("command-center-ui-state", () => {
  it("maps session statuses to existing badge-session classes", () => {
    expect(sessionStatusBadgeClass("planned")).toBe("badge badge-session-planned");
    expect(sessionStatusBadgeClass("completed")).toBe("badge badge-session-completed");
    expect(sessionStatusBadgeClass("skipped")).toBe("badge badge-session-skipped");
    expect(sessionStatusBadgeClass("pending")).toBe("badge badge-session-pending");
  });

  it("maps semantic tones to badge utility classes", () => {
    expect(semanticStatusBadgeClass("info")).toBe("badge badge-info");
    expect(semanticStatusBadgeClass("success")).toBe("badge badge-valid");
  });

  it("builds structured canvas state message class names", () => {
    expect(canvasStateMessageClass("empty")).toBe(
      "state-message state-message--empty state-message--canvas",
    );
    expect(canvasStateMessageCompactClass("loading")).toBe(
      "state-message state-message--loading state-message--canvas state-message--canvas-compact",
    );
  });
});
