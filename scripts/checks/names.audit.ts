// Checks every TypeScript file in src/ and scripts/ against the naming rules of docs/decisions.md.
// Usage: npm run audit:names (also part of npm run check). Exits 1 on any violation.

import fileSystem from "node:fs";
import path from "node:path";
import { findNameViolations, isBannedFileName } from "./names.rules.ts";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..", "..");
const AUDITED_DIRECTORIES = ["src", "scripts", "playground"];
const SOURCE_FILE = /\.tsx?$/;

// why: no generated source lives here; a generated folder joins this list with its reason.
const GENERATED_DIRECTORIES: string[] = [];

// why: its fixtures are violations on purpose, written as source text.
const RULE_FIXTURE_FILE = path.join("scripts", "checks", "names.rules.test.ts");

function start() {
  auditNames();
}

function auditNames() {
  const filePaths = AUDITED_DIRECTORIES.flatMap(listSourceFiles);
  const findings = filePaths.flatMap(auditFile);

  if (findings.length === 0) {
    console.log(`Names audit: ${filePaths.length} files, no violations.`);
    return;
  }

  console.error(findings.join("\n"));
  console.error(`Names audit: ${findings.length} violations. See docs/decisions.md, Naming.`);
  process.exitCode = 1;
}

function listSourceFiles(directory: string) {
  const entries = fileSystem.readdirSync(path.join(REPOSITORY_ROOT, directory), {
    recursive: true,
    encoding: "utf8",
  });
  const filePaths = entries
    .map((entry) => path.join(directory, entry))
    .filter((relativePath) => SOURCE_FILE.test(relativePath))
    .filter((relativePath) => !relativePath.endsWith(".d.ts") && relativePath !== RULE_FIXTURE_FILE)
    .filter(
      (relativePath) =>
        !GENERATED_DIRECTORIES.some((generated) => relativePath.startsWith(generated)),
    );
  return filePaths;
}

function auditFile(relativePath: string) {
  const sourceText = fileSystem.readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8");
  const nameFindings = findNameViolations(sourceText).map(
    (violation) => `${relativePath}:${violation.line} ${violation.name}: ${violation.rule}`,
  );
  const fileFindings = isBannedFileName(path.basename(relativePath))
    ? [`${relativePath}: banned file name (helpers, utils, common, misc)`]
    : [];
  const findings = [...fileFindings, ...nameFindings];
  return findings;
}

start();
