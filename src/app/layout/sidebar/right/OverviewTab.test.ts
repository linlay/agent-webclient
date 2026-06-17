import type { FileChangeSummary, PublishedArtifact } from "@/app/state/types";
import {
	buildFileChangeKey,
	buildFileChangeAnimationSignatures,
	buildFileHistoryCacheKey,
	buildOverviewArtifactItems,
	buildOverviewFileChangeItems,
	getFileIcon,
	loadFileHistoryForCache,
	resolveAnimatedFileChangePaths,
	type FileHistoryCacheEntry,
} from "@/app/layout/sidebar/right/OverviewTab";

jest.mock("@/app/layout/sidebar/right/FileDiffView", () => ({
	FileDiffView: () => null,
}));

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
	runId = "run_1",
): FileChangeSummary {
	return {
		runId,
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
			buildFileChangeKey("run_1", "/workspace/three.ts"),
			buildFileChangeKey("run_1", "/workspace/two.ts"),
		]);
	});

	it("builds stable file history cache keys from chat, run, and path", () => {
		expect(
			buildFileHistoryCacheKey("chat_1", {
				runId: "run_1",
				filePath: "/workspace/app.ts",
			}),
		).toBe("chat_1\u0000run_1\u0000/workspace/app.ts");
	});
});

describe("right sidebar overview file history loading", () => {
	function createResponse(content: string) {
		return {
			status: 200,
			code: 0,
			msg: "success",
			data: { content },
		};
	}

	it("loads original and current snapshots into the component cache", async () => {
		const item = { runId: "run_7", filePath: "/workspace/src/App.tsx" };
		const cacheKey = buildFileHistoryCacheKey("chat_1", item);
		const seenStatuses: Array<FileHistoryCacheEntry["status"]> = [];
		let cache: Record<string, FileHistoryCacheEntry> = {};
		const updateCache = jest.fn(
			(update: (
				current: Record<string, FileHistoryCacheEntry>,
			) => Record<string, FileHistoryCacheEntry>) => {
				cache = update(cache);
				seenStatuses.push(cache[cacheKey]?.status);
			},
		);
		const fetchHistory = jest
			.fn()
			.mockResolvedValueOnce(createResponse("old\n"))
			.mockResolvedValueOnce(createResponse("new\n"));

		const result = await loadFileHistoryForCache({
			chatId: "chat_1",
			item,
			cache,
			updateCache,
			fetchHistory,
		});

		expect(result).toBe("loaded");
		expect(seenStatuses).toEqual(["loading", "loaded"]);
		expect(fetchHistory).toHaveBeenNthCalledWith(1, {
			chatId: "chat_1",
			runId: "run_7",
			filePath: "/workspace/src/App.tsx",
			version: "original",
		});
		expect(fetchHistory).toHaveBeenNthCalledWith(2, {
			chatId: "chat_1",
			runId: "run_7",
			filePath: "/workspace/src/App.tsx",
			version: "current",
		});
		expect(cache[cacheKey]).toEqual({
			status: "loaded",
			original: "old\n",
			current: "new\n",
		});
		expect(updateCache).toHaveBeenCalledTimes(2);
	});

	it("stores an error state when remote history is unavailable", async () => {
		const item = { runId: "run_7", filePath: "/workspace/src/App.tsx" };
		const cacheKey = buildFileHistoryCacheKey("chat_1", item);
		let cache: Record<string, FileHistoryCacheEntry> = {};
		const updateCache = (
			update: (
				current: Record<string, FileHistoryCacheEntry>,
			) => Record<string, FileHistoryCacheEntry>,
		) => {
			cache = update(cache);
		};
		const fetchHistory = jest
			.fn()
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce(createResponse("new\n"));

		const result = await loadFileHistoryForCache({
			chatId: "chat_1",
			item,
			cache,
			updateCache,
			fetchHistory,
		});

		expect(result).toBe("error");
		expect(fetchHistory).toHaveBeenCalledTimes(2);
		expect(cache[cacheKey]).toEqual({ status: "error" });
	});

	it("skips loading when snapshots are already cached", async () => {
		const item = { runId: "run_7", filePath: "/workspace/src/App.tsx" };
		const cacheKey = buildFileHistoryCacheKey("chat_1", item);
		let cache: Record<string, FileHistoryCacheEntry> = {
			[cacheKey]: {
				status: "loaded",
				original: "old\n",
				current: "new\n",
			},
		};
		const updateCache = jest.fn(
			(update: (
				current: Record<string, FileHistoryCacheEntry>,
			) => Record<string, FileHistoryCacheEntry>) => {
				cache = update(cache);
			},
		);
		const fetchHistory = jest.fn();

		const result = await loadFileHistoryForCache({
			chatId: "chat_1",
			item,
			cache,
			updateCache,
			fetchHistory,
		});

		expect(result).toBe("skipped");
		expect(fetchHistory).not.toHaveBeenCalled();
		expect(updateCache).not.toHaveBeenCalled();
		expect(cache[cacheKey]).toEqual({
			status: "loaded",
			original: "old\n",
			current: "new\n",
		});
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
