import { readFileSync } from "node:fs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const manifest = readJson("manifest.json");
const versions = readJson("versions.json");
const expectedVersion = manifest.version;
const mismatches = [];

for (const [name, version] of [
	["package.json", packageJson.version],
	["package-lock.json", packageLock.version],
	["package-lock root package", packageLock.packages?.[""]?.version],
]) {
	if (version !== expectedVersion) {
		mismatches.push(`${name} has ${String(version)}, expected ${expectedVersion}`);
	}
}

if (versions[expectedVersion] !== manifest.minAppVersion) {
	mismatches.push(
		`versions.json maps ${expectedVersion} to ${String(versions[expectedVersion])}, expected ${manifest.minAppVersion}`
	);
}

if (mismatches.length > 0) {
	console.error("Version check failed:");
	for (const mismatch of mismatches) console.error(`- ${mismatch}`);
	process.exit(1);
}

console.log("Version check passed.");
