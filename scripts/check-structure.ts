import ts from "typescript";
import {readdir} from "node:fs/promises";
import {resolve} from "node:path";

const MAX_FILE_LINES = 200;

const MAX_FUNCTION_LINES = 20;

const paths = Bun.argv.slice(2);

async function filesAt(path: string): Promise<string[]> {
  const entry = Bun.file(path);

  if (await entry.exists()) {return /\.tsx?$/.test(path) ? [path] : [];}

  const children = await readdir(path, {withFileTypes: true});

  const files: string[] = [];

  for (const child of children) {files.push(...await filesAt(resolve(path, child.name)));}
  return files;
}

function isTestFile(path: string) {return /\.(test|spec)\.tsx?$/.test(path);}

function functionNodes(source: ts.SourceFile) {
  const nodes: ts.Node[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node) || ts.isConstructorDeclaration(node)) {nodes.push(node);}
    ts.forEachChild(node, visit);
  };
  visit(source);
  return nodes;
}

function lineCount(source: ts.SourceFile, node: ts.Node) {
  return source.getLineAndCharacterOfPosition(node.getEnd()).line - source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

async function check(path: string) {
  const text = await Bun.file(path).text();

  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);

  const failures: string[] = [];

  const fileLines = text.split("\n").length;

  if (fileLines > MAX_FILE_LINES) {failures.push(`${path}: ${String(fileLines)} lines (maximum ${String(MAX_FILE_LINES)})`);}
  for (const node of functionNodes(source)) {
    const lines = lineCount(source, node);

    if (lines > MAX_FUNCTION_LINES) {failures.push(`${path}:${String(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1)}: function-like declaration is ${String(lines)} lines (maximum ${String(MAX_FUNCTION_LINES)})`);}
  }
  return failures;
}

if (paths.length === 0) {console.error("Usage: bun scripts/check-structure.ts <path> [...paths]"); process.exit(2);}

const files = (await Promise.all(paths.map(filesAt))).flat().filter((path) => !isTestFile(path));

const failures = (await Promise.all(files.map(check))).flat();

if (failures.length > 0) {console.error(failures.join("\n")); process.exit(1);}
console.log(`Checked ${String(files.length)} production TypeScript file(s).`);
