import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";

const ALLOWED_ELEMENTS: string[] = [
  "p", "strong", "em", "ul", "ol", "li",
  "h1", "h2", "h3", "h4",
  "a", "code", "pre", "blockquote", "br", "hr",
];

const HEADING_CLASS = "chat-markdown__heading";

const components: Components = {
  h1: ({ children, ...props }) => <p className={HEADING_CLASS} {...props}>{children}</p>,
  h2: ({ children, ...props }) => <p className={HEADING_CLASS} {...props}>{children}</p>,
  h3: ({ children, ...props }) => <p className={HEADING_CLASS} {...props}>{children}</p>,
  h4: ({ children, ...props }) => <p className={HEADING_CLASS} {...props}>{children}</p>,
  a: ({ href, children, ...props }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  ),
};

type ChatMessageMarkdownProps = {
  children: string;
};

/**
 * Renders coach reply markdown with a safe, constrained element set.
 * - skipHtml: raw HTML from the assistant is dropped entirely
 * - unwrapDisallowed: disallowed elements unwrap to their children (no orphan text)
 * - allowedElements: only the set above reaches the DOM
 * - h1–h4 all render as the same heading class (design parity)
 * - links open in new tab with noopener noreferrer
 */
export function ChatMessageMarkdown({ children }: ChatMessageMarkdownProps) {
  return (
    <div className="chat-markdown">
      <ReactMarkdown
        skipHtml
        unwrapDisallowed
        allowedElements={ALLOWED_ELEMENTS}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
