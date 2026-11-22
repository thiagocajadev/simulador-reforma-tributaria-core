// The naming rules of docs/decisions.md that a regex can check: banned verbs, nouns and
// abbreviations in declared identifiers, and banned file names. Only declarations are checked, so
// a framework's own names (Hono's context.req) never count against this repository.

interface NameViolation {
  line: number;
  name: string;
  rule: string;
}

const DECLARATION_PATTERN =
  /\b(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
const BANNED_VERB_PREFIX = /^(handle|do|run|execute|perform)(?=[A-Z]|$)/;
const BANNED_NOUNS = new Set(["data", "info", "obj", "item", "items", "thing", "things"]);
const BANNED_ABBREVIATIONS = new Set([
  "req",
  "res",
  "ctx",
  "idx",
  "prev",
  "arr",
  "val",
  "tmp",
  "cb",
  "fn",
  "mgr",
  "ctrl",
  "svc",
]);
const BANNED_FILE_NAME = /(^|[./-])(helpers|utils|common|misc)([./-]|$)/;

function findNameViolations(sourceText: string) {
  const violations: NameViolation[] = [];
  const lines = sourceText.split("\n");

  lines.forEach((lineText, position) => {
    for (const match of lineText.matchAll(DECLARATION_PATTERN)) {
      const name = match[1] ?? "";
      const rule = classifyName(name);

      if (rule) {
        violations.push({ line: position + 1, name, rule });
      }
    }
  });

  return violations;
}

function classifyName(name: string) {
  if (BANNED_VERB_PREFIX.test(name)) {
    const verbRule = "banned verb (handle, do, run, execute, perform)";
    return verbRule;
  }

  if (BANNED_NOUNS.has(name)) {
    const nounRule = "banned generic noun";
    return nounRule;
  }

  if (BANNED_ABBREVIATIONS.has(name)) {
    const abbreviationRule = "banned abbreviation";
    return abbreviationRule;
  }

  return null;
}

function isBannedFileName(fileName: string) {
  const isBanned = BANNED_FILE_NAME.test(fileName);
  return isBanned;
}

export type { NameViolation };
export { findNameViolations, isBannedFileName };
