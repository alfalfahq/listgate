// Wiki helpers shared by admin (editing) and web (public /help pages).
// Markdown is rendered with raw HTML escaped, so a page can never inject script into the public site.
import { Marked, type Tokens } from "marked";

export type WikiHeading = { id: string; text: string; depth: number };
export type WikiRender = { html: string; headings: WikiHeading[] };

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "page"
  );
}

const PANELS: Record<string, { cls: string; label: string }> = {
  INFO: { cls: "info", label: "Info" },
  NOTE: { cls: "note", label: "Note" },
  TIP: { cls: "tip", label: "Tip" },
  SUCCESS: { cls: "tip", label: "Tip" },
  WARNING: { cls: "warning", label: "Warning" },
  ERROR: { cls: "error", label: "Important" },
};

/**
 * Markdown to safe HTML.
 * - `[[Page title]]` links to another wiki page (resolve gives its href, or null if it doesn't exist / isn't visible).
 * - `> [!INFO]`, `[!NOTE]`, `[!TIP]`, `[!WARNING]`, `[!ERROR]` blockquotes become Confluence-style panels.
 * - GFM tables and task lists.
 */
export function renderWiki(md: string, resolve: (titleOrSlug: string) => string | null = () => null, opts: { markMissing?: boolean } = { markMissing: true }): WikiRender {
  const headings: WikiHeading[] = [];
  const used = new Map<string, number>();
  const marked = new Marked({ gfm: true, breaks: true });
  marked.use({
    renderer: {
      html(token: Tokens.HTML | Tokens.Tag) {
        return escapeHtml(token.text);
      },
      heading(this: { parser: { parseInline: (t: Tokens.Generic[]) => string } }, token: Tokens.Heading) {
        const inner = this.parser.parseInline(token.tokens);
        let id = slugify(token.text.replace(/<[^>]+>/g, ""));
        const n = used.get(id) ?? 0;
        used.set(id, n + 1);
        if (n) id = `${id}-${n}`;
        headings.push({ id, text: token.text.replace(/[*_`[\]]/g, ""), depth: token.depth });
        return `<h${token.depth} id="${id}"><a class="wiki-anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${inner}</h${token.depth}>\n`;
      },
      link(this: { parser: { parseInline: (t: Tokens.Generic[]) => string } }, token: Tokens.Link) {
        const text = this.parser.parseInline(token.tokens);
        let href = token.href || "";
        if (href.startsWith("wiki:")) {
          const target = resolve(decodeURIComponent(href.slice(5)));
          if (target) return `<a href="${escapeHtml(target)}" class="wiki-link">${text}</a>`;
          return opts.markMissing === false ? text : `<span class="wiki-missing" title="No page with that name yet">${text}</span>`;
        }
        if (!/^(https?:\/\/|mailto:|\/|#)/i.test(href)) return text;
        const external = /^https?:\/\//i.test(href);
        href = escapeHtml(href);
        const title = token.title ? ` title="${escapeHtml(token.title)}"` : "";
        return `<a href="${href}"${title}${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${text}</a>`;
      },
      image(token: Tokens.Image) {
        if (!/^(https:\/\/|\/media\/)/i.test(token.href || "")) return escapeHtml(token.text || "");
        return `<img src="${escapeHtml(token.href)}" alt="${escapeHtml(token.text || "")}" loading="lazy" />`;
      },
      blockquote(this: { parser: { parse: (t: Tokens.Generic[]) => string } }, token: Tokens.Blockquote) {
        const inner = this.parser.parse(token.tokens);
        const m = inner.match(/^<p>\[!(INFO|NOTE|TIP|SUCCESS|WARNING|ERROR)\](?:<br>|\s)*/i);
        if (m) {
          const p = PANELS[m[1].toUpperCase()];
          const rest = inner.slice(m[0].length).replace(/^<\/p>\s*/, "");
          const body = rest.startsWith("<") ? rest : `<p>${rest}`;
          return `<div class="wiki-panel wiki-panel-${p.cls}" role="note"><p class="wiki-panel-label">${p.label}</p>${body}</div>\n`;
        }
        return `<blockquote>${inner}</blockquote>\n`;
      },
      checkbox({ checked }: Tokens.Checkbox) {
        return `<input type="checkbox" disabled${checked ? " checked" : ""} /> `;
      },
    },
  });
  // [[Page title]] or [[Page title|shown text]]
  const pre = neutraliseHtml(md).replace(/\[\[([^\]|\n]{1,120})(?:\|([^\]\n]{1,120}))?\]\]/g, (_, target: string, label?: string) => `[${(label ?? target).trim()}](wiki:${encodeURIComponent(target.trim())})`);
  const html = marked.parse(pre, { async: false }) as string;
  return { html, headings };
}

/** Turn "<" into an entity outside code, so HTML in a page is shown as text and the markdown around it still works. */
function neutraliseHtml(md: string) {
  let fence = false;
  return md
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        fence = !fence;
        return line;
      }
      if (fence || /^( {4}|\t)/.test(line)) return line;
      return line
        .split(/(`[^`]*`)/)
        .map((part, i) => (i % 2 ? part : part.replace(/</g, "&lt;")))
        .join("");
    })
    .join("\n");
}

/** Plain-text excerpt for lists, search results and link previews. */
export function wikiExcerpt(md: string, n = 180) {
  const t = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[!(INFO|NOTE|TIP|SUCCESS|WARNING|ERROR)\]/gi, "")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b ?? a)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`|~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

type TreeRow = { id: string; parentId: string | null; internal: boolean; archivedAt?: Date | null };
/** Ids of pages the public can read: not archived, not internal, and no internal or archived parent. */
export function publicPageIds(rows: TreeRow[]) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ok = new Map<string, boolean>();
  const visible = (id: string, depth = 0): boolean => {
    if (ok.has(id)) return ok.get(id)!;
    const r = byId.get(id);
    const v = !!r && !r.internal && !r.archivedAt && depth < 50 && (!r.parentId || visible(r.parentId, depth + 1));
    ok.set(id, v);
    return v;
  };
  return new Set(rows.filter((r) => visible(r.id)).map((r) => r.id));
}

/** Pages as a tree, children sorted. */
export function wikiTree<T extends { id: string; parentId: string | null; sort: number; title: string }>(rows: T[]) {
  type Node = T & { children: Node[] };
  const nodes = new Map<string, Node>(rows.map((r) => [r.id, { ...r, children: [] }]));
  const roots: Node[] = [];
  for (const n of nodes.values()) {
    const p = n.parentId ? nodes.get(n.parentId) : undefined;
    (p ? p.children : roots).push(n);
  }
  const sort = (list: Node[]) => {
    list.sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));
    list.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

/** The CSS for rendered pages, shared by admin and the public help site (scoped to .wiki-body). */
export const WIKI_CSS = `
.wiki-body{color:#262e3b;font-size:15px;line-height:1.7;overflow-wrap:anywhere}
.wiki-body>*:first-child{margin-top:0}
.wiki-body h1,.wiki-body h2,.wiki-body h3,.wiki-body h4{color:#0d2d4f;font-weight:700;line-height:1.3;margin:1.6em 0 .5em;position:relative;scroll-margin-top:80px}
.wiki-body h1{font-size:1.75em}.wiki-body h2{font-size:1.4em}.wiki-body h3{font-size:1.15em}.wiki-body h4{font-size:1em}
.wiki-body .wiki-anchor{position:absolute;left:-1em;color:#9aa5b1;text-decoration:none;opacity:0;font-weight:400}
.wiki-body h1:hover .wiki-anchor,.wiki-body h2:hover .wiki-anchor,.wiki-body h3:hover .wiki-anchor{opacity:1}
.wiki-body p{margin:.75em 0}
.wiki-body a{color:#0e7c99;text-decoration:underline;text-underline-offset:2px}
.wiki-body .wiki-missing{color:#b42318;border-bottom:1px dashed #b42318}
.wiki-body ul,.wiki-body ol{margin:.75em 0;padding-left:1.5em}.wiki-body ul{list-style:disc}.wiki-body ol{list-style:decimal}
.wiki-body li{margin:.25em 0}.wiki-body li>input[type=checkbox]{margin-right:.4em;accent-color:#0e7c99;vertical-align:-1px}
.wiki-body ul:has(>li>input[type=checkbox]){list-style:none;padding-left:.2em}
.wiki-body code{background:#f1f3f5;border-radius:4px;padding:.1em .35em;font-size:.88em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.wiki-body pre{background:#0d2d4f;color:#e8f6fb;border-radius:8px;padding:14px 16px;overflow-x:auto;margin:1em 0}
.wiki-body pre code{background:none;padding:0;color:inherit;font-size:.85em}
.wiki-body blockquote{border-left:3px solid #d0d7de;color:#52606d;margin:1em 0;padding:.1em 0 .1em 1em}
.wiki-body table{border-collapse:collapse;margin:1em 0;width:100%;font-size:.93em;display:block;overflow-x:auto}
.wiki-body th,.wiki-body td{border:1px solid #dfe3e8;padding:7px 10px;text-align:left;vertical-align:top}
.wiki-body th{background:#f6f8fa;font-weight:600}
.wiki-body img{max-width:100%;height:auto;border-radius:6px;margin:.5em 0}
.wiki-body hr{border:0;border-top:1px solid #e5e7eb;margin:2em 0}
.wiki-panel{border-radius:6px;margin:1em 0;padding:10px 14px 10px 14px;border:1px solid}
.wiki-panel>p:last-child{margin-bottom:0}.wiki-panel>p{margin:.35em 0}
.wiki-panel-label{font-size:.75em;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin:0 0 .2em!important}
.wiki-panel-info{background:#e9f2ff;border-color:#cce0ff}.wiki-panel-info .wiki-panel-label{color:#0055cc}
.wiki-panel-note{background:#f3f0ff;border-color:#dfd8fd}.wiki-panel-note .wiki-panel-label{color:#5e4db2}
.wiki-panel-tip{background:#dcfff1;border-color:#baf3db}.wiki-panel-tip .wiki-panel-label{color:#216e4e}
.wiki-panel-warning{background:#fff7d6;border-color:#f8e6a0}.wiki-panel-warning .wiki-panel-label{color:#7f5f01}
.wiki-panel-error{background:#ffeceb;border-color:#ffd5d2}.wiki-panel-error .wiki-panel-label{color:#ae2e24}
`;
