import { describe, expect, test } from "bun:test";
import { matchesToolFilter } from "./filters";

describe("matchesToolFilter", () => {
  test("empty patterns matches all tool names", () => {
    expect(matchesToolFilter("any_tool", [])).toBe(true);
    expect(matchesToolFilter("read_file", [])).toBe(true);
  });

  test("exact matches work", () => {
    expect(matchesToolFilter("read_file", ["read_file"])).toBe(true);
    expect(matchesToolFilter("write_file", ["read_file"])).toBe(false);
  });

  test("wildcard patterns match correctly", () => {
    expect(matchesToolFilter("git_status", ["git_*"])).toBe(true);
    expect(matchesToolFilter("git_commit", ["git_*"])).toBe(true);
    expect(matchesToolFilter("svn_status", ["git_*"])).toBe(false);
    expect(matchesToolFilter("check_health", ["*_health"])).toBe(true);
    expect(matchesToolFilter("get_user_info", ["get*info"])).toBe(true);
  });

  test("matches across multiple filter patterns", () => {
    const patterns = ["read_*", "write_*", "fetch"];
    expect(matchesToolFilter("read_data", patterns)).toBe(true);
    expect(matchesToolFilter("write_data", patterns)).toBe(true);
    expect(matchesToolFilter("fetch", patterns)).toBe(true);
    expect(matchesToolFilter("delete_data", patterns)).toBe(false);
  });

  test("escapes regex characters properly", () => {
    expect(matchesToolFilter("tool.v1", ["tool.v1"])).toBe(true);
    expect(matchesToolFilter("toolXv1", ["tool.v1"])).toBe(false);
    expect(matchesToolFilter("tool+1", ["tool+1"])).toBe(true);
  });
});
