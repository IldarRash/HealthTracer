import type { ContextCompressionProvider } from "./context-compression.provider.js";
import { StubContextCompressionProvider } from "./stub-context-compression.provider.js";

export function createContextCompressionProvider(): ContextCompressionProvider {
  return new StubContextCompressionProvider();
}
