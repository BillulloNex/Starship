import type { WorkspaceSearchOptions } from "#/api/runtime-service/workspace-search.service";

/**
 * Search-based "go to definition": without a language server, find lines
 * that look like they declare the symbol. Right most of the time for the
 * languages people use with the agent, and costs nothing while idle.
 */

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A regex (POSIX-extended compatible, so grep -E and ripgrep agree) that
 * matches common declaration forms of `symbol`.
 */
export function buildDefinitionPattern(symbol: string): string | null {
  if (!IDENTIFIER.test(symbol)) return null;
  const name = escapeRegExp(symbol);
  const forms = [
    // JS/TS: function, class, interface, type, enum, const/let/var
    `(function\\*?|class|interface|type|enum|const|let|var|namespace)[[:space:]]+${name}([^A-Za-z0-9_$]|$)`,
    // Python / Ruby: def, class
    `(def|class)[[:space:]]+${name}([^A-Za-z0-9_]|$)`,
    // Go: func Name( / func (r T) Name( / type Name
    `func[[:space:]]+(\\([^)]*\\)[[:space:]]*)?${name}[[:space:]]*[(\\[]`,
    // Rust: fn, struct, trait, enum, mod
    `(fn|struct|trait|mod|impl)[[:space:]]+${name}([^A-Za-z0-9_]|$)`,
  ];
  return forms.map((form) => `(${form})`).join("|");
}

export function buildDefinitionSearch(
  symbol: string,
): WorkspaceSearchOptions | null {
  const pattern = buildDefinitionPattern(symbol);
  if (!pattern) return null;
  return { query: pattern, isRegex: true, matchCase: true, wholeWord: false };
}

interface Candidate {
  path: string;
  line: number;
  text: string;
}

/**
 * Orders candidates: the current file first, then source over tests and
 * type declarations, then shorter paths.
 */
export function rankDefinitions<T extends Candidate>(
  candidates: T[],
  currentPath: string,
): T[] {
  const penalty = (candidate: T) => {
    let score = 0;
    if (candidate.path !== currentPath) score += 10;
    if (
      /(^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\./.test(candidate.path)
    ) {
      score += 5;
    }
    if (/\.d\.ts$/.test(candidate.path)) score += 3;
    return score;
  };
  return [...candidates].sort(
    (a, b) =>
      penalty(a) - penalty(b) ||
      a.path.length - b.path.length ||
      a.line - b.line,
  );
}
