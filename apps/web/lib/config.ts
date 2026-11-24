/** All tunables in one place. Values come from environment variables (see .env.example). */
export const config = {
  rootDomain: process.env.ROOT_DOMAIN || "listgate.com.au",
  appUrl: (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  adminUrl: (process.env.ADMIN_URL || "http://localhost:3001").replace(/\/$/, ""),
  /** Where the FTP receiver listens, shown to agencies whose CRM can only send REAXML by FTP. */
  ftpHost: process.env.FTP_HOST || "ftp.listgate.com.au",
  /** Shared secret the FTP receiver uses to post files in (X-Listgate-Ftp-Key). */
  ftpRelayKey: process.env.FTP_RELAY_KEY || "",
  /** Largest feed file accepted, in MB. Full-office REAXML files are usually under 5 MB. */
  maxFeedMb: Number(process.env.MAX_FEED_MB || 25),
  /** Partner pushes: how often the in-process worker looks for due deliveries. 0 turns it off. */
  deliverEverySeconds: Number(process.env.DELIVER_EVERY_SECONDS ?? 15),
  contactEmail: process.env.CONTACT_EMAIL || "hello@listgate.com.au",
};

export const feedUrl = (token: string) => `${config.appUrl}/api/feeds/reaxml/${encodeURIComponent(token)}`;
