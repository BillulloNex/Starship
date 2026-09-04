const ERROR_PATTERNS = [
  /\bERROR\b/i,
  /\bFATAL\b/i,
  /\bException\b/,
  /\bTraceback\b/,
];

export function isErrorLine(line) {
  if (!line.trim()) return false;
  if (/^\s*(INFO|DEBUG|TRACE)\b/i.test(line)) return false;
  return ERROR_PATTERNS.some((pattern) => pattern.test(line));
}

export function groupErrors(lines, windowStartMs) {
  const groups = new Map();
  for (const entry of lines) {
    if (entry.timestamp && entry.timestamp < windowStartMs) continue;
    const key = entry.line
      .replace(/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, "<ts>")
      .replace(/\b[0-9a-f]{8,}\b/gi, "<id>")
      .slice(0, 240);
    const existing = groups.get(key) || {
      signature: key,
      count: 0,
      first_seen: entry.timestamp,
      last_seen: entry.timestamp,
      samples: [],
    };
    existing.count += 1;
    if (entry.timestamp) {
      existing.first_seen = Math.min(existing.first_seen ?? entry.timestamp, entry.timestamp);
      existing.last_seen = Math.max(existing.last_seen ?? entry.timestamp, entry.timestamp);
    }
    if (existing.samples.length < 5) existing.samples.push(entry.line.slice(0, 500));
    groups.set(key, existing);
  }
  return [...groups.values()].sort((a, b) => (b.last_seen ?? 0) - (a.last_seen ?? 0));
}
