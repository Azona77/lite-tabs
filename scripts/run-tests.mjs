import { readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import process from "node:process";
import { build } from "esbuild";

const outputDirectory = join(process.cwd(), ".test-dist");
const entryPoints = readdirSync(join(process.cwd(), "tests"))
	.filter((name) => name.endsWith(".test.ts"))
	.map((name) => join("tests", name));

try {
	await build({
		entryPoints,
		bundle: true,
		format: "cjs",
		platform: "node",
		target: "node20",
		outdir: outputDirectory,
		logLevel: "silent",
	});
	const testFiles = readdirSync(outputDirectory)
		.filter((name) => name.endsWith(".test.js"))
		.map((name) => join(outputDirectory, name));
	const result = spawnSync(process.execPath, ["--test", ...testFiles], {
		stdio: "inherit",
	});
	process.exitCode = result.status ?? 1;
} finally {
	rmSync(outputDirectory, { recursive: true, force: true });
}
