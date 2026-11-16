import React from "react";
import { useDesktopArtifactDrag } from "@/features/artifacts/hooks/useDesktopArtifactDrag";
import { useAppMessage } from "@/shared/ui/useAppMessage";
import { useI18n } from "@/shared/i18n";
export function OverviewArtifactRow({ chatId, artifactId, source, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  chatId: string; artifactId: string; source: string;
}) {
  const { t } = useI18n(), message = useAppMessage();
  const drag = useDesktopArtifactDrag(chatId, artifactId, source, true, status => { void message.info(t(`attachments.exportDrag.${status}`)); });
  return <button {...props} {...drag.props} title={drag.available ? t(`attachments.exportDrag.${drag.status}`) : props.title}>{children}</button>;
}
