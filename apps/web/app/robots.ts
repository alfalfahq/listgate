import type { MetadataRoute } from "next";
import { config } from "@/lib/config";

// listgate.com.au.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/account", "/api", "/preview", "/auth", "/join", "/r/"] }],
    sitemap: `https://${config.rootDomain}/sitemap.xml`,
  };
}
