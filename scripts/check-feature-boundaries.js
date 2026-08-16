#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const featuresRoot = path.join(repoRoot, "src", "features");
const shareRoot = path.join(repoRoot, "src", "share");
const importPattern = /(?:from\s+|import\s*\(|require\s*\(|jest\.mock\s*\()\s*["']([^"']+)["']/g;

const forbiddenByFeature = {
	chats: ["conversation", "timeline", "transport", "workers"],
	events: ["chats", "conversation", "timeline", "transport"],
	runs: ["conversation", "events", "timeline", "transport", "tools", "voice", "workers"],
	timeline: ["chats", "conversation", "transport"],
	transport: [
		"artifacts",
		"chats",
		"composer",
		"conversation",
		"events",
		"plan",
		"runs",
		"tasks",
		"timeline",
		"tools",
		"voice",
		"workers",
	],
};

function walk(directory) {
	const files = [];
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const target = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...walk(target));
		} else if (/\.(?:ts|tsx)$/.test(entry.name)) {
			files.push(target);
		}
	}
	return files;
}

function readImports(source) {
	const imports = [];
	for (const match of source.matchAll(importPattern)) {
		imports.push(match[1]);
	}
	return imports;
}

const violations = [];
for (const [feature, forbiddenFeatures] of Object.entries(forbiddenByFeature)) {
	const featureRoot = path.join(featuresRoot, feature);
	if (!fs.existsSync(featureRoot)) continue;

	for (const file of walk(featureRoot)) {
		const source = fs.readFileSync(file, "utf8");
		const relativeFile = path.relative(repoRoot, file);
		for (const importedPath of readImports(source)) {
			for (const forbiddenFeature of forbiddenFeatures) {
				if (importedPath.startsWith(`@/features/${forbiddenFeature}/`)) {
					violations.push(
						`${relativeFile}: ${feature} must not import ${importedPath}`,
					);
				}
			}
			if (feature === "events" && importedPath === "react") {
				violations.push(`${relativeFile}: events must not import React`);
			}
		}
	}
}

const realtimePrimitivePaths = [
	"@/features/transport/lib/wsClientSingleton",
	"@/features/transport/lib/queryStreamRuntime.ws",
	"@/features/transport/lib/queryStreamRuntime.sse",
	"@/features/terminal/lib/terminalTransport",
	"@/features/terminal/lib/terminalRemoteSession",
];
const desktopForbiddenTransportPaths = [
	"@/features/transport/lib/standaloneRealtimeTransport",
	"@/features/transport/lib/standaloneRunTransport",
	"@/features/transport/lib/standalonePushTransport",
	"@/features/transport/lib/standaloneTerminalTransport",
	"@/features/transport/lib/standaloneWsClient",
	"@/features/transport/lib/wsClientSingleton",
	"@/features/transport/lib/wsClient",
];
const directRunControlNames = [
	"createQueryStream",
	"interruptChat",
	"steerChat",
	"submitAwaiting",
	"submitTool",
	"updateAccessLevel",
];
const sourceRoot = path.join(repoRoot, "src");
for (const file of walk(sourceRoot)) {
	if (/\.(?:test|spec)\.(?:ts|tsx)$/.test(file)) continue;
	const relativeFile = path.relative(repoRoot, file);
	const isTransportInfrastructure = relativeFile.startsWith("src/features/transport/");
	const isDesktopTransportInfrastructure =
		relativeFile.startsWith("src/features/transport/") &&
		/^desktop[^/]*\.(?:ts|tsx)$/iu.test(path.basename(relativeFile));
	const isDataInfrastructure = relativeFile.startsWith("src/shared/data/api/");
	const source = fs.readFileSync(file, "utf8");
	for (const importedPath of readImports(source)) {
		if (
			isDesktopTransportInfrastructure &&
			desktopForbiddenTransportPaths.includes(importedPath)
		) {
			violations.push(
				`${relativeFile}: Desktop transport must not import ${importedPath}`,
			);
		}
		if (
			!isTransportInfrastructure &&
			realtimePrimitivePaths.some((primitivePath) => importedPath === primitivePath)
		) {
			violations.push(
				`${relativeFile}: business code must use RealtimeTransport instead of ${importedPath}`,
			);
		}
	}
	if (isTransportInfrastructure || isDataInfrastructure) continue;
	for (const name of directRunControlNames) {
		const directImport = new RegExp(
			`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*["']@/shared/data(?:/api/client)?["']`,
			"s",
		);
		if (directImport.test(source)) {
			violations.push(
				`${relativeFile}: business code must use RunTransport instead of importing ${name}`,
			);
		}
	}
}

const shareForbiddenImports = [
	"@/app/",
	"@/features/",
	"@/shared/data/auth/",
	"@/shared/data/desktop/",
];
if (fs.existsSync(shareRoot)) {
	for (const file of walk(shareRoot)) {
		const source = fs.readFileSync(file, "utf8");
		const relativeFile = path.relative(repoRoot, file);
		for (const importedPath of readImports(source)) {
			if (shareForbiddenImports.some((prefix) => importedPath.startsWith(prefix))) {
				violations.push(`${relativeFile}: share entry must not import ${importedPath}`);
			}
		}
	}
}

const pureConversationRendererFiles = [
	path.join(repoRoot, "src", "shared", "ui", "ConversationMarkdown.tsx"),
	path.join(
		repoRoot,
		"src",
		"shared",
		"ui",
		"markdown-code",
		"ConversationMarkdownCode.tsx",
	),
	path.join(repoRoot, "src", "shared", "utils", "webClipboard.ts"),
];
for (const file of pureConversationRendererFiles) {
	if (!fs.existsSync(file)) continue;
	const source = fs.readFileSync(file, "utf8");
	const relativeFile = path.relative(repoRoot, file);
	for (const importedPath of readImports(source)) {
		if (shareForbiddenImports.some((prefix) => importedPath.startsWith(prefix))) {
			violations.push(`${relativeFile}: shared renderer must not import ${importedPath}`);
		}
	}
}

if (violations.length > 0) {
	console.error("Feature boundary violations:\n" + violations.join("\n"));
	process.exit(1);
}

console.log("Feature boundaries are valid.");
