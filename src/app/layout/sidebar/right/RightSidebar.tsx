import React from "react";
import { useAppState } from "@/app/state/AppContext";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { Tabs, type TabsProps } from "antd";
import { AttachmentPreviewPanel } from "@/app/layout/sidebar/right/AttachmentPreviewPanel";
import { DebugTab } from "@/app/layout/sidebar/right/DebugTab";
import { OverviewTab } from "@/app/layout/sidebar/right/OverviewTab";
import type { RightSidebarTabKey } from "@/app/state/uiTypes";

export const RightSidebar: React.FC = () => {
  const state = useAppState();
  const preview = state.attachmentPreview;
  const desktopSidebarVisible = state.rightSidebarOpen;
  const [activeTab, setActiveTab] =
    React.useState<RightSidebarTabKey>("overview");

  React.useEffect(() => {
    if (!state.rightSidebarOpen || !state.rightSidebarOpenTab) {
      return;
    }

    if (state.rightSidebarOpenTab === "preview" && !preview) {
      setActiveTab("overview");
      return;
    }

    setActiveTab(state.rightSidebarOpenTab);
  }, [
    preview,
    state.rightSidebarOpen,
    state.rightSidebarOpenTab,
  ]);

  React.useEffect(() => {
    if (activeTab === "preview" && !preview) {
      setActiveTab("overview");
    }
  }, [activeTab, preview]);

  const tabItems = React.useMemo<TabsProps["items"]>(() => {
    const items: NonNullable<TabsProps["items"]> = [
      {
        key: "overview",
        label: "概览",
        icon: <MaterialIcon name="dashboard" />,
        children: <OverviewTab />,
      },
      {
        key: "debug",
        label: "调试",
        icon: <MaterialIcon name="bug_report" />,
        children: <DebugTab />,
      },
    ];

    if (preview) {
      items.push({
        key: "preview",
        label: "预览",
        icon: <MaterialIcon name="visibility" />,
        children: <AttachmentPreviewPanel />,
      });
    }

    return items;
  }, [preview]);

  return (
    <aside
      className={`sidebar right-sidebar ${desktopSidebarVisible ? "is-open" : ""}`}
    >
      <Tabs
        className="right-sidebar-tabs"
        size="small"
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as RightSidebarTabKey)}
        items={tabItems}
      />
    </aside>
  );
};
