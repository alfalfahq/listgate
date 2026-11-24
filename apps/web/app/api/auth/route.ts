import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { agencyMembers, createLoginToken, getDb, hashToken, loginLink, loginTokens, sessions, users, fullName } from "@listgate/db";
import { audit } from "@/lib/audit";
import {
  createSession,
  currentUser,
  destroySession,
  handle,
  hashPassword,
  HttpError,
  isEmail,
  isPlatformAdmin,
  normaliseEmail,
  passwordProblem,
  requireUser,
  SESSION_COOKIE,
  verifyPassword,
} from "@/lib/auth";
import { brandedHtml, emailEnabled, sendEmail } from "@/lib/email";

export const runtime = "nodejs";

async function userByEmail(email: string) {
  const db = await getDb();
  const [u] = await db.select().from(users).where(sql`lower(${users.email}) = ${normaliseEmail(email)}`).limit(1);
  return u;
}

export const POST = handle(async (req: Request) => {
  const body = await req.json();
  const db = await getDb();
  switch (body.action) {
    case "login": {
      const email = String(body.email || "");
      const u = isEmail(email) ? await userByEmail(email) : undefined;
      if (!u || !(await verifyPassword(String(body.password || ""), u.passwordHash))) {
        await new Promise((r) => setTimeout(r, 500));
        throw new HttpError(401, "That email and password don't match. First time? Email yourself a sign-in link instead.");
      }
      await createSession(u.id);
      return Response.json({ ok: true, admin: isPlatformAdmin(u) });
    }
    case "emailLink": {
      const email = String(body.email || "");
      if (!isEmail(email)) throw new HttpError(400, "Enter your email address.");
      if (!emailEnabled()) throw new HttpError(400, "Email sign-in links aren't switched on yet. Sign in with your password.");
      const u = await userByEmail(email);
      if (u) {
        const raw = await createLoginToken(db, { purpose: "login", email: u.email, userId: u.id });
        const link = loginLink(raw);
        await sendEmail({
          to: u.email,
          subject: "Your Listgate sign-in link",
          text: `Hi ${u.firstName || u.name.split(" ")[0]},\n\nSign in to Listgate with this link. It works once and expires in an hour:\n\n${link}\n\nIf you didn't ask for this, you can ignore it.`,
          html: brandedHtml({
            preheader: "Your sign-in link (works once, expires in an hour)",
            heading: "Sign in to Listgate",
            paragraphs: [`Hi ${u.firstName || u.name.split(" ")[0]},`, "Use the button below to sign in. It works once and expires in an hour."],
            button: { label: "Sign in", url: link },
            footer: "If you didn't ask for this, you can ignore it.",
          }),
        });
      }
      return Response.json({ ok: true, message: "If that email has a Listgate account, a sign-in link is on its way." });
    }
    case "logout":
      await destroySession();
      return Response.json({ ok: true });
    case "acceptInvite": {
      const [t] = await db
        .select()
        .from(loginTokens)
        .where(and(eq(loginTokens.tokenHash, hashToken(String(body.token || ""))), eq(loginTokens.purpose, "invite"), isNull(loginTokens.usedAt), gt(loginTokens.expiresAt, new Date())));
      if (!t || !t.email || !t.agencyId) throw new HttpError(400, "This invite link has already been used or has expired. Ask for a new one.");
      const existing = await userByEmail(t.email);
      if (existing?.passwordHash) throw new HttpError(400, "This email already has a Listgate login. Sign in first, then open the invite again.");
      const pw = String(body.password || "");
      const problem = passwordProblem(pw);
      if (problem) throw new HttpError(400, problem);
      const firstName = String(body.firstName || "").trim().slice(0, 60);
      const lastName = String(body.lastName || "").trim().slice(0, 60);
      const name = fullName(firstName, lastName) || String(body.name || "").trim() || t.email.split("@")[0];
      const hash = await hashPassword(pw);
      const who = { name, firstName: firstName || null, lastName: lastName || null };
      const userId = existing
        ? (await db.update(users).set({ passwordHash: hash, ...who }).where(eq(users.id, existing.id)).returning({ id: users.id }))[0].id
        : (await db.insert(users).values({ email: t.email, passwordHash: hash, ...who }).returning({ id: users.id }))[0].id;
      await db.insert(agencyMembers).values({ agencyId: t.agencyId, userId, role: t.agencyRole ?? "owner" }).onConflictDoNothing();
      await db.update(loginTokens).set({ usedAt: new Date() }).where(eq(loginTokens.id, t.id));
      await createSession(userId);
      await audit({ actor: { id: userId, name }, action: "invite.accepted", entityType: "agency", entityId: t.agencyId, agencyId: t.agencyId });
      return Response.json({ ok: true });
    }
    case "setPassword": {
      const me = await requireUser({ write: true });
      const pw = String(body.password || "");
      const problem = passwordProblem(pw);
      if (problem) throw new HttpError(400, problem);
      // Changing an existing password needs the current one, unless they signed in within the last
      // 15 minutes (e.g. from an emailed sign-in link because they forgot it).
      const [u] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, me.id));
      const fresh = Date.now() - me.signedInAt.getTime() < 15 * 60_000;
      if (u?.hash && !fresh && !(await verifyPassword(String(body.currentPassword || ""), u.hash))) {
        await new Promise((r) => setTimeout(r, 500));
        throw new HttpError(400, "Your current password isn't right. Forgotten it? Sign out, email yourself a sign-in link, then set a new one.");
      }
      await db.update(users).set({ passwordHash: await hashPassword(pw) }).where(eq(users.id, me.id));
      await db.delete(sessions).where(and(eq(sessions.userId, me.id), ne(sessions.tokenHash, hashToken((await cookies()).get(SESSION_COOKIE)?.value ?? ""))));
      return Response.json({ ok: true, message: "Password saved." });
    }
    case "updateDetails": {
      const me = await requireUser({ write: true });
      const firstName = String(body.firstName || "").trim().slice(0, 60);
      const lastName = String(body.lastName || "").trim().slice(0, 60);
      const phone = String(body.phone || "").replace(/[^\d+ ()-]/g, "").trim().slice(0, 30);
      if (!firstName) throw new HttpError(400, "Add your first name.");
      await db.update(users).set({ firstName, lastName: lastName || null, name: fullName(firstName, lastName), phone: phone || null }).where(eq(users.id, me.id));
      return Response.json({ ok: true, message: "Saved." });
    }
    case "me":
      return Response.json({ user: await currentUser() });
  }
  throw new HttpError(400, "Unknown action.");
});
