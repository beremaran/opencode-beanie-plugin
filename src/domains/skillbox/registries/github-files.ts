import type {SkillFile} from "../types";
import {httpGetText} from "../http";
import {byteLength, isSkillMd, truncateBytes} from "../payload";
import type {TreeEntry} from "./github-tree";

export async function fetchSkillFiles(
  owner: string,
  repo: string,
  branch: string,
  dir: string,
  under: TreeEntry[],
): Promise<SkillFile[]> {
  const files: SkillFile[] = await Promise.all(
    under.map(async (entry) => {
      const path = (entry.path ?? "").slice(dir.length + 1);

      const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${entry.path ?? ""}`;

      const contents = await httpGetText(url);

      return { path, contents };
    }),
  );

  return files;
}

function truncateSupportFiles(files: SkillFile[], maxBytes: number, mdBytes: number): void {
  let remaining = maxBytes - mdBytes;

  for (const file of files.filter((f) => !isSkillMd(f.path))) {
    const size = byteLength(file.contents);

    if (size <= remaining) {
      remaining -= size;
    } else {
      file.contents = truncateBytes(file.contents, Math.max(0, remaining));
      remaining = 0;
    }
  }
}

export function capSkillFiles(files: SkillFile[], maxBytes: number): void {
  const total = files.reduce((n, f) => n + byteLength(f.contents), 0);

  if (total <= maxBytes) {
    return;
  }

  const md = files.find((f) => isSkillMd(f.path));

  if (md && byteLength(md.contents) > maxBytes) {
    for (const file of files.filter((f) => f !== md)) {
      file.contents = "";
    }
    md.contents = truncateBytes(md.contents, maxBytes);

    return;
  }

  const mdBytes = md ? byteLength(md.contents) : 0;

  truncateSupportFiles(files, maxBytes, mdBytes);
}
