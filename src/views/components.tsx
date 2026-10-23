import type { Child } from "hono/jsx";
import type { Copy, Principle, Stage } from "../content/site";

/** Renders confirmed text as-is and unconfirmed text as a clearly marked placeholder. */
export function Text(props: { copy: Copy }) {
  const { copy } = props;
  if (typeof copy === "string") {
    // Owner-edited text may still contain "[PLACEHOLDER: …]" markers; keep them highlighted.
    const parts = copy.split(/(\[PLACEHOLDER:[^\]]*\])/);
    if (parts.length === 1) return <>{copy}</>;
    return <>{parts.map((p) => (p.startsWith("[PLACEHOLDER:") ? <mark class="placeholder" data-placeholder="true">{p}</mark> : p))}</>;
  }
  return (
    <mark class="placeholder" data-placeholder="true">
      [PLACEHOLDER: {copy.placeholder}]
    </mark>
  );
}

export function SectionHead(props: { eyebrow?: string; title: string; intro?: Child; id?: string }) {
  return (
    <header class="section-head">
      {props.eyebrow && <p class="eyebrow">{props.eyebrow}</p>}
      <h2 id={props.id}>{props.title}</h2>
      {props.intro && <p class="section-intro">{props.intro}</p>}
    </header>
  );
}

export function Button(props: { href: string; children: Child; variant?: "primary" | "ghost" }) {
  return (
    <a class={`btn btn-${props.variant ?? "primary"}`} href={props.href}>
      {props.children}
    </a>
  );
}

export function PrinciplesGrid(props: { principles: Principle[] }) {
  return (
    <ol class="principles">
      {props.principles.map((p) => (
        <li class="principle">
          <span class="principle-n" aria-hidden="true">
            {String(p.n).padStart(2, "0")}
          </span>
          <h3>{p.title}</h3>
          <p>{p.summary}</p>
        </li>
      ))}
    </ol>
  );
}

/** The ground-up path: stages listed from the feet upwards, drawn as a rising line. */
export function GroundUp(props: { stages: Stage[] }) {
  return (
    <ol class="ground-up">
      {props.stages.map((s, i) => (
        <li class="stage">
          <span class="stage-dot" aria-hidden="true">
            {i + 1}
          </span>
          <div>
            <h3>{s.title}</h3>
            <p>{s.summary}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ForNotFor(props: { forList: string[]; notFor: string[] }) {
  return (
    <div class="for-grid">
      <div class="card for">
        <h3>Designed for</h3>
        <ul class="ticks">
          {props.forList.map((t) => (
            <li>{t}</li>
          ))}
        </ul>
      </div>
      <div class="card not-for">
        <h3>Not suitable without clearance</h3>
        <ul class="crosses">
          {props.notFor.map((t) => (
            <li>{t}</li>
          ))}
        </ul>
        <p class="small">
          This is education and movement coaching, not medical treatment. <a href="/legal/health-disclaimer">Read the health disclaimer</a>.
        </p>
      </div>
    </div>
  );
}
