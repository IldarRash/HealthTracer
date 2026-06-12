/**
 * Source-contract spec for ChatMessageMarkdown.
 *
 * Verifies security constraints and rendering rules via string assertions
 * against the source file. No DOM rendering — avoids jsdom and JSX config
 * dependency since this is a pure-source contract test.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcPath = path.resolve(import.meta.dirname, "chat-message-markdown.tsx");
const source = readFileSync(srcPath, "utf-8");

describe("ChatMessageMarkdown source contracts", () => {
  it("uses react-markdown for rendering", () => {
    expect(source).toMatch(/from "react-markdown"/);
  });

  it("skips raw HTML (skipHtml prop)", () => {
    expect(source).toMatch(/skipHtml/);
  });

  it("unwraps disallowed elements (unwrapDisallowed prop)", () => {
    expect(source).toMatch(/unwrapDisallowed/);
  });

  it("constrains allowed elements via allowedElements prop", () => {
    expect(source).toMatch(/allowedElements/);
    expect(source).toMatch(/ALLOWED_ELEMENTS/);
  });

  it("allows only safe inline and block elements (no script, no style)", () => {
    // The allowedElements array must not include 'script' or 'style'
    expect(source).not.toMatch(/"script"/);
    expect(source).not.toMatch(/"style"/);
  });

  it("overrides anchor rendering to add target=_blank and rel=noopener noreferrer", () => {
    expect(source).toMatch(/target.*_blank|_blank.*target/);
    expect(source).toMatch(/noopener/);
    expect(source).toMatch(/noreferrer/);
  });

  it("wraps output in a chat-markdown CSS class", () => {
    expect(source).toMatch(/className="chat-markdown"/);
  });

  it("exports ChatMessageMarkdown as a named export", () => {
    expect(source).toMatch(/export function ChatMessageMarkdown/);
  });

  it("accepts children as a string prop", () => {
    expect(source).toMatch(/children.*string|string.*children/);
  });

  it("maps heading elements to avoid semantic h1-h4 hierarchy in chat context", () => {
    // Headings should be downgraded (mapped to <p> or similar) in chat
    expect(source).toMatch(/h[1-4]/);
    expect(source).toMatch(/components/);
  });
});
