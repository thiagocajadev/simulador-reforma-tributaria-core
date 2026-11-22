// Captures golden fixtures from an upstream calculator running locally.
// Usage: node scripts/fixtures.capture.mjs [--target <name>] [--base-url <url>], where <name> is
// regime-regular, simples-nacional or simples-nacional-nfse.
// Each <case>.input.json in the target's fixtures folder is posted to every endpoint of the target.
// Nothing is written until every response is valid, so a failed run leaves the fixtures untouched.

import fileSystem from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

const FIXTURES_ROOT = path.join(import.meta.dirname, "..", "fixtures");
const DEFAULT_TARGET = "regime-regular";
const INPUT_SUFFIX = ".input.json";
const MANIFEST_FILE = "manifest.json";
const JSON_INDENT = 2;
const EXPECTED_STATUSES = [200, 422];
const JSON_CONTENT_TYPE = /^application\/(problem\+)?json\b/;
const VOLATILE_PLACEHOLDER = "<volatile>";
const VOLATILE_ERROR_FIELDS = ["timestamp"];

const CAPTURE_TARGETS = {
  "regime-regular": {
    upstream: "calculadora-rtc-regime-regular",
    directory: path.join(FIXTURES_ROOT, "regime-regular"),
    defaultBaseUrl: "http://localhost:8080/api/calculadora",
    endpoints: [
      { name: "regime-geral", route: "/regime-geral" },
      { name: "observabilidade", route: "/observabilidade/regime-geral" },
    ],
  },
  "simples-nacional": {
    upstream: "calculadora-rtc-simples-nacional",
    directory: path.join(FIXTURES_ROOT, "simples-nacional"),
    defaultBaseUrl: "http://localhost:8082/api/calculadora",
    endpoints: [{ name: "observabilidade", route: "/observabilidade/simples-nacional" }],
  },
  "simples-nacional-nfse": {
    upstream: "calculadora-rtc-simples-nacional",
    directory: path.join(FIXTURES_ROOT, "simples-nacional-nfse"),
    defaultBaseUrl: "http://localhost:8082/api/calculadora",
    endpoints: [
      { name: "nao-assistido", route: "/observabilidade/simples-nacional/nao-assistido" },
    ],
  },
};

async function start() {
  await captureFixtures(process.argv.slice(2));
}

async function captureFixtures(argumentList) {
  const { target, baseUrl } = parseOptions(argumentList);
  const caseNames = await listCaseNames(target.directory);
  const captures = [];

  for (const caseName of caseNames) {
    captures.push(await captureCase({ target, baseUrl, caseName }));
  }

  await writeCaptures(target, captures);
  console.log(`Captured ${captures.length} cases of ${target.upstream} from ${baseUrl}`);
}

function parseOptions(argumentList) {
  const { values } = parseArgs({
    args: argumentList,
    options: {
      target: { type: "string", default: DEFAULT_TARGET },
      "base-url": { type: "string" },
    },
  });

  const target = CAPTURE_TARGETS[values.target];

  if (target === undefined) {
    const knownTargets = Object.keys(CAPTURE_TARGETS).join(" or ");

    throw new Error(`--target must be ${knownTargets}, got "${values.target}"`);
  }

  const baseUrl = (values["base-url"] ?? target.defaultBaseUrl).replace(/\/+$/, "");
  const isHttpUrl = URL.canParse(baseUrl) && new URL(baseUrl).protocol.startsWith("http");

  if (!isHttpUrl) {
    throw new Error(`--base-url must be an http(s) URL, got "${baseUrl}"`);
  }

  const options = { target, baseUrl };
  return options;
}

async function listCaseNames(directory) {
  const fileNames = await fileSystem.readdir(directory);
  const caseNames = fileNames
    .filter((fileName) => fileName.endsWith(INPUT_SUFFIX))
    .map((fileName) => fileName.slice(0, -INPUT_SUFFIX.length))
    .sort();

  if (caseNames.length === 0) {
    throw new Error(`No *${INPUT_SUFFIX} files in ${directory}`);
  }

  return caseNames;
}

async function captureCase({ target, baseUrl, caseName }) {
  const inputPath = path.join(target.directory, `${caseName}${INPUT_SUFFIX}`);
  const requestBody = await fileSystem.readFile(inputPath, "utf8");
  const responses = [];

  for (const endpoint of target.endpoints) {
    const url = `${baseUrl}${endpoint.route}`;
    const response = await postOperation(url, requestBody);

    responses.push({ endpointName: endpoint.name, ...response });
  }

  const capture = { caseName, responses };
  return capture;
}

async function postOperation(url, requestBody) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: requestBody,
  }).catch((error) => {
    const reason = error.cause?.code ?? error.message;

    throw new Error(`Calculator unreachable at ${url}: ${reason}`);
  });

  const contentType = response.headers.get("Content-Type") ?? "";
  const isExpectedStatus = EXPECTED_STATUSES.includes(response.status);

  if (!isExpectedStatus || !JSON_CONTENT_TYPE.test(contentType)) {
    throw new Error(
      `Unexpected response from ${url}: ${response.status} ${contentType}, expected ${EXPECTED_STATUSES.join(" or ")} with JSON`,
    );
  }

  const body = maskVolatileFields(await response.json());
  const versions = {
    application: response.headers.get("X-CALC-APP-VERSION"),
    database: response.headers.get("X-CALC-DB-VERSION"),
  };

  const calculatorResponse = { status: response.status, body, versions };
  return calculatorResponse;
}

// why: problem+json error bodies carry the request time, which would make every recapture a diff.
function maskVolatileFields(body) {
  const isObject = body !== null && typeof body === "object" && !Array.isArray(body);

  if (!isObject) {
    return body;
  }

  const maskedEntries = Object.entries(body).map(([key, value]) => [
    key,
    VOLATILE_ERROR_FIELDS.includes(key) ? VOLATILE_PLACEHOLDER : value,
  ]);

  const maskedBody = Object.fromEntries(maskedEntries);
  return maskedBody;
}

async function writeCaptures(target, captures) {
  for (const capture of captures) {
    for (const response of capture.responses) {
      const fileName = `${capture.caseName}.output.${response.endpointName}.json`;

      await writeJson(path.join(target.directory, fileName), {
        status: response.status,
        body: response.body,
      });
    }
  }

  await writeJson(path.join(target.directory, MANIFEST_FILE), buildManifest(target, captures));
}

// why: only 200 responses carry the X-CALC-* version headers; 422 responses omit them.
function buildManifest(target, captures) {
  const allResponses = captures.flatMap((capture) => capture.responses);
  const versions = allResponses.find((response) => response.status === 200)?.versions;
  const statusesByCase = captures.map((capture) => [
    capture.caseName,
    Object.fromEntries(
      capture.responses.map((response) => [response.endpointName, response.status]),
    ),
  ]);

  const manifest = {
    upstream: target.upstream,
    applicationVersion: versions?.application ?? null,
    databaseVersion: versions?.database ?? null,
    endpoints: Object.fromEntries(
      target.endpoints.map((endpoint) => [endpoint.name, endpoint.route]),
    ),
    cases: Object.fromEntries(statusesByCase),
  };
  return manifest;
}

async function writeJson(filePath, value) {
  const serialized = `${JSON.stringify(value, null, JSON_INDENT)}\n`;

  await fileSystem.writeFile(filePath, serialized, "utf8");
}

start().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
