import { locateSelectedTextReference } from "@/shared/data/desktop/selectedTextLocate";
import libraryPresentation from "@/shared/ui/Presentation.module.css";
import { SelectedTextFragmentsPill } from "@/features/selection/components/SelectedTextFragmentsPill";
import { selectedTextFragmentFromAttachment } from "@/features/selection/lib/selectedTextReference";
import React from "react";
import { AttachmentCard } from "@/features/artifacts/components/AttachmentCard";
import { normalizeTimelineAttachments } from "@/features/events/lib/timelineAttachments";
import {
  type AttachmentLike,
  getAttachmentKind,
  getAttachmentUrl,
} from "@/features/artifacts/lib/attachmentUtils";
import { useAuthenticatedResourceUrl } from "@/shared/ui/useAuthenticatedResourceUrl";
import { useAppState } from "@/app/state/AppContext";
import type { PendingSteer } from "@/features/composer/lib/composerState";
import { Button, Popover, Typography } from "antd";
import { ShortcutHint } from "@/shared/ui/ShortcutHint";
import { SteerIcon } from "@/features/runs/components/SteerIcon";
import { FileIcon } from "@/shared/components/file-icon";
import { useI18n } from "@/shared/i18n";

const STEER_BAR_CLASS =
  "steer-bar tw:mx-5 tw:flex tw:flex-col tw:items-stretch tw:gap-2";
const STEER_QUEUE_CLASS =
  "steer-queue tw:flex tw:flex-col tw:rounded-t-xl tw:border tw:border-b-0 tw:border-[color-mix(in_srgb,var(--line-soft)_96%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-elev-2)_98%,transparent)]";
const STEER_PREVIEW_CLASS =
  "steer-preview steer-preview-draft tw:flex tw:items-center tw:gap-2 tw:px-3 tw:py-1.5 tw:text-xs tw:text-ink-1";
const STEER_PREVIEW_ICON_CLASS =
  "node-icon steer-preview-icon tw:flex-shrink-0 tw:flex tw:items-center";
const STEER_PREVIEW_CONTENT_CLASS =
  "steer-preview-text tw:min-w-0 tw:flex-1 tw:flex tw:items-center tw:gap-2";
const STEER_PREVIEW_ACTIONS_CLASS =
  "steer-preview-actions tw:flex-shrink-0 tw:flex tw:items-center tw:gap-1 tw:[&_button]:text-xs";
const STEER_PRIMARY_BUTTON_CLASS = "steer-primary-btn tw:!bg-bg-base";

const SteerAttachmentThumbnail: React.FC<{
  attachment: AttachmentLike & { name: string };
  chatId: string;
}> = ({ attachment, chatId }) => {
  const isImage = getAttachmentKind(attachment) === "image";
  const sourceUrl = attachment.url?.trim() || getAttachmentUrl(attachment);
  const authenticatedSource = useAuthenticatedResourceUrl(
    isImage ? attachment.previewUrl || sourceUrl : "",
    chatId,
  );
  const [imageFailed, setImageFailed] = React.useState(false);

  React.useEffect(() => {
    setImageFailed(false);
  }, [sourceUrl]);

  if (isImage && authenticatedSource.url && !imageFailed) {
    return (
      <img
        src={authenticatedSource.url}
        alt={attachment.name}
        className="tw:w-full tw:h-full tw:object-cover tw:rounded"
        onError={() => setImageFailed(true)}
      />
    );
  }

  return <FileIcon filename={attachment.name} size={16} />;
};

export const SteerBar: React.FC<{
  pendingSteers: PendingSteer[];
  mainChatRunning: boolean;
  onSubmit: (steerId: string) => void;
  onCancel: (steerId: string) => void;
}> = ({ pendingSteers, mainChatRunning, onSubmit, onCancel }) => {
  const { t } = useI18n();
  const appState = useAppState();
  const chatId = String(appState.chatId ?? "").trim();
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform);

  if (pendingSteers.length === 0) return null;
  const shortcutSteerId = mainChatRunning
    ? pendingSteers.find((steer) => steer.status === "queued")?.steerId
    : undefined;

  return (
    <div className={STEER_BAR_CLASS}>
      <div className={STEER_QUEUE_CLASS} aria-live="polite">
        {pendingSteers.map((steer) => {
          const attachments = normalizeTimelineAttachments(steer.references);
          const selections = attachments.flatMap((attachment) => {
            const fragment = selectedTextFragmentFromAttachment(attachment);
            return fragment ? [fragment] : [];
          });
          const fileAttachments = attachments.filter(
            (attachment) => attachment.type !== "selection",
          );
          const isSending = steer.status === "sending";
          return (
            <div
              key={steer.steerId}
              className={STEER_PREVIEW_CLASS}
              aria-busy={isSending}
            >
              <div className={STEER_PREVIEW_ICON_CLASS}>
                <SteerIcon />
              </div>
              <div className={STEER_PREVIEW_CONTENT_CLASS}>
                {fileAttachments.length > 0 && (
                  <div className="tw:flex tw:items-center tw:gap-1 tw:flex-shrink-0">
                    {fileAttachments.map((attachment, index) => (
                      <Popover
                        key={attachment.id || index}
                        placement="top"
                        arrow={false}
                        styles={{
                          body: {
                            padding: 0,
                            boxShadow: "none",
                          },
                        }}
                        content={
                          <div className="tw:max-w-xs">
                            <AttachmentCard
                              attachment={attachment}
                              variant="timeline"
                              density="compact"
                              thumbnailMode="inline"
                            />
                          </div>
                        }
                      >
                        <span
                          className="tw:inline-flex tw:items-center tw:justify-center tw:w-5 tw:h-5 tw:cursor-pointer tw:rounded tw:overflow-hidden tw:hover:ring-1 tw:hover:ring-[color-mix(in_srgb,var(--line-soft)_90%,transparent)] tw:transition-all"
                          title={attachment.name}
                        >
                          <SteerAttachmentThumbnail
                            attachment={attachment}
                            chatId={chatId}
                          />
                        </span>
                      </Popover>
                    ))}
                  </div>
                )}
                {selections.length > 0 && (
                  <div className="tw:flex-shrink-0">
                    <SelectedTextFragmentsPill onLocate={locateSelectedTextReference}
                      fragments={selections}
                      variant="segments"
                    />
                  </div>
                )}
                <Typography.Text
                  ellipsis={{ tooltip: steer.message }}
                  className={`tw:min-w-0 tw:flex-1 ${libraryPresentation.typography}`}
                >
                  {steer.message}
                </Typography.Text>
                {steer.submissionError && (
                  <div
                    role="status"
                    title={steer.submissionError}
                    className="tw:flex-shrink-0 tw:text-accent-danger"
                  >
                    {t("composer.steer.unknown")}
                  </div>
                )}
              </div>
              <div className={STEER_PREVIEW_ACTIONS_CLASS}>
                <Button
                  size="small"
                  type="text"
                  className={STEER_PRIMARY_BUTTON_CLASS}
                  shape="round"
                  title={
                    steer.steerId === shortcutSteerId
                      ? t("composer.steer.shortcut")
                      : undefined
                  }
                  loading={isSending}
                  disabled={isSending}
                  onClick={() => onSubmit(steer.steerId)}
                >
                  {t(
                    isSending
                      ? "composer.steer.waiting"
                      : "composer.steer.submit",
                  )}
                  {steer.steerId === shortcutSteerId && (
                    <ShortcutHint
                      keyLabel="Enter"
                      modifier={isMac ? "Meta" : "Control"}
                    />
                  )}
                </Button>
                <Button
                  size="small"
                  type="text"
                  shape="round"
                  disabled={isSending && mainChatRunning}
                  onClick={() => onCancel(steer.steerId)}
                >
                  {t("composer.steer.cancel")}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
