import chalk from "chalk";
import fs from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";

import { tree, Path, isYaml } from "./shared.js";
import {
  run as expandRef,
  OUTPUT_PATH as EXPANDED_SCHEMA_PATH,
} from "./expandRef.js";

const ROOT_SCHEMA = path.join(EXPANDED_SCHEMA_PATH, "openapi.yaml");
const PATH_SCHEMAS_DIR = path.join(EXPANDED_SCHEMA_PATH, "path");

export function run() {
  expandRef();

  const referencedPaths = getReferencedPaths();
  const definedPaths = getDefinedPaths();
  const orphanPaths = definedPaths.filter((x) => !referencedPaths.includes(x));

  if (orphanPaths.length === 0) {
    console.log(chalk.green("no orphan paths found."));
    return;
  }

  console.log(chalk.red(orphanPaths.length), "orphan path(s) found.");
  for (const p of orphanPaths) {
    console.log(p);
  }
}

function getReferencedPaths(): Array<Path> {
  const parsed = parseYaml(fs.readFileSync(ROOT_SCHEMA).toString());

  return Object.values(parsed.paths ?? {})
    .filter((x) => typeof x === "object" && x != null)
    .map((x) => (x as Record<string, string>).$ref)
    .filter((x) => x != null)
    .map((x) => path.join(EXPANDED_SCHEMA_PATH, x));
}

function getDefinedPaths(): Array<Path> {
  return tree(PATH_SCHEMAS_DIR).filter(isYaml);
}
