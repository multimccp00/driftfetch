import { site, u } from "../data/site";

export const GET = () => new Response(`User-agent: *\nAllow: /\n\nSitemap: ${site.url}${u("/sitemap.xml")}\n`);
