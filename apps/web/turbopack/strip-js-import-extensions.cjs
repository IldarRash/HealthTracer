/* global module */

/**
 * Turbopack lacks webpack's extensionAlias, so TypeScript ESM `.js` specifiers
 * in workspace packages must be rewritten before module resolution.
 */
module.exports = function stripJsImportExtensions(source) {
  return source.replaceAll(
    /(from\s+["'])(\.\.?\/[^"']+)(\.js)(["'])/g,
    "$1$2$4",
  );
};
