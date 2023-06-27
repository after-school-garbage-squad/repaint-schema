import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const BLOCK_YML_EXT: boolean = true;

export type Path = string;

export function isYaml(x: Path): boolean {
  const ext = path.extname(x);
  if (BLOCK_YML_EXT && ext === ".yml") {
    throw new Error(`.yml file is found at: ${x}\nchange it to .yaml!`);
  }

  return ext === ".yml" || ext === ".yaml";
}

export function tree(dir: Path): Array<Path> {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  const res: Array<Path> = [];

  for (const f of files) {
    const p = path.join(dir, f.name);
    if (f.isFile()) {
      res.push(p);
    }
    if (f.isDirectory()) {
      res.push(...tree(p));
    }
  }

  return res;
}

export const CWD = process.cwd();
export function relativeFromHere(dir: Path): Path {
  return "./" + path.relative(CWD, dir);
}
