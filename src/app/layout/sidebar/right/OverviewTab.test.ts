import type { FileChangeSummary, PublishedArtifact } from "@/app/state/types";
import {
	buildFileChangeAnimationSignatures,
	buildOverviewArtifactItems,
	buildOverviewFileChangeItems,
	getFileIcon,
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

describe("getFileIcon", () => {
	it("returns code for .ts and .tsx files", () => {
		expect(getFileIcon("app.ts")).toBe("code");
		expect(getFileIcon("Component.tsx")).toBe("code");
	});

	it("returns javascript for .js and .jsx files", () => {
		expect(getFileIcon("script.js")).toBe("javascript");
		expect(getFileIcon("component.jsx")).toBe("javascript");
		expect(getFileIcon("lib.mjs")).toBe("javascript");
		expect(getFileIcon("polyfill.cjs")).toBe("javascript");
	});

	it("returns css for .css, .scss, .sass, .less files", () => {
		expect(getFileIcon("styles.css")).toBe("css");
		expect(getFileIcon("theme.scss")).toBe("css");
		expect(getFileIcon("vars.sass")).toBe("css");
		expect(getFileIcon("mixins.less")).toBe("css");
	});

	it("returns html for .html and .htm files", () => {
		expect(getFileIcon("index.html")).toBe("html");
		expect(getFileIcon("page.htm")).toBe("html");
	});

	it("returns description for .md and .mdx files", () => {
		expect(getFileIcon("README.md")).toBe("description");
		expect(getFileIcon("guide.mdx")).toBe("description");
	});

	it("returns data_object for .json files", () => {
		expect(getFileIcon("config.json")).toBe("data_object");
	});

	it("returns code for .py, .java, .go, .rs files", () => {
		expect(getFileIcon("main.py")).toBe("code");
		expect(getFileIcon("Service.java")).toBe("code");
		expect(getFileIcon("server.go")).toBe("code");
		expect(getFileIcon("lib.rs")).toBe("code");
	});

	it("returns terminal for .sh, .bash, .zsh files", () => {
		expect(getFileIcon("deploy.sh")).toBe("terminal");
		expect(getFileIcon("setup.bash")).toBe("terminal");
	});

	it("returns image for image files", () => {
		expect(getFileIcon("logo.png")).toBe("image");
		expect(getFileIcon("photo.jpg")).toBe("image");
		expect(getFileIcon("photo.jpeg")).toBe("image");
		expect(getFileIcon("icon.svg")).toBe("image");
		expect(getFileIcon("anim.gif")).toBe("image");
		expect(getFileIcon("banner.webp")).toBe("image");
	});

	it("returns lock for .lock files", () => {
		expect(getFileIcon("package-lock.lock")).toBe("lock");
	});

	it("returns settings for .env and .properties files", () => {
		expect(getFileIcon(".env")).toBe("settings");
		expect(getFileIcon("app.properties")).toBe("settings");
	});

	it("falls back to description for unknown extensions", () => {
		expect(getFileIcon("file.xyz")).toBe("description");
		expect(getFileIcon("file.foo")).toBe("description");
	});

	it("falls back to description for files without extension", () => {
		expect(getFileIcon("Dockerfile")).toBe("description");
		expect(getFileIcon("Makefile")).toBe("description");
	});

	it("handles multi-level paths correctly", () => {
		expect(getFileIcon("/workspace/src/app.tsx")).toBe("code");
		expect(getFileIcon("/workspace/assets/style.css")).toBe("css");
	});

	it("uses the last extension for files with multiple dots", () => {
		expect(getFileIcon("file.min.js")).toBe("javascript");
		expect(getFileIcon("file.test.ts")).toBe("code");
	});

	it("is case-insensitive", () => {
		expect(getFileIcon("Component.TS")).toBe("code");
		expect(getFileIcon("Style.CSS")).toBe("css");
	});
});
