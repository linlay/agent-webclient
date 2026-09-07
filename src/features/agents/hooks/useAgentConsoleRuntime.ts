import { useEffect, useRef } from "react";

/** Owns request sequencing and one-shot bootstrap guards for AgentConsole. */
export function useAgentConsoleRuntime() {
  const didBootstrapAgentsRef = useRef(false);
  const didBootstrapOptionsRef = useRef(false);
  const listLoadSeqRef = useRef(0);
  const optionsLoadSeqRef = useRef(0);
  const sourceLoadSeqRef = useRef(0);

  useEffect(() => () => {
    listLoadSeqRef.current += 1;
    optionsLoadSeqRef.current += 1;
    sourceLoadSeqRef.current += 1;
    // StrictMode replays effects after cleanup. Allow fresh bootstrap requests
    // to replace the requests invalidated above.
    didBootstrapAgentsRef.current = false;
    didBootstrapOptionsRef.current = false;
  }, []);

  return {
    didBootstrapAgentsRef,
    didBootstrapOptionsRef,
    listLoadSeqRef,
    optionsLoadSeqRef,
    sourceLoadSeqRef,
  };
}
