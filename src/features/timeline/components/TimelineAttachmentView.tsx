import React from "react";
import { AttachmentCard } from "@/features/artifacts/components/AttachmentCard";
import { ReferenceCard } from "@/features/artifacts/components/ReferenceCard";
import { SkillIcon } from "@/features/skills/components/SkillIcon";
import { GeneratedImageTile } from "./GeneratedImageTile";
import type { TimelineInteractionValue } from "@/features/timeline/components/TimelineInteractionContext";

type RenderAttachment = NonNullable<TimelineInteractionValue["renderAttachment"]>;

/** Application host for shared timeline attachment presentation. */
export function TimelineAttachmentView({ attachment, options, surfaceContext, openTarget }: {
  attachment: Parameters<RenderAttachment>[0];
  options: Parameters<RenderAttachment>[1];
  openTarget?: TimelineInteractionValue["openTarget"];
  surfaceContext: NonNullable<TimelineInteractionValue["surfaceContext"]>;
}) {
  const { generatedImage, skillIcon, ...display } = options;
  if (["chat", "site", "skill", "kbase"].includes(attachment.type ?? "")) {
    return <ReferenceCard reference={attachment} variant="timeline" density={display.density} openTarget={openTarget}
      skillIcon={attachment.type === "skill" ? <SkillIcon icon={skillIcon} size={34} glyphSize={19} fallback="build" /> : undefined} />;
  }
  return generatedImage
    ? <GeneratedImageTile key={`${surfaceContext.chatId}:${generatedImage.url}`} image={generatedImage} surface={surfaceContext} />
    : <AttachmentCard attachment={attachment} variant="timeline" thumbnailMode="inline"
        surfaceContext={surfaceContext} {...display} />;
}
