// Listgate FTP receiver. For CRMs that can only send REAXML to a portal by FTP.
//
// Each agency logs in with username = its Listgate slug, password = its feed token (both on the agency's
// page in the app). Every file it uploads is posted straight to the web app (/api/feeds/ftp), which
// stores it exactly like an HTTP feed. Files are kept in a per-login temp folder only until they're sent.
//
// App Platform can't take FTP traffic, so this runs on its own small droplet:
//   APP_URL=https://listgate.com.au FTP_RELAY_KEY=<same as web> PASV_URL=<droplet public IP> npm start -w @listgate/ftp
// Optional explicit FTPS: FTP_TLS_KEY=/path/privkey.pem FTP_TLS_CERT=/path/fullchain.pem
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FtpSrv } from "ftp-srv";

const APP_URL = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
const RELAY_KEY = process.env.FTP_RELAY_KEY || "";
const PORT = Number(process.env.FTP_PORT || 21);
const PASV_URL = process.env.PASV_URL || "127.0.0.1";
const PASV_MIN = Number(process.env.PASV_MIN || 30000);
const PASV_MAX = Number(process.env.PASV_MAX || 30100);
const MAX_MB = Number(process.env.MAX_FEED_MB || 25);
const ROOT = process.env.FTP_SPOOL || path.join(os.tmpdir(), "listgate-ftp");

if (!RELAY_KEY) {
  console.error("Set FTP_RELAY_KEY (the same value as the web app's).");
  process.exit(1);
}

const tls =
  process.env.FTP_TLS_KEY && process.env.FTP_TLS_CERT
    ? { key: fs.readFileSync(process.env.FTP_TLS_KEY), cert: fs.readFileSync(process.env.FTP_TLS_CERT) }
    : false;

const server = new FtpSrv({
  url: `ftp://0.0.0.0:${PORT}`,
  pasv_url: PASV_URL,
  pasv_min: PASV_MIN,
  pasv_max: PASV_MAX,
  anonymous: false,
  greeting: ["Listgate REAXML receiver"],
  tls,
  timeout: 5 * 60_000,
});

const safe = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);

async function relay(token: string, file: string, name: string) {
  const size = fs.statSync(file).size;
  if (size > MAX_MB * 1_048_576) throw new Error(`File is over ${MAX_MB} MB.`);
  const res = await fetch(`${APP_URL}/api/feeds/ftp`, {
    method: "POST",
    headers: { "content-type": "application/xml", "x-listgate-ftp-key": RELAY_KEY, "x-feed-token": token, "x-file-name": name },
    body: fs.readFileSync(file),
    signal: AbortSignal.timeout(120_000),
  });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; received?: number };
  if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
  return j;
}

server.on("login", ({ connection, username, password }, resolve, reject) => {
  const token = String(password || "");
  if (token.length < 16) return reject(new Error("Wrong username or password."));
  // The token is checked by the web app on every file. Sessions get an empty, private folder.
  const dir = fs.mkdtempSync(path.join(ROOT, `${safe(String(username || "agency"))}-`));
  connection.on("STOR", (error: Error | null, fileName: string) => {
    if (error || !fileName) return;
    const name = path.basename(fileName);
    // Only XML is read. Some CRMs also upload photos; those stay at their image URLs in the XML.
    if (!/\.xml$/i.test(name)) {
      fs.rm(fileName, { force: true }, () => {});
      return;
    }
    relay(token, fileName, name)
      .then((r) => console.log(`[ftp] ${username}/${name}: ${r.received ?? 0} listings`))
      .catch((e) => console.error(`[ftp] ${username}/${name} failed: ${e instanceof Error ? e.message : e}`))
      .finally(() => fs.rm(fileName, { force: true }, () => {}));
  });
  connection.on("close", () => fs.rm(dir, { recursive: true, force: true }, () => {}));
  resolve({ root: dir });
});

server.on("client-error", ({ context, error }) => console.warn("[ftp] client error", context, error?.message));

fs.mkdirSync(ROOT, { recursive: true });
server.listen().then(() => console.log(`[ftp] listening on ${PORT}, passive ${PASV_URL}:${PASV_MIN}-${PASV_MAX}, relaying to ${APP_URL}`));
