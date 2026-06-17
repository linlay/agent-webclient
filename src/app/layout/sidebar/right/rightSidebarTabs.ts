import type {
	FileContentSnapshot,
	PublishedArtifact,
} from "@/app/state/types";
import type { OverviewFileChangeItem } from "@/app/layout/sidebar/right/OverviewTab";

export type StaticRightSidebarTabKey = "overview" | "review" | "preview";
export type RightSidebarActiveTabKey = StaticRightSidebarTabKey | string;

export type DynamicRightSidebarTab =
	| {
			type: "fileDiff";
			key: string;
			title: string;
			runId: string;
			filePath: string;
			fileChange: OverviewFileChangeItem;
			snapshot: FileContentSnapshot | null;
	  }
	| {
			type: "artifact";
			key: string;
			title: string;
			artifact: PublishedArtifact;
	  };

export function displayRightSidebarFileName(filePath: string): string {
	const normalized = filePath.replace(/\\/g, "/");
	return normalized.split("/").pop() || filePath;
}

export function buildFileDiffTabKey(
	fileChange: Pick<OverviewFileChangeItem, "runId" | "filePath">,
): string {
	return `file:${fileChange.runId}:${fileChange.filePath}`;
}

export function buildArtifactTabKey(
	artifact: Pick<PublishedArtifact, "artifactId">,
): string {
	return `artifact:${artifact.artifactId}`;
}

export function openFileDiffRightSidebarTab(
	tabs: DynamicRightSidebarTab[],
	fileChange: OverviewFileChangeItem,
	snapshot: FileContentSnapshot | null | undefined,
): { tabs: DynamicRightSidebarTab[]; activeKey: string } {
	const key = buildFileDiffTabKey(fileChange);
	const nextTab: DynamicRightSidebarTab = {
		type: "fileDiff",
		key,
		title: displayRightSidebarFileName(fileChange.filePath),
		runId: fileChange.runId,
		filePath: fileChange.filePath,
		fileChange,
		snapshot: snapshot || null,
	};
	const index = tabs.findIndex((tab) => tab.key === key);
	if (index < 0) {
		return { tabs: [...tabs, nextTab], activeKey: key };
	}
	const nextTabs = tabs.slice();
	nextTabs[index] = nextTab;
	return { tabs: nextTabs, activeKey: key };
}

export function openArtifactRightSidebarTab(
	tabs: DynamicRightSidebarTab[],
	artifact: PublishedArtifact,
): { tabs: DynamicRightSidebarTab[]; activeKey: string } {
	const key = buildArtifactTabKey(artifact);
	const nextTab: DynamicRightSidebarTab = {
		type: "artifact",
		key,
		title: artifact.artifact.name || artifact.artifactId,
		artifact,
	};
	const index = tabs.findIndex((tab) => tab.key === key);
	if (index < 0) {
		return { tabs: [...tabs, nextTab], activeKey: key };
	}
	const nextTabs = tabs.slice();
	nextTabs[index] = nextTab;
	return { tabs: nextTabs, activeKey: key };
}

export function closeDynamicRightSidebarTab(
	tabs: DynamicRightSidebarTab[],
	tabKey: string,
	activeKey: RightSidebarActiveTabKey,
	fallbackKey: StaticRightSidebarTabKey,
): { tabs: DynamicRightSidebarTab[]; activeKey: RightSidebarActiveTabKey } {
	const index = tabs.findIndex((tab) => tab.key === tabKey);
	if (index < 0) {
		return { tabs, activeKey };
	}
	const nextTabs = tabs.filter((tab) => tab.key !== tabKey);
	if (activeKey !== tabKey) {
		return { tabs: nextTabs, activeKey };
	}
	const previousTab = nextTabs[Math.max(0, index - 1)];
	return {
		tabs: nextTabs,
		activeKey: previousTab?.key || fallbackKey,
	};
}
