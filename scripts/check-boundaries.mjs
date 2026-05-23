import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";

const roots = ["src", "esbuild.config.mjs"];
const blockedPatterns = [
	{ pattern: /\bfetch\s*\(/, label: "network fetch" },
	{ pattern: /\bXMLHttpRequest\b/, label: "XMLHttpRequest" },
	{ pattern: /\bWebSocket\b/, label: "WebSocket" },
	{ pattern: /\brequestUrl\s*\(/, label: "Obsidian requestUrl" },
	{ pattern: /\bnavigator\.clipboard\b/, label: "clipboard access" },
	{ pattern: /\bclipboard\b/i, label: "clipboard reference" },
	{ pattern: /\bopenExternal\s*\(/, label: "external URL opening" },
	{ pattern: /\brequire\s*\(\s*["'](?:node:)?fs["']\s*\)/, label: "fs require" },
	{ pattern: /\bfrom\s+["'](?:node:)?fs["']/, label: "fs import" },
	{ pattern: /\bfrom\s+["']electron["']/, label: "electron import" },
	{ pattern: /\beval\s*\(/, label: "eval" },
	{ pattern: /\bFunction\s*\(/, label: "Function constructor" },
];

const files = [];

function collect(path) {
	const stat = statSync(path);
	if (stat.isDirectory()) {
		for (const entry of readdirSync(path)) {
			collect(join(path, entry));
		}
		return;
	}
	if (/\.(?:ts|js|mjs|json|css|md)$/.test(path)) {
		files.push(path);
	}
}

for (const root of roots) {
	collect(root);
}

const violations = [];

for (const file of files) {
	const text = readFileSync(file, "utf8");
	for (const { pattern, label } of blockedPatterns) {
		if (pattern.test(text)) {
			violations.push(`${relative(process.cwd(), file)}: ${label}`);
		}
	}
}

if (violations.length > 0) {
	console.error("Boundary check failed:");
	for (const violation of violations) {
		console.error(`- ${violation}`);
	}
	process.exit(1);
}

console.log("Boundary check passed.");
