import type { FileChangeSummary, PublishedArtifact } from "@/app/state/types";
import {
	buildFileChangeAnimationSignatures,
	buildOverviewArtifactItems,
	buildOverviewFileChangeItems,
	resolveAnimatedFileChangePaths,
} from "@/app/layout/sidebar/right/OverviewTab";

function createArtifact(
	artifactId: string,
	name: string,
	timestamp: number,
): PublishedArtifact {
	return {
		artifactId,
		timestamp,
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

function createFileChange(
	filePath: string,
	addedLines: number,
	deletedLines: number,
	lastUpdatedAt: number,
	operationCount = 1,
): FileChangeSummary {
	return {
		filePath,
		addedLines,
		deletedLines,
		editedLines: deletedLines,
		operationCount,
		lastUpdatedAt,
	};
}

describe("right sidebar overview builders", () => {
	it("sorts artifacts by newest timestamp first", () => {
		const artifacts = [
			createArtifact("artifact_1", "first.txt", 10),
			createArtifact("artifact_2", "second.txt", 30),
			createArtifact("artifact_3", "third.txt", 20),
		];

		const items = buildOverviewArtifactItems(artifacts);

		expect(items.map((item) => item.artifactId)).toEqual([
			"artifact_2",
			"artifact_3",
			"artifact_1",
		]);
	});

	it("sorts file changes by latest update first", () => {
		const changes = [
			createFileChange("/workspace/one.ts", 1, 0, 10),
			createFileChange("/workspace/two.ts", 2, 1, 30),
			createFileChange("/workspace/three.ts", 3, 1, 20),
		];

		const items = buildOverviewFileChangeItems(changes);

		expect(items.map((item) => item.filePath)).toEqual([
			"/workspace/two.ts",
			"/workspace/three.ts",
			"/workspace/one.ts",
		]);
	});

	it("detects only file change rows whose stats changed", () => {
		const previous = buildFileChangeAnimationSignatures([
			...buildOverviewFileChangeItems([
				createFileChange("/workspace/one.ts", 1, 0, 10),
				createFileChange("/workspace/two.ts", 2, 1, 20),
			]),
		]);
		const next = buildFileChangeAnimationSignatures([
			...buildOverviewFileChangeItems([
				createFileChange("/workspace/one.ts", 1, 0, 10),
				createFileChange("/workspace/two.ts", 5, 2, 40, 2),
				createFileChange("/workspace/three.ts", 1, 1, 50),
			]),
		]);

		expect(resolveAnimatedFileChangePaths(previous, next)).toEqual([
			"/workspace/three.ts",
			"/workspace/two.ts",
		]);
	});
});
