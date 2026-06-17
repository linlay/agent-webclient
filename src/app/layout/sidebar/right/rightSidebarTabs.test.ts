import type { FileContentSnapshot, PublishedArtifact } from "@/app/state/types";
import type { OverviewFileChangeItem } from "@/app/layout/sidebar/right/OverviewTab";
import {
	buildArtifactTabKey,
	buildFileDiffTabKey,
	closeDynamicRightSidebarTab,
	openArtifactRightSidebarTab,
	openFileDiffRightSidebarTab,
} from "@/app/layout/sidebar/right/rightSidebarTabs";

function createFileChange(filePath: string): OverviewFileChangeItem {
	return {
		runId: "run_1",
		filePath,
		addedLines: 2,
		deletedLines: 1,
		editedLines: 1,
		operationCount: 1,
		lastUpdatedAt: 100,
	};
}

function createSnapshot(filePath: string): FileContentSnapshot {
	return {
		runId: "run_1",
		filePath,
		originalContent: "old\n",
		currentContent: "new\n",
		lastUpdatedAt: 120,
	};
}

function createArtifact(artifactId: string, name: string): PublishedArtifact {
	return {
		artifactId,
		timestamp: 100,
		artifact: {
			mimeType: "text/plain",
			name,
			sha256: artifactId,
			sizeBytes: 12,
			type: "file",
			url: `/files/${name}`,
		},
	};
}

describe("right sidebar dynamic tabs", () => {
	it("opens one reusable dynamic tab per changed file", () => {
		const fileChange = createFileChange("/workspace/src/App.tsx");
		const first = openFileDiffRightSidebarTab([], fileChange, createSnapshot(fileChange.filePath));
		const second = openFileDiffRightSidebarTab(
			first.tabs,
			fileChange,
			createSnapshot(fileChange.filePath),
		);

		expect(first.activeKey).toBe(buildFileDiffTabKey(fileChange));
		expect(second.activeKey).toBe(first.activeKey);
		expect(second.tabs).toHaveLength(1);
		expect(second.tabs[0]).toMatchObject({
			type: "fileDiff",
			title: "App.tsx",
			filePath: "/workspace/src/App.tsx",
		});
	});

	it("opens a dynamic tab for artifact preview", () => {
		const artifact = createArtifact("artifact_1", "report.txt");
		const result = openArtifactRightSidebarTab([], artifact);

		expect(result.activeKey).toBe(buildArtifactTabKey(artifact));
		expect(result.tabs).toEqual([
			expect.objectContaining({
				type: "artifact",
				key: "artifact:artifact_1",
				title: "report.txt",
			}),
		]);
	});

	it("selects a stable fallback when closing the active dynamic tab", () => {
		const app = createFileChange("/workspace/src/App.tsx");
		const index = createFileChange("/workspace/src/index.tsx");
		const withApp = openFileDiffRightSidebarTab([], app, createSnapshot(app.filePath));
		const withIndex = openFileDiffRightSidebarTab(
			withApp.tabs,
			index,
			createSnapshot(index.filePath),
		);
		const result = closeDynamicRightSidebarTab(
			withIndex.tabs,
			withIndex.activeKey,
			withIndex.activeKey,
			"review",
		);

		expect(result.tabs.map((tab) => tab.key)).toEqual([buildFileDiffTabKey(app)]);
		expect(result.activeKey).toBe(buildFileDiffTabKey(app));
	});
});
