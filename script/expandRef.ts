import * as fs from "fs";
import * as path from "path";
import * as process from "process";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import chalk from "chalk";
import { mkdirp } from "mkdirp";
import chokidar from "chokidar";
import urlJoin from "url-join";

import { isYaml, tree, relativeFromHere, Path } from "./shared.js";

const SCHEMA_PATH: Path = path.resolve("schema");
export const OUTPUT_PATH: Path = path.resolve("expanded");

const INNER_PATH_EXPAND_MAP: Record<string, string> = {
  "~/component": "/components/schemas",
  "~/parameter": "/components/parameters",
};

for (const k of Object.keys(INNER_PATH_EXPAND_MAP)) {
  if (k.startsWith("~/")) {
    const newKey = path.resolve(path.join(SCHEMA_PATH, k.substring(2)));
    const value = INNER_PATH_EXPAND_MAP[k];

    delete INNER_PATH_EXPAND_MAP[k];
    INNER_PATH_EXPAND_MAP[newKey] = value;
  }
}

export function run() {
  if (fs.existsSync(OUTPUT_PATH)) {
    fs.rmSync(OUTPUT_PATH, { recursive: true });
  }
  const yamls = tree(SCHEMA_PATH).filter(isYaml);
  for (const yaml of yamls) {
    expandYaml(yaml);
  }
}

export function watch() {
  run();
  chokidar
    .watch(SCHEMA_PATH, { ignoreInitial: true })
    .once("ready", () =>
      console.log("watching file changes under", SCHEMA_PATH)
    )
    .on("all", (event, path) => {
      console.log("file change detected:", event);

      if (!["unlink", "unlinkDir"].includes(event) && isYaml(path)) {
        try {
          expandYaml(path);
        } catch (e) {
          console.error(`failed to expand ${path}: ${e}`);
        }
      }
    });
}

function expandYaml(yamlPath: Path) {
  console.log(chalk.green("expand"), relativeFromHere(yamlPath));
  const outputAt = path.join(OUTPUT_PATH, path.relative(SCHEMA_PATH, yamlPath));
  const outputAtDir = path.dirname(outputAt);
  mkdirp.sync(outputAtDir);

  const schema = parseYaml(fs.readFileSync(yamlPath).toString());
  const expanded = expandRefsInSchema(yamlPath, schema);

  fs.writeFileSync(outputAt, toYaml(expanded));
}

function expandRefsInSchema<T>(schemaPath: Path, o: T): T {
  if (o == null) {
    return o;
  }

  if (typeof o != "object") {
    return o;
  }

  if (Array.isArray(o)) {
    return o.map((s) => expandRefsInSchema(schemaPath, s)) as unknown as T;
  }

  const res: Record<string, unknown> = {};

  for (const k in o) {
    const v = o[k];

    if (k !== "$ref") {
      res[k] = expandRefsInSchema(schemaPath, v);
      continue;
    }

    if (typeof v !== "string") {
      console.log(
        "found $ref property which doesn't have string value. ignoring."
      );
      res[k] = v;
      continue;
    }

    res[k] = expandRef(path.dirname(schemaPath), v);
  }

  return res as T;
}

class RefPath {
  private constructor(
    private outer: string | null,
    private inner: string | null
  ) {}

  public static parse(s: string): RefPath {
    const segments = s.split("#");

    let outer = null;
    let inner = null;

    switch (segments.length) {
      case 1:
        outer = segments[0];
        inner = null;
        break;

      case 2:
        outer = segments[0] === "" ? null : segments[0];
        inner = segments[1];

        if (inner === "") {
          throw new Error("inner path must have something");
        }

        break;
    }

    return new RefPath(outer, inner);
  }

  public isLocal(): boolean {
    return this.outer === null;
  }

  public hasLocalPath(): boolean {
    return this.inner != null;
  }

  public toString(): string {
    let result = this.outer ?? "";
    if (this.inner != null) {
      result += "#";
      result += this.inner;
    }

    return result;
  }

  public isFromHome(): boolean {
    return this.outer?.startsWith("~") ?? false;
  }

  public withNewHome(home: string): RefPath {
    if (!this.isFromHome()) {
      throw new Error("this RefPath is not from home");
    }

    const newOuter = path.join(home, this.outer!.substring(2));
    return new RefPath(newOuter, this.inner);
  }

  public joinBeforeInner(...segments: Array<string>): RefPath {
    if (!this.hasLocalPath()) {
      throw new Error("this RefPath has no local path");
    }

    return new RefPath(this.outer, urlJoin(...segments, this.inner!));
  }
}

function expandRef(workingDir: Path, ref: string): string {
  let result = RefPath.parse(ref);

  if (result.isFromHome()) {
    result = result.withNewHome(path.relative(workingDir, SCHEMA_PATH));
  }

  const innerExpandMap = getInnerExpandMap(workingDir, ref);
  if (innerExpandMap != null && result.hasLocalPath()) {
    result = result.joinBeforeInner(innerExpandMap);
  }

  const resultStr = result.toString();

  if (ref != resultStr) {
    console.log(chalk.gray(ref, "->", relativeFromHere(resultStr)));
  }

  return resultStr;
}

function getInnerExpandMap(workingDir: Path, ref: string): string | null {
  if (ref.startsWith("~/")) {
    ref = path.join(SCHEMA_PATH, ref.substring(2));
  }

  ref = path.resolve(workingDir, ref);

  for (const k in INNER_PATH_EXPAND_MAP) {
    if (ref.startsWith(k)) {
      return INNER_PATH_EXPAND_MAP[k];
    }
  }

  return null;
}
