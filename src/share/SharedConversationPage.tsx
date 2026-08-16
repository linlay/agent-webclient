import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ConversationShareError,
  getConversationShareDownloadUrl,
  getPublicConversationShare,
  type SharedConversationTranscript as SharedConversationTranscriptData,
} from "@/shared/data/conversationShare";
import { t } from "@/shared/i18n";
import { SharedConversationTranscript } from "@/share/SharedConversationTranscript";
import styles from "@/share/SharedConversationPage.module.css";

type PageState =
  | { status: "loading" }
  | { status: "ready"; transcript: SharedConversationTranscriptData }
  | { status: "unavailable" }
  | { status: "unsupported" }
  | { status: "error" };

type CopyState = "idle" | "copied" | "failed";

const PRODUCT_BRAND = "ZenMind";
const APP_OPEN_URL = "zenmind://open";
const COPY_FEEDBACK_DURATION_MS = 1600;
const APP_OPEN_FALLBACK_DELAY_MS = 1500;

export function SharedConversationPage({
  shareId,
}: {
  shareId: string | null;
}): React.ReactElement {
  const [state, setState] = useState<PageState>(
    shareId ? { status: "loading" } : { status: "unavailable" },
  );
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [ctaDismissed, setCtaDismissed] = useState(false);
  const [showDownloadHint, setShowDownloadHint] = useState(false);
  const copyFeedbackTimer = useRef<number | null>(null);
  const appOpenFallbackTimer = useRef<number | null>(null);
  const downloadUrl = useMemo(() => getConversationShareDownloadUrl(), []);

  useEffect(() => {
    if (!shareId) {
      setState({ status: "unavailable" });
      return undefined;
    }

    const controller = new AbortController();
    setState({ status: "loading" });
    void getPublicConversationShare(shareId, controller.signal)
      .then((transcript) => setState({ status: "ready", transcript }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ConversationShareError) {
          if (error.code === "unavailable" || error.code === "invalid-id") {
            setState({ status: "unavailable" });
            return;
          }
          if (error.code === "unsupported") {
            setState({ status: "unsupported" });
            return;
          }
        }
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, [shareId]);

  useEffect(() => {
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "hidden" && appOpenFallbackTimer.current !== null) {
        window.clearTimeout(appOpenFallbackTimer.current);
        appOpenFallbackTimer.current = null;
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (copyFeedbackTimer.current !== null) {
        window.clearTimeout(copyFeedbackTimer.current);
      }
      if (appOpenFallbackTimer.current !== null) {
        window.clearTimeout(appOpenFallbackTimer.current);
      }
    };
  }, []);

  const copyText = useMemo(() => {
    if (state.status !== "ready") return "";
    return state.transcript.turns
      .flatMap((turn) => turn.items)
      .map((item) => [
        item.kind === "assistant-reasoning"
          ? item.label || t("share.reasoning.title")
          : item.kind === "user-message"
            ? t("share.role.user")
            : t("share.role.assistant"),
        item.content,
      ].join("\n\n"))
      .join("\n\n---\n\n");
  }, [state]);

  const copyConversation = async (): Promise<void> => {
    if (!copyText || !navigator.clipboard) {
      setCopyState("failed");
      return;
    }
    try {
      await navigator.clipboard.writeText(copyText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    if (copyFeedbackTimer.current !== null) {
      window.clearTimeout(copyFeedbackTimer.current);
    }
    copyFeedbackTimer.current = window.setTimeout(
      () => setCopyState("idle"),
      COPY_FEEDBACK_DURATION_MS,
    );
  };

  const handleOpenApp = (): void => {
    setShowDownloadHint(false);
    if (appOpenFallbackTimer.current !== null) {
      window.clearTimeout(appOpenFallbackTimer.current);
    }
    if (!downloadUrl) return;
    appOpenFallbackTimer.current = window.setTimeout(() => {
      appOpenFallbackTimer.current = null;
      if (document.visibilityState === "visible") {
        setShowDownloadHint(true);
      }
    }, APP_OPEN_FALLBACK_DELAY_MS);
  };

  if (state.status === "loading") {
    return <ShareStatus title={t("share.loading")} />;
  }
  if (state.status === "unavailable") {
    return (
      <ShareStatus
        title={t("share.unavailable.title")}
        detail={t("share.unavailable.detail")}
      />
    );
  }
  if (state.status === "unsupported") {
    return (
      <ShareStatus
        title={t("share.unsupported.title")}
        detail={t("share.unsupported.detail")}
      />
    );
  }
  if (state.status === "error") {
    return (
      <ShareStatus
        title={t("share.error.title")}
        detail={t("share.error.detail")}
      />
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerTitle}>
            <span className={styles.brandMark} aria-hidden="true">
              {PRODUCT_BRAND.slice(0, 1)}
            </span>
            <div className={styles.headerText}>
              <span>{PRODUCT_BRAND}</span>
              <h1 title={state.transcript.metadata.title}>{state.transcript.metadata.title}</h1>
            </div>
          </div>
          <button
            className={styles.copyButton}
            type="button"
            onClick={() => void copyConversation()}
          >
            {copyState === "copied"
              ? t("share.copy.copied")
              : copyState === "failed"
                ? t("share.copy.failed")
                : t("share.copy.action")}
          </button>
        </header>
        <div className={styles.notice}>
          <p>{t("share.aiNotice")}</p>
        </div>
        <article className={styles.content}>
          <SharedConversationTranscript turns={state.transcript.turns} />
        </article>
        <footer className={styles.footer}>{t("share.readOnly")}</footer>
      </div>
      {!ctaDismissed ? (
        <aside className={styles.cta} aria-label={t("share.openApp.action")}>
          <a className={styles.openAppLink} href={APP_OPEN_URL} onClick={handleOpenApp}>
            <span className={styles.ctaMark} aria-hidden="true">
              {PRODUCT_BRAND.slice(0, 1)}
            </span>
            <span>{t("share.openApp.action")}</span>
            <span aria-hidden="true">›</span>
          </a>
          {showDownloadHint && downloadUrl ? (
            <a
              className={styles.downloadLink}
              href={downloadUrl}
              target="_blank"
              rel="noreferrer noopener"
              referrerPolicy="no-referrer"
            >
              {t("share.download.action")}
            </a>
          ) : null}
          <button
            className={styles.dismissCta}
            type="button"
            aria-label={t("share.openApp.dismiss")}
            onClick={() => setCtaDismissed(true)}
          >
            ×
          </button>
        </aside>
      ) : null}
    </main>
  );
}

function ShareStatus({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}): React.ReactElement {
  return (
    <main className={`${styles.page} ${styles.statusPage}`}>
      <section className={styles.statusCard} role="status" aria-live="polite">
        <div className={styles.statusMark} aria-hidden="true">{PRODUCT_BRAND.slice(0, 1)}</div>
        <h1>{title}</h1>
        {detail ? <p>{detail}</p> : null}
      </section>
    </main>
  );
}
