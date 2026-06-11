"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { isNearBottom, shouldAutoScroll } from "./chat-scroll-ui-state.js";
import type { DisplayChatMessage } from "./chat-ui-state.js";

type UseChatAutoScrollInput = {
  messages: readonly DisplayChatMessage[];
  /** True while a send is in flight (optimistic or pending). */
  isSendPending: boolean;
};

type UseChatAutoScrollResult = {
  /** Ref to attach to the <ul> (ChatTranscript) element. */
  transcriptRef: React.RefObject<HTMLUListElement | null>;
  /** True when the user has scrolled away from the bottom. */
  isAtBottom: boolean;
  /** Scroll the transcript to the bottom smoothly. */
  scrollToLatest: () => void;
};

/**
 * Manages auto-scroll behavior for the chat transcript:
 * - Initial load: instant jump to bottom (layout effect, no animation)
 * - On new messages or pending state change: smooth scroll if shouldAutoScroll()
 * - Tracks wasNearBottom via scroll event listener
 */
export function useChatAutoScroll({
  messages,
  isSendPending,
}: UseChatAutoScrollInput): UseChatAutoScrollResult {
  const transcriptRef = useRef<HTMLUListElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const wasNearBottomRef = useRef(true);
  const isInitialLoadRef = useRef(true);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = transcriptRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  // Track scroll position to know if the user is near the bottom.
  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;

    const handleScroll = () => {
      const near = isNearBottom(el.scrollTop, el.clientHeight, el.scrollHeight);
      wasNearBottomRef.current = near;
      setIsAtBottom(near);
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Initial load: jump to bottom instantly (no animation flicker).
  useLayoutEffect(() => {
    if (isInitialLoadRef.current && messages.length > 0) {
      scrollToLatest("instant" as ScrollBehavior);
      isInitialLoadRef.current = false;
    }
  }, [messages.length, scrollToLatest]);

  // On new message / pending changes: smooth-scroll if warranted.
  useEffect(() => {
    if (isInitialLoadRef.current) return;

    const lastMsg = messages[messages.length - 1];
    const lastMessageIsOwnOptimistic =
      lastMsg?.role === "user" &&
      "optimistic" in lastMsg &&
      (lastMsg as { optimistic?: boolean }).optimistic === true;

    if (
      shouldAutoScroll({
        wasNearBottom: wasNearBottomRef.current,
        lastMessageIsOwnOptimistic,
        isInitialLoad: false,
      })
    ) {
      scrollToLatest("smooth");
    }
  }, [messages.length, isSendPending, scrollToLatest]);

  return { transcriptRef, isAtBottom, scrollToLatest };
}
