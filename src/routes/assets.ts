import { Hono } from "hono";
import type { AppEnv } from "../env";
import clientJs from "../assets/client";
import favicon from "../assets/favicon.svg";
import frauncesItalic from "../assets/fonts/fraunces-latin-wght-italic.woff2";
import fraunces from "../assets/fonts/fraunces-latin-wght-normal.woff2";
import inter from "../assets/fonts/inter-latin-wght-normal.woff2";
import ogImage from "../assets/og.png";
import styles from "../assets/styles.css";

// Static files bundled into the Worker. URLs carry a content hash (?v=...) so
// browsers can cache them for a year and still pick up changes immediately.

function hash(data: string | ArrayBuffer): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let h = 5381;
  for (let i = 0; i < bytes.length; i++) h = (h * 33) ^ bytes[i]!;
  return (h >>> 0).toString(36);
}

const FILES = {
  "/styles.css": { body: styles, type: "text/css; charset=utf-8" },
  "/app.js": { body: clientJs, type: "text/javascript; charset=utf-8" },
  "/favicon.svg": { body: favicon, type: "image/svg+xml" },
  "/fonts/fraunces.woff2": { body: fraunces, type: "font/woff2" },
  "/fonts/fraunces-italic.woff2": { body: frauncesItalic, type: "font/woff2" },
  "/fonts/inter.woff2": { body: inter, type: "font/woff2" },
  "/og.png": { body: ogImage, type: "image/png" },
} as const;

export type AssetPath = keyof typeof FILES;
const VERSIONS = Object.fromEntries(Object.entries(FILES).map(([p, f]) => [p, hash(f.body)])) as Record<AssetPath, string>;

/** Versioned URL for use in views, e.g. assetUrl("/styles.css") → "/styles.css?v=abc123". */
export const assetUrl = (path: AssetPath) => `${path}?v=${VERSIONS[path]}`;

export const assetRoutes = new Hono<AppEnv>();

for (const [path, file] of Object.entries(FILES)) {
  assetRoutes.get(path, (c) => {
    c.header("Content-Type", file.type);
    // Fonts never change at a given path, so they always cache long.
    const immutable = path.startsWith("/fonts/") || c.req.query("v") === VERSIONS[path as AssetPath];
    c.header("Cache-Control", immutable ? "public, max-age=31536000, immutable" : "public, max-age=300");
    return c.body(file.body);
  });
}
