import { Hono } from "hono";
import type { AppEnv } from "../env";
import favicon from "../assets/favicon.svg";
import styles from "../assets/styles.css";

// Static files bundled into the Worker. URLs carry a content hash (?v=...) so
// browsers can cache them for a year and still pick up changes immediately.

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = (h * 33) ^ text.charCodeAt(i);
  return (h >>> 0).toString(36);
}

const FILES = {
  "/styles.css": { body: styles, type: "text/css; charset=utf-8" },
  "/favicon.svg": { body: favicon, type: "image/svg+xml" },
} as const;

export type AssetPath = keyof typeof FILES;
const VERSIONS = Object.fromEntries(Object.entries(FILES).map(([p, f]) => [p, hash(f.body)])) as Record<AssetPath, string>;

/** Versioned URL for use in views, e.g. assetUrl("/styles.css") → "/styles.css?v=abc123". */
export const assetUrl = (path: AssetPath) => `${path}?v=${VERSIONS[path]}`;

export const assetRoutes = new Hono<AppEnv>();

for (const [path, file] of Object.entries(FILES)) {
  assetRoutes.get(path, (c) => {
    c.header("Content-Type", file.type);
    c.header("Cache-Control", c.req.query("v") === VERSIONS[path as AssetPath] ? "public, max-age=31536000, immutable" : "public, max-age=300");
    return c.body(file.body);
  });
}
