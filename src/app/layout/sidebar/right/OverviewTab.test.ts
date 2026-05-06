import type { PublishedArtifact } from "@/app/state/types";
import { buildOverviewArtifactItems } from "@/app/layout/sidebar/right/OverviewTab";

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
});
