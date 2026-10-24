import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { app } from "../src/index";
import { plainText } from "../src/lib/markdown";
import { createLesson } from "../src/services/admin-content";
import { createEmailToken } from "../src/services/email-tokens";
import { productId, TestClient } from "./helpers";

const PW = "a long enough password";
let seq = 0;

/** A member who owns the "hips" programme, which these tests fill with sections and exercises. */
async function setup() {
  const email = `course${++seq}-${Date.now()}@example.com`;
  const pid = await productId(env.DB, "hips");
  const order = await env.DB.prepare("INSERT INTO orders (public_id, email, status, total_pence, consents_json) VALUES (?1, ?2, 'paid', 100, '{}') RETURNING id").bind(`C-${crypto.randomUUID()}`, email).first<number>("id");
  await env.DB.prepare("INSERT INTO entitlements (email, product_id, order_id) VALUES (?1, ?2, ?3)").bind(email, pid, order).run();
  const token = await createEmailToken(env.DB, "setup", email, order);
  const client = new TestClient(env);
  await client.post("/account/setup", { token, password: PW, confirm: PW });
  return { client, pid };
}

async function fill(pid: number) {
  await env.DB.prepare("UPDATE programme_lessons SET status = 'archived' WHERE product_id = ?1").bind(pid).run();
  const actor = { userId: 1 };
  await createLesson(env.DB, pid, { tab: "full", title: "Philosophy intro", body: "Release **first**.", youtube_id: null, image_alt: null, status: "published" }, actor);
  await createLesson(env.DB, pid, { tab: "quick", title: "Intro key points", body: "- Keep it light", youtube_id: null, image_alt: null, status: "published" }, actor);
  await createLesson(
    env.DB,
    pid,
    {
      tab: "full",
      title: "Hip shift",
      body: "",
      youtube_id: "dQw4w9WgXcQ",
      image_alt: null,
      status: "published",
      kind: "exercise",
      stage: "Stage 1: Hips",
      starting_position: "Stand with **soft** knees.",
      conducting: "Shift slowly to one side.",
      key_points: "- Hips level",
      recommended_time: "30–60 seconds",
      sheet_line: "Slow shift, hips level",
      watch_for: "- Gripping the toes",
      levels: "### Beginner\nHold a wall.\n### Advanced\nEyes closed.",
    },
    actor,
  );
}

const page = (c: TestClient, mode?: string) => c.get(`/account/programmes/hips${mode ? `?mode=${mode}` : ""}`).then((r) => r.text());

describe("course structure", () => {
  it("Full guide: one item per page, intro first, then each exercise as starting position → conducting → extras", async () => {
    const { client, pid } = await setup();
    await fill(pid);
    const first = await page(client);
    expect(first).toContain("Philosophy intro");
    expect(first).not.toContain("Hip shift</h2>");
    expect(first).toContain("1 of 2");
    expect(first).toContain('href="/account/programmes/hips?mode=guide&amp;item=2" rel="next"');
    expect(first).toContain("How to use this programme");

    const html = await client.get("/account/programmes/hips?mode=guide&item=2").then((r) => r.text());
    expect(html).toContain("Stage 1: Hips · Exercise");
    expect(html).toContain("2 of 2");
    expect(html).toContain('rel="prev"');
    expect(html).not.toContain("How to use this programme");
    const start = html.indexOf("1. Starting position");
    expect(start).toBeGreaterThan(0);
    expect(start).toBeLessThan(html.indexOf("2. Conducting the exercise"));
    expect(html.indexOf("2. Conducting the exercise")).toBeLessThan(html.indexOf("What to watch for"));
    expect(html).toContain("Easier and harder versions");
    expect(html).toContain("The most important part of the movement");
    expect(html).toContain("<strong>Advised:</strong> 30–60 seconds. Tune in to your body rather than the clock.");
    expect(html).toContain("This shows what the movement looks like, nothing more");
    expect(html).toContain("data-text-size");
    expect(html).not.toContain("Intro key points"); // quick-tab sections belong to Key points
  });

  it("Full guide: out-of-range pages are clamped, and ticking an item moves on to the next", async () => {
    const { client, pid } = await setup();
    await fill(pid);
    expect(await client.get("/account/programmes/hips?mode=guide&item=99").then((r) => r.text())).toContain("2 of 2");
    expect(await client.get("/account/programmes/hips?mode=guide&item=abc").then((r) => r.text())).toContain("1 of 2");
    const first = await page(client);
    expect(first).toContain("Mark as done and continue →");
    const lesson = /name="lesson" value="(\d+)"/.exec(first)![1]!;
    const res = await client.post("/account/programmes/hips/progress", { lesson, mode: "guide", done: "yes", item: "2" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/account/programmes/hips?mode=guide&item=2");
  });

  it("Listen: a play button per item reading the starting position and conducting, without formatting marks", async () => {
    const { client, pid } = await setup();
    await fill(pid);
    const html = await page(client, "listen");
    expect(html).toMatch(/data-listen="say-\d+"/);
    expect(html).toContain("Hip shift. Starting position. Stand with soft knees. Conducting the exercise. Shift slowly to one side.");
    expect(html).toMatch(/<script src="\/reader\.js\?v=[a-z0-9]+" defer=""><\/script>/);
    const js = await app.request("/reader.js", {}, env);
    expect(await js.text()).toContain("speechSynthesis");
  });

  it("Key points: the short versions, with the video tucked away", async () => {
    const { client, pid } = await setup();
    await fill(pid);
    const html = await page(client, "points");
    expect(html).toContain("Intro key points");
    expect(html).toContain("<li>Hips level</li>");
    expect(html).not.toContain("Philosophy intro");
    expect(html).toContain("<summary>Watch the demonstration</summary>");
  });

  it("Exercise sheet: exercises only, no philosophy, printable", async () => {
    const { client, pid } = await setup();
    await fill(pid);
    const html = await page(client, "sheet");
    expect(html).toContain("Hip shift");
    expect(html).toContain("Slow shift, hips level");
    expect(html).not.toContain("Philosophy intro");
    expect(html).not.toContain("Intro key points");
    expect(html).toContain("data-print");
    expect(html).not.toContain("How to use this programme");
    expect(html).toContain("you should already have a full understanding");
    expect(html).toContain("advised 30–60 seconds");
  });

  it("old ?tab= links still work", async () => {
    const { client, pid } = await setup();
    await fill(pid);
    expect(await (await client.get("/account/programmes/hips?tab=quick")).text()).toContain('aria-current="page">Key points');
  });

  it("strips formatting for reading aloud", () => {
    expect(plainText("## Title\n- one\n- **two**\n\nSee [this](https://x.example)")).toBe("Title. one. two. See this.");
  });
});
