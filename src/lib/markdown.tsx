import type { Child } from "hono/jsx";

// A deliberately small, safe text formatter for programme content.
// It produces JSX (never raw HTML), so nothing typed into a lesson can inject markup.
//
//   ## Heading          ### Smaller heading
//   - bullet            1. numbered
//   > Key point         (shown as a highlighted callout)
//   **bold**  *italic*  [link text](https://example.com)
//   blank line = new paragraph

function inline(text: string): Child[] {
  const out: Child[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(((?:https?:\/\/|\/(?!\/))[^\s)]+)\)/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong>{m[1]}</strong>);
    else if (m[2]) out.push(<em>{m[2]}</em>);
    else if (m[3] && m[4])
      out.push(
        m[4].startsWith("/") ? (
          <a href={m[4]}>{m[3]}</a>
        ) : (
          <a href={m[4]} rel="noopener noreferrer" target="_blank">
            {m[3]}
          </a>
        ),
      );
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block = { kind: "h2" | "h3" | "p" | "quote"; text: string } | { kind: "ul" | "ol"; items: string[] };

export function parseBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
    para = [];
  };
  for (const raw of src.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    const prev = blocks[blocks.length - 1];
    let m: RegExpExecArray | null;
    if (!line) flush();
    else if ((m = /^###\s+(.*)$/.exec(line))) (flush(), blocks.push({ kind: "h3", text: m[1]! }));
    else if ((m = /^##?\s+(.*)$/.exec(line))) (flush(), blocks.push({ kind: "h2", text: m[1]! }));
    else if ((m = /^>\s?(.*)$/.exec(line))) {
      flush();
      if (prev?.kind === "quote" && !para.length) prev.text += " " + m[1];
      else blocks.push({ kind: "quote", text: m[1]! });
    } else if ((m = /^[-*•]\s+(.*)$/.exec(line))) {
      flush();
      if (prev?.kind === "ul") prev.items.push(m[1]!);
      else blocks.push({ kind: "ul", items: [m[1]!] });
    } else if ((m = /^\d+[.)]\s+(.*)$/.exec(line))) {
      flush();
      if (prev?.kind === "ol") prev.items.push(m[1]!);
      else blocks.push({ kind: "ol", items: [m[1]!] });
    } else para.push(line);
  }
  flush();
  return blocks;
}

/** level 2 = articles (## becomes <h2>); level 3 = inside a lesson that already has its own <h2>. */
export function RichText(props: { source: string; level?: 2 | 3 }) {
  const top = props.level ?? 3;
  return (
    <>
      {parseBlocks(props.source).map((b) => {
        switch (b.kind) {
          case "h2":
            return top === 2 ? <h2 class="rt-h2">{inline(b.text)}</h2> : <h3 class="rt-h2">{inline(b.text)}</h3>;
          case "h3":
            return top === 2 ? <h3 class="rt-h3">{inline(b.text)}</h3> : <h4 class="rt-h3">{inline(b.text)}</h4>;
          case "quote":
            return (
              <aside class="key-point">
                <span class="key-point-label">Key point</span>
                <p>{inline(b.text)}</p>
              </aside>
            );
          case "ul":
            return (
              <ul>
                {b.items.map((i) => (
                  <li>{inline(i)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol>
                {b.items.map((i) => (
                  <li>{inline(i)}</li>
                ))}
              </ol>
            );
          default:
            return <p>{inline(b.text)}</p>;
        }
      })}
    </>
  );
}
