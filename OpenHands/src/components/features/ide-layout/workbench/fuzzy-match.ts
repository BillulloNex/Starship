/**
 * Small fuzzy matcher for the IDE quick open (files and commands).
 *
 * Every query character must appear in order in the target (a subsequence
 * match). Matches score higher when they are contiguous, start a word
 * (after `/`, `.`, `-`, `_`, a space, or a camelCase hump), or land in the
 * file name rather than the directory. Shorter targets win ties.
 */

export interface FuzzyMatch {
  score: number;
  /** Indices into the target string of each matched character. */
  positions: number[];
}

const WORD_SEPARATORS = new Set(["/", "\\", ".", "-", "_", " ", ":"]);

const SCORE_MATCH = 1;
const BONUS_CONSECUTIVE = 6;
const BONUS_WORD_START = 8;
const BONUS_FIRST_CHAR = 10;
const BONUS_BASENAME = 4;
const PENALTY_GAP = 1;
const MAX_GAP_PENALTY = 6;

function isWordStart(target: string, index: number): boolean {
  if (index === 0) return true;
  const prev = target[index - 1];
  if (WORD_SEPARATORS.has(prev)) return true;
  const current = target[index];
  return (
    prev === prev.toLowerCase() &&
    current !== current.toLowerCase() &&
    current === current.toUpperCase()
  );
}

/**
 * Finds the position for each query character, preferring a word-start
 * occurrence over the next plain occurrence when one exists before the
 * following query character could still be matched.
 */
function findPositions(query: string, target: string): number[] | null {
  const lowerTarget = target.toLowerCase();
  const positions: number[] = [];
  let from = 0;

  for (let qi = 0; qi < query.length; qi += 1) {
    const ch = query[qi];
    const next = lowerTarget.indexOf(ch, from);
    if (next === -1) return null;

    // Look ahead for a word-start occurrence of the same character, but only
    // if the rest of the query can still be matched after it.
    let chosen = next;
    if (!isWordStart(target, next) && positions.at(-1) !== next - 1) {
      let probe = lowerTarget.indexOf(ch, next + 1);
      while (probe !== -1) {
        if (isWordStart(target, probe)) {
          const rest = query.slice(qi + 1);
          if (findPositions(rest, target.slice(probe + 1)) !== null) {
            chosen = probe;
          }
          break;
        }
        probe = lowerTarget.indexOf(ch, probe + 1);
      }
    }

    positions.push(chosen);
    from = chosen + 1;
  }

  return positions;
}

function basenameStartOf(target: string): number {
  return Math.max(target.lastIndexOf("/"), target.lastIndexOf("\\")) + 1;
}

/** Matches each query character at its last possible occurrence. */
function findPositionsFromEnd(query: string, target: string): number[] | null {
  const lowerTarget = target.toLowerCase();
  const positions: number[] = new Array(query.length);
  let before = target.length;
  for (let qi = query.length - 1; qi >= 0; qi -= 1) {
    const found = lowerTarget.lastIndexOf(query[qi], before - 1);
    if (found === -1) return null;
    positions[qi] = found;
    before = found;
  }
  return positions;
}

function scorePositions(target: string, positions: number[]): number {
  const basenameStart = basenameStartOf(target);

  let score = 0;
  positions.forEach((pos, i) => {
    score += SCORE_MATCH;
    if (i > 0) {
      const gap = pos - positions[i - 1] - 1;
      if (gap === 0) score += BONUS_CONSECUTIVE;
      else score -= Math.min(gap * PENALTY_GAP, MAX_GAP_PENALTY);
    }
    if (isWordStart(target, pos)) score += BONUS_WORD_START;
    if (pos === basenameStart) score += BONUS_FIRST_CHAR;
    if (pos >= basenameStart) score += BONUS_BASENAME;
  });

  // Prefer shorter targets when scores are otherwise equal.
  return score - target.length * 0.01;
}

export function fuzzyMatch(
  rawQuery: string,
  target: string,
): FuzzyMatch | null {
  const query = rawQuery.trim().toLowerCase().replace(/\s+/g, "");
  if (!query) return { score: 0, positions: [] };
  if (query.length > target.length) return null;

  // A greedy scan can lock onto an early directory and miss a better match
  // in the file name, so score a few alignments and keep the best.
  const basenameStart = basenameStartOf(target);
  const inBasename = findPositions(query, target.slice(basenameStart));
  const candidates = [
    findPositions(query, target),
    findPositionsFromEnd(query, target),
    inBasename?.map((pos) => pos + basenameStart) ?? null,
  ].filter((positions): positions is number[] => positions !== null);

  if (candidates.length === 0) return null;

  let best: FuzzyMatch | null = null;
  for (const positions of candidates) {
    const score = scorePositions(target, positions);
    if (!best || score > best.score) best = { score, positions };
  }
  return best;
}

export interface RankedItem<T> {
  item: T;
  match: FuzzyMatch;
}

/** Filters and sorts `items` by fuzzy score, best first. */
export function rankFuzzy<T>(
  query: string,
  items: readonly T[],
  getText: (item: T) => string,
  limit = 50,
): RankedItem<T>[] {
  const ranked: RankedItem<T>[] = [];
  for (const item of items) {
    const match = fuzzyMatch(query, getText(item));
    if (match) ranked.push({ item, match });
  }
  ranked.sort((a, b) => b.match.score - a.match.score);
  return ranked.slice(0, limit);
}
