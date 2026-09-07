import React from "react";
import { SourceDetailTabContent } from "@/features/source/components/SourceDetail";

export {
  SourceDetailContent,
  resolveInitialSourceChunkId,
} from "@/features/source/components/SourceDetail";

/** Adapts the active source selection to the reusable source detail view. */
export const SourceDetailTab: React.FC = () => <SourceDetailTabContent />;
