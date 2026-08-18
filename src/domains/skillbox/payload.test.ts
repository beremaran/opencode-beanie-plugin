import {describe, expect, test} from "bun:test";
import {
  byteLength,
  formatLoadPayload,
  formatSummary,
  formatToolError,
  isSkillMd,
  truncateBytes,
} from "./payload";
import {RegistryAuthError, SkillNotFoundError} from "./types";
import {HttpError} from "./http";

describe("payload", () => {
  test("byteLength calculates UTF-8 byte length correctly", () => {
    expect(byteLength("hello")).toBe(5);
    expect(byteLength("你好")).toBe(6);
  });

  test("truncateBytes limits UTF-8 strings accurately", () => {
    expect(truncateBytes("hello world", 5)).toBe("hello");
    expect(truncateBytes("hello world", 0)).toBe("");
    expect(truncateBytes("hello", 10)).toBe("hello");
  });

  test("isSkillMd checks skill.md filename", () => {
    expect(isSkillMd("SKILL.md")).toBe(true);
    expect(isSkillMd("sub/dir/skill.md")).toBe(true);
    expect(isSkillMd("README.md")).toBe(false);
  });

  test("formatSummary formats summary with optional fields", () => {
    const summary = {
      id: "owner/repo/skill",
      name: "Skill",
      slug: "skill",
      source: "owner/repo",
      sourceType: "github" as const,
      description: "My desc",
      installs: 42,
    };
    const formatted = formatSummary(summary, true);

    expect(formatted.description).toBe("My desc");
    expect(formatted.installs).toBe(42);

    const withoutDesc = formatSummary(summary, false);
    expect(withoutDesc.description).toBeUndefined();
  });

  test("formatLoadPayload filters supporting files and caps bytes", () => {
    const detail = {
      id: "a/b/c",
      name: "Skill C",
      slug: "c",
      source: "a/b",
      files: [
        { path: "SKILL.md", contents: "# Skill\nInstructions" },
        { path: "helper.py", contents: "print('hello')" },
      ],
    };
    const onlyMain = JSON.parse(formatLoadPayload(detail, false)) as { files: { path: string }[] };
    expect(onlyMain.files).toHaveLength(1);
    expect(onlyMain.files[0]?.path).toBe("SKILL.md");

    const withSupporting = JSON.parse(formatLoadPayload(detail, true)) as { files: { path: string }[] };
    expect(withSupporting.files).toHaveLength(2);

    const capped = JSON.parse(formatLoadPayload(detail, true, 20)) as { files: { path: string; contents: string }[]; truncated?: boolean };
    expect(capped.truncated).toBe(true);
  });

  test("formatToolError formats error objects", () => {
    expect(JSON.parse(formatToolError(new SkillNotFoundError("missing"), "id123"))).toEqual({
      error: "Skill not found: id123",
    });
    expect(JSON.parse(formatToolError(new RegistryAuthError("unauthorized")))).toEqual({
      error: "Registry authentication error: unauthorized",
    });
    expect(JSON.parse(formatToolError(new HttpError("fail", 500)))).toEqual({
      error: "HTTP 500: fail",
    });
    expect(JSON.parse(formatToolError(new Error("generic error")))).toEqual({
      error: "generic error",
    });
  });
});
