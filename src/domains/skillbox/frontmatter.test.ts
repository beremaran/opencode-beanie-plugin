import {describe, expect, test} from "bun:test";
import {extractDescription, parseSkillFrontmatter} from "./frontmatter";

describe("frontmatter", () => {
  test("parses frontmatter name and description with quotes stripped", () => {
    const raw = `---
name: "my-skill"
description: 'a helpful skill'
---
# Content`;
    expect(parseSkillFrontmatter(raw)).toEqual({
      name: "my-skill",
      description: "a helpful skill",
    });
  });

  test("handles empty or missing frontmatter", () => {
    expect(parseSkillFrontmatter("no frontmatter")).toEqual({});
    expect(parseSkillFrontmatter("---\nfoo: bar")).toEqual({});
  });

  test("extracts description from frontmatter if available", () => {
    const raw = `---
name: foo
description: "Frontmatter description"
---
# Ignored Header`;
    expect(extractDescription(raw)).toBe("Frontmatter description");
  });

  test("extracts description from markdown heading when frontmatter has no description", () => {
    const raw = `---
name: foo
---
# Main Feature Overview

Details here.`;
    expect(extractDescription(raw)).toBe("Main Feature Overview");
  });

  test("extracts description from plain body text when no header exists", () => {
    const raw = `---
name: foo
---
First line of plain description text.`;
    expect(extractDescription(raw)).toBe("First line of plain description text.");
  });

  test("returns empty string for empty content", () => {
    expect(extractDescription("")).toBe("");
  });
});
