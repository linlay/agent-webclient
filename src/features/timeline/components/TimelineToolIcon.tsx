import React from "react";
import { MaterialIcon, type MaterialIconName } from "@/shared/ui/MaterialIcon";
import { resolveTimelineToolIcon, type TimelineToolIconKind } from "../lib/timelineToolIcon";

const MATERIAL_ICONS: Partial<Record<TimelineToolIconKind, MaterialIconName>> = {
  fallback: "build",
  image: "image",
  bash: "terminal",
  vision: "visibility",
  browser: "code",
  plan: "checklist",
  agent: "hub",
};

// Approved timeline artwork: 24px canvas, displayed at 18px, inherited tool blue.
const TOOL_SHAPES: Partial<Record<TimelineToolIconKind, React.ReactNode>> = {
  wait: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.4 1.7" /></>,
  read: <><path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 15h8M8 18h5" /></>,
  write: <><path d="M14 3H5v18h14V8zM14 3v5h5M12 11v7m-3-3 3 3 3-3" /></>,
  edit: <><path d="M12 3H5v18h14v-7M10 17l1-4 7-7 3 3-7 7zM16 8l3 3" /></>,
  glob: <><path d="M10 19H3V5h6l2 3h10v3" /><circle cx="16" cy="16" r="4" /><path d="m19 19 3 3" /></>,
  grep: <><path d="M12 3H5v18h5M8 7h4M8 10h3" /><circle cx="16" cy="14" r="4" /><path d="m19 17 3 3M14 14h4" /></>,
  web: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a17 17 0 0 1 0 18 17 17 0 0 1 0-18" /></>,
  desktop: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M3 9h18M8 9v11M6 6.5h.01m2.5 0h.01M12 13h5m-5 3h3" /></>,
  question: <><path d="M21 11.5c0 4.4-4 8-9 8-1.2 0-2.4-.2-3.4-.6L4 21l1.1-4.3C3.8 15.3 3 13.5 3 11.5c0-4.4 4-8 9-8s9 3.6 9 8zM9.8 8.8a2.2 2.2 0 0 1 4.4.3c0 1.6-2.2 1.7-2.2 3.3M12 15h.01" /></>,
  run: <><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4z" /></>,
  publish: <><path d="M12 3 3.5 7.5 12 12l8.5-4.5L12 3zM3.5 7.5v9L12 21l8.5-4.5v-9M12 12v9M7.8 5.2l8.5 4.5" /></>,
  datetime: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 11h18m-13 4h3" /></>,
  regex: <><circle cx="5" cy="17" r="1" /><path d="M15 5v12m-5-9 10 6m-10 0 10-6" /></>,
};

export const TimelineToolIcon: React.FC<{
  toolNames: readonly (string | null | undefined)[];
  className?: string;
}> = ({ toolNames, className }) => {
  const kind = resolveTimelineToolIcon(toolNames);
  const materialIcon = MATERIAL_ICONS[kind];
  return (
    <span className={className} data-tool-icon={kind} aria-hidden="true">
      {materialIcon ? <MaterialIcon name={materialIcon} /> : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
          focusable="false">
          {TOOL_SHAPES[kind]}
        </svg>
      )}
    </span>
  );
};
