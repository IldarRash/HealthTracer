/** @vitest-environment node */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmptyState, ErrorState, LoadingState } from "./state-message-elements.js";

describe("StateMessage render", () => {
  it("renders tone-specific classes on structured shell surfaces", () => {
    const empty = renderToStaticMarkup(
      createElement(EmptyState, {
        title: "Nothing here yet",
        description: "Log a workout to get started.",
      }),
    );
    const loading = renderToStaticMarkup(
      createElement(LoadingState, {
        title: "Loading plan",
        description: "Fetching your schedule.",
      }),
    );
    const error = renderToStaticMarkup(
      createElement(ErrorState, {
        title: "Could not load",
        description: "Try again in a moment.",
      }),
    );

    expect(empty).toContain('class="state-message state-message--empty"');
    expect(empty).toContain('role="status"');
    expect(empty).toContain('class="state-message__title"');
    expect(empty).toContain('class="state-message__description"');

    expect(loading).toContain('class="state-message state-message--loading"');
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-live="polite"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('class="state-message__spinner"');

    expect(error).toContain('class="state-message state-message--error"');
    expect(error).toContain('role="alert"');
  });
});
