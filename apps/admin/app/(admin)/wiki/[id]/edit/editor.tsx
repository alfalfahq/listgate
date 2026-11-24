"use client";
// The page editor: title, a formatting toolbar, markdown on the left and the page as it will look on the right.
// Ctrl/Cmd+S publishes. Leaving with unsaved changes asks first; cancelling a brand-new page throws it away.
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { WIKI_CSS, renderWiki } from "@listgate/db/wiki";
import { discardDraft, savePage, type SaveState } from "@/app/wiki-actions";

type Opt = { id: string; title: string; depth: number };

export function Editor({
  page,
  parents,
  titles,
  parentInternal,
}: {
  page: { id: string; title: string; body: string; emoji: string | null; internal: boolean; labels: string[]; parentId: string | null; version: number; isNew: boolean; publicUrl: string };
  parents: Opt[];
  titles: { title: string; slug: string }[];
  parentInternal: boolean;
}) {
  const router = useRouter();
  const [state, action] = useActionState<SaveState, FormData>(savePage, undefined);
  const [title, setTitle] = useState(page.isNew ? "" : page.title);
  const [body, setBody] = useState(page.body);
  const [view, setView] = useState<"split" | "write" | "preview">("split");
  const ta = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const dirty = useRef(false);
  const saving = useRef(false);
  dirty.current = title !== (page.isNew ? "" : page.title) || body !== page.body;

  const known = useMemo(() => new Map(titles.flatMap((t) => [[t.title.toLowerCase(), t.slug], [t.slug, t.slug]])), [titles]);
  const preview = useMemo(() => renderWiki(body, (t) => (known.has(t.toLowerCase()) ? "#" : null)).html, [body, known]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current && !saving.current) e.preventDefault();
    };
    const save = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        form.current?.requestSubmit();
      }
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("keydown", save);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("keydown", save);
    };
  }, []);

  /** Wrap the selection (or insert a placeholder) and keep the cursor sensible. */
  const wrap = (before: string, after = before, placeholder = "text") => {
    const el = ta.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const sel = body.slice(s, e) || placeholder;
    const next = body.slice(0, s) + before + sel + after + body.slice(e);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + sel.length);
    });
  };
  /** Prefix each selected line (lists, headings, quotes). */
  const lines = (prefix: (i: number) => string) => {
    const el = ta.current;
    if (!el) return;
    const s = body.lastIndexOf("\n", el.selectionStart - 1) + 1;
    const eIdx = body.indexOf("\n", el.selectionEnd);
    const e = eIdx === -1 ? body.length : eIdx;
    const block = body.slice(s, e) || "";
    const out = block.split("\n").map((l, i) => prefix(i) + l.replace(/^(#{1,6} |[-*] (\[[ x]\] )?|\d+\. |> )/, "")).join("\n");
    setBody(body.slice(0, s) + out + body.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s, s + out.length);
    });
  };
  const block = (text: string) => {
    const el = ta.current;
    if (!el) return;
    const at = el.selectionStart;
    const pre = body.slice(0, at);
    const lead = pre && !pre.endsWith("\n\n") ? (pre.endsWith("\n") ? "\n" : "\n\n") : "";
    const next = pre + lead + text + "\n" + body.slice(at);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = (pre + lead + text).length;
      el.setSelectionRange(pos, pos);
    });
  };

  const tools: { label: string; title: string; run: () => void; cls?: string }[] = [
    { label: "B", title: "Bold (Ctrl+B)", run: () => wrap("**"), cls: "font-bold" },
    { label: "I", title: "Italic (Ctrl+I)", run: () => wrap("_"), cls: "italic" },
    { label: "S", title: "Strikethrough", run: () => wrap("~~"), cls: "line-through" },
    { label: "H1", title: "Heading 1", run: () => lines(() => "# ") },
    { label: "H2", title: "Heading 2", run: () => lines(() => "## ") },
    { label: "H3", title: "Heading 3", run: () => lines(() => "### ") },
    { label: "• List", title: "Bulleted list", run: () => lines(() => "- ") },
    { label: "1. List", title: "Numbered list", run: () => lines((i) => `${i + 1}. `) },
    { label: "☐ Tasks", title: "Checklist", run: () => lines(() => "- [ ] ") },
    { label: "Link", title: "Link (Ctrl+K)", run: () => wrap("[", "](https://)", "link text") },
    { label: "Page link", title: "Link to another wiki page", run: () => wrap("[[", "]]", "Page title") },
    { label: "Image", title: "Image from a URL", run: () => wrap("![", "](https://)", "description") },
    { label: "Code", title: "Code", run: () => (ta.current && ta.current.selectionStart !== ta.current.selectionEnd && !body.slice(ta.current.selectionStart, ta.current.selectionEnd).includes("\n") ? wrap("`") : block("```\ncode\n```")) },
    { label: "Quote", title: "Quote", run: () => lines(() => "> ") },
    { label: "Table", title: "Table", run: () => block("| Column | Column |\n| --- | --- |\n| Cell | Cell |") },
    { label: "Info", title: "Info panel", run: () => block("> [!INFO]\n> Something worth knowing.") },
    { label: "Tip", title: "Tip panel", run: () => block("> [!TIP]\n> A handy shortcut.") },
    { label: "Warning", title: "Warning panel", run: () => block("> [!WARNING]\n> Be careful with this.") },
    { label: "Divider", title: "Divider", run: () => block("---") },
  ];

  return (
    <form
      ref={form}
      action={(f) => {
        saving.current = true;
        return action(f);
      }}
      className="flex flex-col"
    >
      <style dangerouslySetInnerHTML={{ __html: WIKI_CSS }} />
      <input type="hidden" name="id" value={page.id} />
      <input type="hidden" name="baseVersion" value={page.version} />
      <input type="hidden" name="body" value={body} />

      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-[var(--admin-bg,#f6f8fa)] px-1 pb-3 pt-1">
        <span className="text-sm font-semibold text-ink">{page.isNew ? "New page" : "Editing"}</span>
        <div className="ml-2 flex rounded-[3px] border border-zinc-200 bg-white p-0.5 text-xs">
          {(["write", "split", "preview"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={`rounded-[2px] px-2.5 py-1 capitalize ${view === v ? "bg-navy text-white" : "text-zinc-600 hover:bg-zinc-100"}`}>
              {v}
            </button>
          ))}
        </div>
        <span className="ml-auto flex items-center gap-2">
          {state?.error && <span className="max-w-md text-sm text-rose-700" role="alert">{state.error}</span>}
          <button
            type="button"
            onClick={async () => {
              if (dirty.current && !confirm("Discard your changes?")) return;
              saving.current = true;
              if (page.isNew) {
                await discardDraft(page.id);
                router.push("/wiki");
              } else router.push(`/wiki/${page.id}`);
            }}
            className="rounded-[3px] px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
          >
            {page.isNew ? "Discard" : "Close"}
          </button>
          <Publish isNew={page.isNew} />
        </span>
      </div>

      <div className="mt-5 grid gap-6 2xl:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0">
          <div className="flex items-start gap-2">
            <input name="emoji" defaultValue={page.emoji ?? ""} placeholder="📄" aria-label="Page icon (an emoji)" maxLength={8} className="h-12 w-12 shrink-0 rounded-[3px] border border-transparent bg-transparent text-center text-2xl hover:border-zinc-300 focus:border-teal focus:bg-white focus:outline-none" />
            <input
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus={page.isNew}
              placeholder="Give this page a title"
              aria-label="Title"
              maxLength={200}
              className="min-w-0 flex-1 rounded-[3px] border border-transparent bg-transparent px-1 py-1.5 text-3xl font-bold text-navy placeholder:text-zinc-300 hover:border-zinc-300 focus:border-teal focus:bg-white focus:outline-none"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-0.5 rounded-[3px] border border-zinc-200 bg-white p-1" role="toolbar" aria-label="Formatting">
            {tools.map((t) => (
              <button key={t.label} type="button" onClick={t.run} title={t.title} className={`rounded-[3px] px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 ${t.cls ?? ""}`}>
                {t.label}
              </button>
            ))}
          </div>

          <div className={`mt-3 grid gap-4 ${view === "split" ? "lg:grid-cols-2" : ""}`}>
            {view !== "preview" && (
              <textarea
                ref={ta}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  const k = e.key.toLowerCase();
                  if ((e.metaKey || e.ctrlKey) && k === "b") (e.preventDefault(), wrap("**"));
                  if ((e.metaKey || e.ctrlKey) && k === "i") (e.preventDefault(), wrap("_"));
                  if ((e.metaKey || e.ctrlKey) && k === "k") (e.preventDefault(), wrap("[", "](https://)", "link text"));
                  if (e.key === "Tab") {
                    e.preventDefault();
                    wrap("  ", "", "");
                  }
                }}
                aria-label="Page content (markdown)"
                placeholder={"Start writing…\n\n## A heading\n- a list\n[[Another page]] links to a wiki page"}
                spellCheck
                className="min-h-[60vh] w-full resize-y rounded-[3px] border border-zinc-300 bg-white p-4 font-mono text-[13.5px] leading-relaxed text-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-cyan/25"
              />
            )}
            {view !== "write" && (
              <div className="min-h-[60vh] rounded-[3px] border border-zinc-200 bg-white p-5" aria-label="Preview">
                {body.trim() ? <div className="wiki-body" dangerouslySetInnerHTML={{ __html: preview }} /> : <p className="text-sm text-zinc-400">The preview shows here as you type.</p>}
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-4 2xl:sticky 2xl:top-20 2xl:self-start">
          <fieldset className="rounded-[3px] border border-zinc-200 bg-white p-4">
            <legend className="px-1 text-sm font-semibold text-ink">Who can read it</legend>
            <Visibility defaultInternal={page.internal} parentInternal={parentInternal} />
          </fieldset>
          <div className="rounded-[3px] border border-zinc-200 bg-white p-4 space-y-3">
            <label className="block">
              <span className="label">Parent page</span>
              <select name="parentId" defaultValue={page.parentId ?? ""} className="input w-full rounded-[3px] py-1.5">
                <option value="">None (top level)</option>
                {parents.map((o) => (
                  <option key={o.id} value={o.id}>{`${"  ".repeat(o.depth)}${o.title}`}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Labels</span>
              <input name="labels" defaultValue={page.labels.join(", ")} placeholder="domains, billing" className="input w-full rounded-[3px] py-1.5" />
            </label>
            <label className="block">
              <span className="label">What changed (optional)</span>
              <input name="note" maxLength={200} placeholder="e.g. Added the Cloudflare steps" className="input w-full rounded-[3px] py-1.5" />
            </label>
          </div>
          <details className="rounded-[3px] border border-zinc-200 bg-white p-4 text-xs text-zinc-600">
            <summary className="text-sm font-semibold text-ink">Formatting help</summary>
            <ul className="mt-2 space-y-1 font-mono">
              <li>## Heading</li>
              <li>**bold** _italic_</li>
              <li>- list · 1. list · - [ ] task</li>
              <li>[text](https://…)</li>
              <li>[[Page title]] links a page</li>
              <li>&gt; [!INFO] / [!TIP] / [!WARNING]</li>
              <li>``` code ```</li>
            </ul>
            <p className="mt-2">Ctrl/Cmd + S publishes.</p>
          </details>
        </aside>
      </div>
    </form>
  );
}

function Visibility({ defaultInternal, parentInternal }: { defaultInternal: boolean; parentInternal: boolean }) {
  const [internal, setInternal] = useState(defaultInternal);
  return (
    <div className="space-y-2 text-sm">
      <label className={`flex cursor-pointer gap-2 rounded-[3px] border p-2 ${!internal ? "border-emerald-400 bg-emerald-50" : "border-zinc-200"}`}>
        <input type="radio" name="vis" checked={!internal} onChange={() => setInternal(false)} className="mt-0.5 accent-teal" />
        <span><strong className="block text-ink">Public</strong><span className="text-xs text-zinc-600">Customers can read it on the help site.</span></span>
      </label>
      <label className={`flex cursor-pointer gap-2 rounded-[3px] border p-2 ${internal ? "border-amber-400 bg-amber-50" : "border-zinc-200"}`}>
        <input type="radio" name="vis" checked={internal} onChange={() => setInternal(true)} className="mt-0.5 accent-teal" />
        <span><strong className="block text-ink">Internal</strong><span className="text-xs text-zinc-600">Only the team. Pages under it are internal too.</span></span>
      </label>
      {internal && <input type="hidden" name="internal" value="on" />}
      {parentInternal && !internal && <p className="text-xs text-amber-800">Its parent page is internal, so this stays hidden until the parent is public.</p>}
    </div>
  );
}

function Publish({ isNew }: { isNew: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary min-h-[34px] rounded-[3px] px-4" disabled={pending} title="Publish (Ctrl/Cmd+S)">
      {pending ? "Publishing…" : isNew ? "Publish" : "Update"}
    </button>
  );
}
