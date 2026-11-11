import { useEffect, useRef, useState } from "react";
import { isEmbedMode } from "@/shared/config/embed";

interface ComposerCommand {
  type: string;
  text?: string;
  handled: boolean;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}
/** Use the same Composer submit/queue and interrupt paths as keyboard interaction. */
export function useEmbedComposer(input: {
  value: string; setValue: (value: string) => void;
  disabled: boolean; sendDisabled: boolean; busy: boolean;
  hasAttachments: boolean;
  submit: () => void; interrupt: () => Promise<void>;
}) {
  const latest = useRef(input); latest.current = input;
  const [pending, setPending] = useState<ComposerCommand | null>(null);
  const pendingRef = useRef<ComposerCommand | null>(null);
  useEffect(() => {
    if (!isEmbedMode()) return;
    const listener = (event: Event) => {
      const command = (event as CustomEvent<ComposerCommand>).detail;
      command.handled = true;
      const current = latest.current;
      if (command.type === "interrupt") {
        if (!current.busy) { command.reject(new Error("no_active_run")); return; }
        void current.interrupt().then(() => command.resolve({ status: "requested" }), command.reject);
        return;
      }
      if (current.disabled || pendingRef.current) { command.reject(new Error("composer_unavailable")); return; }
      if (command.type === "prefill") {
        current.setValue(command.text || ""); command.resolve({ status: "prefilled" }); return;
      }
      if (current.value.trim() || current.hasAttachments) { command.reject(new Error("composer_has_draft")); return; }
      // A slash command must be entered explicitly by the person in the iframe.
      if (!command.text?.trim() || command.text.trim().startsWith("/")) { command.reject(new Error("invalid_message")); return; }
      pendingRef.current = command;
      setPending(command);
      current.setValue(command.text);
    };
    window.addEventListener("agent:embed-composer", listener);
    return () => {
      window.removeEventListener("agent:embed-composer", listener);
      pendingRef.current?.reject(new Error("composer_closed")); pendingRef.current = null;
    };
  }, []);
  useEffect(() => {
    if (!pending || input.value !== pending.text) return;
    pendingRef.current = null; setPending(null);
    if (input.disabled || input.sendDisabled) { pending.reject(new Error("composer_unavailable")); return; }
    input.submit();
    pending.resolve({ status: input.busy ? "queued" : "submitted" });
  }, [pending, input]);
}
