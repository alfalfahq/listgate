// CRM property database uploads (separate token from the listing feed).
//   POST ?mode=snapshot|delta&office=<office id>   body: CSV, JSON array or NDJSON (gzip ok), raw or as one multipart file
//   GET  ?run=<id>                                  status of an upload
// Uploads are processed in the background: the POST answers 202 with a run id straight away.
import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, ingestProperties, propertyRuns, sourceByPropertyToken } from "@listgate/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_MB = Number(process.env.MAX_PROPERTY_MB || 100);

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const db = await getDb();
  const source = await sourceByPropertyToken(db, (await ctx.params).token);
  if (!source) return Response.json({ ok: false, error: "Unknown property feed token." }, { status: 401 });
  if (source.suspendedAt) return Response.json({ ok: false, error: "This CRM feed is suspended on Listgate." }, { status: 403 });
  if (Number(req.headers.get("content-length") || 0) > MAX_MB * 1_048_576) return Response.json({ ok: false, error: `Files can be up to ${MAX_MB} MB (gzip helps).` }, { status: 413 });
  const q = new URL(req.url).searchParams;
  const mode = q.get("mode") === "snapshot" ? "snapshot" : "delta";
  let buf: Buffer;
  let fileName: string | null = null;
  if ((req.headers.get("content-type") || "").startsWith("multipart/form-data")) {
    const form = await req.formData();
    const file = [...form.values()].find((v): v is File => typeof v === "object" && "arrayBuffer" in v);
    if (!file) return Response.json({ ok: false, error: "Attach the file." }, { status: 400 });
    fileName = file.name;
    buf = Buffer.from(await file.arrayBuffer());
  } else buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) return Response.json({ ok: false, error: "The file is empty." }, { status: 400 });
  if (buf.length > MAX_MB * 1_048_576) return Response.json({ ok: false, error: `Files can be up to ${MAX_MB} MB (gzip helps).` }, { status: 413 });
  const [run] = await db.insert(propertyRuns).values({ sourceId: source.id, status: "queued", mode, fileName, bytes: buf.length }).returning();
  after(() => ingestProperties(db, source, buf, { mode, office: q.get("office"), fileName, runId: run.id }).catch((e) => console.error("[properties]", e)));
  return Response.json({ ok: true, runId: run.id, status: "queued", mode, check: `GET this URL with ?run=${run.id}` }, { status: 202 });
}

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const db = await getDb();
  const source = await sourceByPropertyToken(db, (await ctx.params).token);
  if (!source) return Response.json({ ok: false, error: "Unknown property feed token." }, { status: 401 });
  const id = Number(new URL(req.url).searchParams.get("run"));
  const [run] = id ? await db.select().from(propertyRuns).where(and(eq(propertyRuns.id, id), eq(propertyRuns.sourceId, source.id))) : [];
  if (!run) return Response.json({ ok: false, error: "Add ?run=<id> from your upload's response." }, { status: 404 });
  const { sourceId: _s, ...rest } = run;
  return Response.json({ ok: true, run: rest });
}
