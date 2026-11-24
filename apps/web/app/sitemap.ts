import type { MetadataRoute } from "next";
import { config } from "@/lib/config";
import { helpPages } from "@/lib/help";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = `https://${config.rootDomain}`;
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/help`, changeFrequency: "weekly", priority: 0.6 },
    ...(await helpPages().catch(() => [])).map((p) => ({ url: `${base}/help/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "monthly" as const, priority: 0.5 })),
  ];
}
