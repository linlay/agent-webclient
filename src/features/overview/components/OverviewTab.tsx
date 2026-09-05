import React from "react";
import { OverviewContent } from "@/features/overview/components/OverviewPanel";

export * from "@/features/overview/components/OverviewPanel";

/** Adapts the active application state to the reusable overview panel. */
export const OverviewTab: React.FC = () => <OverviewContent />;
