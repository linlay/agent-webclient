import React, { useMemo, useState } from 'react';
import type { TimelineNode } from '../lib/timelineState';
import { buildImageGenerationDisplay, type GeneratedImage } from '../lib/imageGenerationDisplay';
import { useOptionalAppContext } from '@/app/state/provider';
import { resolveMainChatRuntime } from '@/features/runs/lib/runRuntimeState';
import { useAuthenticatedResourceUrl } from '@/shared/ui/useAuthenticatedResourceUrl';
import { useDesktopContextMenuTarget } from '@/shared/data/desktop/desktopContextMenu';
import { buildResourceViewerTarget } from '@/features/viewers/lib/viewerTarget';
import { downloadArtifactResource } from '@/features/artifacts/lib/artifactResourceRuntime';
import { useOpenTarget } from '@/features/surfaces/openTarget';
import { useAppMessage } from '@/shared/ui/useAppMessage';
import { useI18n } from '@/shared/i18n';
import { MaterialIcon } from '@/shared/ui/MaterialIcon';
import { SCROLLBAR_THIN_CLASS_NAME } from '@/shared/styles/scrollbarClassNames';
import { ToolPill } from './ToolPill';
import { useTimelineInteraction } from './TimelineInteractionContext';
import styles from './ImageGenerationCard.module.css';

type Surface = { chatId: string; agentKey?: string; teamChat?: boolean };

function GeneratedImageTile({ image, surface }: { image: GeneratedImage; surface: Surface }) {
  const { t } = useI18n();
  const message = useAppMessage();
  const openTarget = useOpenTarget();
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadedUrl, setLoadedUrl] = useState('');
  const [failedUrl, setFailedUrl] = useState('');
  const source = useAuthenticatedResourceUrl(image.url, surface.chatId, { teamChat: surface.teamChat, refreshKey });
  const failed = Boolean(source.error || (source.url && failedUrl === source.url));
  const loaded = Boolean(source.url && loadedUrl === source.url && !failed);
  const target = useMemo(() => buildResourceViewerTarget({ ...image, contentKind: 'image' }), [image]);
  const open = () => {
    if (target) openTarget({ version: 1, kind: 'resource', chatId: surface.chatId, agentKey: surface.agentKey, file: target.url, resourceTarget: target });
  };
  const targetId = React.useId();
  const contextTarget = {
    targetId: `generated-image:${targetId}`, kind: 'chat-resource' as const,
    name: image.name, mediaType: 'image' as const,
    handlers: {
      ...(target ? { 'preview-resource': open } : {}),
      'download-resource': () => { void downloadArtifactResource(image.url, image.name, surface.chatId, undefined, surface.teamChat)
        .catch(() => { void message.error(t('timeline.image.downloadFailed')); }); },
    },
  };
  const contextRef = useDesktopContextMenuTarget<HTMLDivElement>(contextTarget);
  return <div ref={contextRef} className={styles.image}>
    <button type="button" className={styles.open} onClick={open} disabled={!target || !loaded} aria-label={t('attachments.action.view') + ' ' + image.name}>
      {source.url && <img key={`${source.url}:${refreshKey}`} src={source.url} alt={image.name}
        className={loaded ? styles.loaded : styles.loadingImage}
        onLoad={() => setLoadedUrl(source.url)} onError={() => setFailedUrl(source.url)} />}
    </button>
    {!loaded && <div className={styles.overlay} role="status">
      <MaterialIcon name="image" />
      <span>{t(failed ? 'timeline.image.loadFailed' : 'timeline.image.loading')}</span>
      {failed && <button type="button" className={styles.retry} onClick={() => { setFailedUrl(''); setLoadedUrl(''); setRefreshKey(value => value + 1); }}>{t('timeline.image.reload')}</button>}
    </div>}
  </div>;
}

export function ImageGenerationCard({ nodes }: { nodes: TimelineNode[] }) {
  const { t } = useI18n();
  const context = useOptionalAppContext();
  const interaction = useTimelineInteraction();
  const runtime = context ? resolveMainChatRuntime(context.state, context.activeQuerySessionRequestIdRef, context.querySessionsRef) : null;
  const chatId = interaction?.surfaceContext?.chatId ?? context?.state.chatId ?? '';
  const chat = context?.state.chats.find(item => item.chatId === chatId);
  const surface: Surface = interaction?.surfaceContext || { chatId, agentKey: runtime?.agentKey,
    teamChat: Boolean(chat?.teamId || chat?.owner?.kind === 'orchestrated-team') };
  const calls = nodes.map(node => {
    const terminal = context?.state.events.find(event => node.runId && event.runId === node.runId &&
      (event.type === 'run.complete' || event.type === 'run.error' || event.type === 'run.cancel'))?.type;
    const sameRun = !node.runId || runtime?.runId === node.runId;
    const active = interaction?.conversationActive ?? Boolean(sameRun && runtime?.running);
    return { node, display: buildImageGenerationDisplay(node, { active,
      recovering: Boolean(active && runtime?.hasActiveRun && !runtime.streaming),
      terminal: terminal === 'run.complete' || terminal === 'run.error' || terminal === 'run.cancel' ? terminal : undefined }) };
  });
  return <section className={styles.root} aria-label={t('timeline.image.title')}>
    <div className={`${styles.grid} ${SCROLLBAR_THIN_CLASS_NAME}`} tabIndex={0} role="region" aria-label={t('timeline.image.title')}>
      {calls.flatMap(({ node, display }) => Array.from({ length: display.count }, (_, index) => {
        const image = display.images.find(item => item.index === index && item.url);
        const showImage = image && display.status === 'success';
        return <div key={`${node.runId || ''}:${node.toolId || node.id}:${index}`} className={styles.tile}
          data-tool-id={node.toolId || node.id} data-image-index={index} data-image-status={showImage ? 'success' : display.status}
          style={{ aspectRatio: display.ratio }}>
          {showImage ? <GeneratedImageTile key={`${chatId}:${image.url}`} image={image} surface={surface} /> :
            <div className={`${styles.placeholder} ${display.busy ? styles.busy : ''}`} role="status" aria-busy={display.busy}>
              <MaterialIcon name="image" />
              <span>{t(`timeline.image.${display.status === 'success' ? 'missing' : display.status}`)}</span>
              {display.count > 1 && <small>{index + 1} / {display.count}</small>}
            </div>}
        </div>;
      }))}
    </div>
    <div className={styles.details}>
      {nodes.map(node => <ToolPill key={node.id} node={node} />)}
    </div>
  </section>;
}
