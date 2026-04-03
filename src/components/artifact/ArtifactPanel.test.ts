import type { PublishedArtifact } from "../../context/types";
import { buildArtifactSummaryView } from "./ArtifactPanel";

describe("buildArtifactSummaryView", () => {
	it("shows the latest artifact in the collapsed summary line", () => {
		const artifacts: PublishedArtifact[] = [
			{
				artifactId: "artifact_1",
				timestamp: 100,
				artifact: {
					type: "file",
					name: "draft.txt",
					mimeType: "text/plain",
					sha256: "sha-1",
					sizeBytes: 120,
					url: "https://example.com/draft.txt",
				},
			},
			{
				artifactId: "artifact_2",
				timestamp: 200,
				artifact: {
					type: "file",
					name: "final.pdf",
					mimeType: "application/pdf",
					sha256: "sha-2",
					sizeBytes: 4096,
					url: "https://example.com/final.pdf",
				},
			},
		];

		const summary = buildArtifactSummaryView(artifacts);

		expect(summary.countText).toBe("2 个文件");
		expect(summary.latestArtifact?.artifactId).toBe("artifact_2");
		expect(summary.latestSummaryText).toContain("final.pdf");
		expect(summary.artifacts.map((item) => item.artifactId)).toEqual([
			"artifact_2",
			"artifact_1",
		]);
	});
});
