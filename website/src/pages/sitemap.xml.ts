import { site } from "../data/site";
import { u } from "../data/site";

const paths = ["/", "/download", "/sites", "/youtube", "/reddit", "/vimeo", "/extensions", "/about", "/faq", "/privacy", "/donate", "/legal"];

export const GET = () =>
  new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((p) => `  <url><loc>${site.url}${u(p)}</loc></url>`).join("\n")}\n</urlset>\n`,
    { headers: { "content-type": "application/xml" } },
  );
