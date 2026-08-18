const KEY_RE = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/;

const NEWLINE_RE = /\r?\n/;

const HEADING_RE = /^#+\s*/;

const MAX_DESC_CHARS = 300;

function stripQuotes(value: string): string {
  const trimmed = value.trim();

  if (
    trimmed.length >= 2 &&
    ((trimmed[0] === '"' && trimmed.endsWith('"')) ||
      (trimmed[0] === "'" && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

export function parseSkillFrontmatter(content: string): {
  name?: string;
  description?: string;
} {
  const lines = content.split(NEWLINE_RE);

  if (lines[0]?.trim() !== "---") {
    return {};
  }

  const result: { name?: string; description?: string } = {};

  for (const line of lines.slice(1)) {
    if (line.trim() === "---") {
      break;
    }

    const match = line.match(KEY_RE);

    if (match?.[1] === "name" || match?.[1] === "description") {
      result[match[1]] = stripQuotes(match[2] ?? "");
    }
  }

  return result;
}

function findBodyDescription(lines: string[], start: number): string {
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i]?.trim() ?? "";

    if (line.startsWith("#")) {
      return line.replace(HEADING_RE, "").trim().slice(0, MAX_DESC_CHARS);
    }
    if (line.length > 0) {
      return line.slice(0, MAX_DESC_CHARS);
    }
  }

  return "";
}

export function extractDescription(content: string): string {
  const parsed = parseSkillFrontmatter(content);

  if (parsed.description) {
    return parsed.description.slice(0, MAX_DESC_CHARS);
  }

  const lines = content.split(NEWLINE_RE);

  let start = 0;

  if (lines[0]?.trim() === "---") {
    const end = lines.slice(1).findIndex((line) => line.trim() === "---");

    start = end === -1 ? lines.length : end + 2;
  }

  return findBodyDescription(lines, start);
}
