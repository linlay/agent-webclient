#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const featuresRoot = path.join(repoRoot, "src", "features");
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

if (violations.length > 0) {
	console.error("Feature boundary violations:\n" + violations.join("\n"));
	process.exit(1);
}

console.log("Feature boundaries are valid.");
