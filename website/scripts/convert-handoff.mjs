// One-off: converts the design handoff's prototype pages (.dc.html) into Astro pages.
// Usage: node scripts/convert-handoff.mjs <pagesDir>
// Kept in the repo so the conversion can be re-run if the design is updated.
import fs from "node:fs";
import path from "node:path";

const pagesDir = path.resolve(process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "design-handoff/pages");
const outDir = path.resolve("src/pages");
const iconDir = path.resolve("node_modules/lucide-static/icons");

const SLUG = {
  "Home.dc.html": "/",
  "Download.dc.html": "/download",
  "Sites.dc.html": "/sites",
  "Sites - YouTube.dc.html": "/youtube",
  "Sites - Reddit.dc.html": "/reddit",
  "Sites - Vimeo.dc.html": "/vimeo",
  "FAQ.dc.html": "/faq",
  "Privacy.dc.html": "/privacy",
  "Donate.dc.html": "/donate",
  "Legal.dc.html": "/legal",
};
const FILES = Object.keys(SLUG);

// href="#" placeholders become config links, keyed by the link text.
const PLACEHOLDER = [
  [/Release notes|Checksums/i, "links.releaseNotes"],
  [/Source code/i, "links.source"],
  [/Report a problem/i, "links.issues"],
  [/Star it on GitHub/i, "links.source"],
  [/Help translate/i, "links.issues"],
  [/Installer \(\.exe\)|Download for Windows/i, "links.installer"],
  [/Portable \(\.zip\)/i, "links.portable"],
  [/All releases/i, "links.releases"],
];


const HOME_IMPORTS = `import Demo from "../components/Demo.astro";
import { Icon } from "../components/icon";
import { SAMPLES, STATES, FAQ, shareLinks } from "../data/home";
`;
const HOME_FRONT = `const chips = SAMPLES;
const states = STATES;
const faq = FAQ;
const shares = shareLinks(site.url);
`;

// Home is dynamic in the reference. This swaps the runtime bits for hooks the client script
// (src/scripts/home.ts) and Demo.astro fill in. Run once to scaffold; index.astro is hand-maintained after.
function homePatch(b) {
  const cut = (startMarker, endMarker, repl) => {
    const i = b.indexOf(startMarker), j = b.indexOf(endMarker, i);
    if (i < 0 || j < 0) throw new Error("home patch marker missing: " + startMarker);
    b = b.slice(0, i) + repl + b.slice(j + endMarker.length);
  };
  // demo window -> component
  cut('<div style="min-width:0;order:{{ demoOrder }}">', "</section>", '<div style="min-width:0"><Demo /></div>\n        </div>\n      </section>');
  // hero hint / confirmation
  b = b.replace(/<sc-if value="\{\{ notPicked \}\}"[^>]*>/, '<div id="hero-hint">').replace(/<sc-if value="\{\{ picked \}\}"[^>]*>/, '<div id="hero-picked" hidden>');
  b = b.replace(/<\/sc-if>/g, "</div>");
  b = b.replace(/<section id="/g, '<section data-tide="1" id="');
  // app screenshot
  cut('<div ref="{{ appRef }}"', "</dc-import>\n          </div>\n        </div>",
    "@@APP@@");
  // footer lives in the layout
  cut("<footer ", "</footer>", "");
  b = b.replace(/\s+ref="\{\{ \w+ \}\}"/g, "");
  b = b.replace(/<div ref="\{\{ jRef \}\}"/, "<div");
  b = b.replace(/padding-right:\{\{ padR \}\};padding-left:\{\{ padL \}\}/g, "padding-right:var(--padr)");
  b = b.replace("grid-template-columns:{{ tryCols }}", "grid-template-columns:var(--trycols)");
  b = b.replace(/<button onClick="\{\{ heroCopy \}\}"/, '<button id="hero-link" data-url="https://youtube.com/watch?v=aBcD123"');
  b = b.replace(/<button onClick="\{\{ copyShare \}\}"([^>]*)><dc-import[^>]*><\/dc-import>\{\{ shareLabel \}\}<\/button>/,
    '<button id="share-copy"$1><span data-icon-slot><dc-import name="Icon" n="link" size="16" stroke="2"></dc-import></span><span data-label>Copy link</span></button>');
  b = b.replace("<sc-for list=\"{{ shares }}\" as=\"s\"", "<sc-for list=\"{{ shares }}\" as=\"s\"");
  return b;
}

const hover = new Map(); // declarations -> class name (hash, so names stay stable across runs)
const hoverClass = (decl) => {
  if (!hover.has(decl)) {
    let h = 5381;
    for (const c of decl) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
    hover.set(decl, "h" + h.toString(36));
  }
  return hover.get(decl);
};
const missingIcons = new Set();

// Lucide dropped brand icons; GitHub mark (Octicons, MIT).
const GITHUB = "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z";
function icon(name, size, stroke) {
  if (name === "github") return `<span class="ic"><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="${GITHUB}"/></svg></span>`;
  const file = path.join(iconDir, name + ".svg");
  if (!fs.existsSync(file)) {
    missingIcons.add(name);
    return `<span class="ic" style="width:${size}px;height:${size}px"></span>`;
  }
  const inner = fs.readFileSync(file, "utf8").replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>[\s\S]*$/, "").trim();
  return `<span class="ic"><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg></span>`;
}

const route = (file) => {
  const f = decodeURIComponent(file);
  return SLUG[f] ?? null;
};

function convert(file) {
  const src = fs.readFileSync(path.join(pagesDir, file), "utf8");
  const slug = SLUG[file];

  // --- head ---
  const helmet = src.match(/<helmet>([\s\S]*?)<\/helmet>/)[1];
  const title = helmet.match(/<title>([\s\S]*?)<\/title>/)[1];
  const description = helmet.match(/<meta name="description" content="([^"]*)"/)[1];
  const ld = [...helmet.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.parse(m[1]).mainEntity !== undefined || true ? JSON.parse(m[1]) : null,
  );

  // --- current nav item ---
  const headerHtml = src.match(/<header[\s\S]*?<\/header>/)[0];
  const cur = headerHtml.match(/<a href="([^"]*)"[^>]*aria-current="page"/);
  const current = cur ? route(cur[1]) : null;

  // --- main body ---
  const mainM = src.match(/<main([^>]*)>([\s\S]*?)<\/main>/);
  let body = mainM[2];
  // Legal: <main> itself carries the paper background; Layout owns <main>, so wrap in a full-width tide band.
  if (file === "Home.dc.html") body = homePatch(body);
  if (mainM[1].replace(/\s*id="main"\s*/, "").trim()) {
    const st = mainM[1].match(/style="([^"]*)"/)[1];
    const inner = st.replace(/background:[^;]+;?/, "");
    body = `<div data-tide="1" style="background:#f3f5fa"><div style="${inner}">${body}</div></div>`;
  }

  // loops (Legal) -> arrays from the page script
  const loops = [...body.matchAll(/<sc-for list="\{\{ (\w+) \}\}" as="(\w+)"[^>]*>([\s\S]*?)<\/sc-for>/g)];
  let frontData = "";
  if (file === "Home.dc.html") frontData = HOME_FRONT;
  else if (loops.length) {
    const script = src.slice(src.indexOf("data-dc-script"));
    const lit = script.match(/return (\{[\s\S]*?\n    \});/)[1];
    const data = new Function("return " + lit)();
    for (const [, name] of loops) frontData += `const ${name} = ${JSON.stringify(data[name], null, 2)};\n`;
  }

  // escape literal braces before inserting any expressions
  body = body.replace(/\{\{/g, "\u0001").replace(/\}\}/g, "\u0002");
  body = body.replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");

  for (const [, name, v, inner] of loops) {
    const orig = inner;
    const esc = orig.replace(/\{\{/g, "\u0001").replace(/\}\}/g, "\u0002").replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");
    const tpl = esc
      .replace(/<dc-import name="Icon" n="\u0001 ([\w.]+) \u0002" size="([\d.]+)"[^>]*><\/dc-import>/g, (_, e, sz) => `<Fragment set:html={Icon(${e}, ${sz})} />`)
      .replace(/ onClick="\u0001 [^\u0002]+ \u0002"/g, " data-chip data-url={c.url}")
      .replace(/(\w+)="([^"]*\u0001[^"]*)"/g, (m, a, v) => {
        const whole = v.match(/^\u0001 ([\w.]+) \u0002$/);
        if (whole) return `${a}={${whole[1]}}`;
        return `${a}={\`${v.replace(/\u0001 ([\w.]+) \u0002/g, "${$1}")}\`}`;
      })
      .replace(/\u0001 ([\w.]+) \u0002/g, "{$1}");
    const block = body.match(new RegExp(`<sc-for list="\\u0001 ${name} \\u0002"[^>]*>[\\s\\S]*?</sc-for>`))[0];
    body = body.replace(block, `{${name}.map((${v}) => (<>${tpl}</>))}`);
  }

  // icons
  body = body.replace(
    /<dc-import name="Icon" n="([^"]+)"(?: size="([\d.]+)")?(?: stroke="([\d.]+)")?[^>]*><\/dc-import>/g,
    (_, n, size, stroke) => icon(n, size ?? 16, stroke ?? 1.75),
  );

  // hover styles
  body = body.replace(/ style-hover="([^"]*)"/g, (_, d) => ` class="${hoverClass(d)}"`);

  // placeholder links by text
  body = body.replace(/<a href="#"([^>]*)>([\s\S]*?)<\/a>/g, (m, attrs, inner) => {
    const text = inner.replace(/<[^>]*>/g, "");
    const hit = PLACEHOLDER.find(([re]) => re.test(text));
    return hit ? `<a href={${hit[1]}}${attrs}>${inner}</a>` : m;
  });

  // internal links + assets
  body = body.replace(/href="([^"#]*\.dc\.html)(#[^"]*)?"/g, (m, f, hash) => {
    const r = route(f);
    return r ? `href={u("${r}${hash ?? ""}")}` : m;
  });
  body = body.replace(/(src|href)="assets\/driftfetch-icon\.png"/g, '$1={u("/driftfetch-icon.png")}');

  // version + remaining config
  body = body.replace(/'Schibsted Grotesk'/g, "'Schibsted Grotesk Variable'");
  body = body.replace(/0\.2\.1/g, "{site.version}");
  body = body.replace(/https:\/\/buymeacoffee\.com\/\[your-name\]/g, "{links.donate}");
  body = body.replace(/href="\{links\.donate\}"/g, "href={links.donate}");

  // cleanups
  body = body.replace(/<x-import[^>]*><\/x-import>/g, "").replace(/ hint-[a-z-]+="[^"]*"/g, "");
  body = body.replace(/\u0001/g, "{{").replace(/\u0002/g, "}}");

  body = body.replace("@@APP@@", '<img src={u("/app.png")} width="1380" height="880" loading="lazy" alt="The DriftFetch window: one list of downloads with filters, a details panel and settings." style="display:block;width:100%;height:auto;aspect-ratio:1380/880;border-radius:10px;background:#0b0e17;box-shadow:0 0 0 1px rgba(1,9,48,0.3),0 40px 80px -30px rgba(1,9,48,0.65)">');
  const ldLit = JSON.stringify(ld).replace(/0\.2\.1/g, "__VERSION__");
  const out = `---
import Layout from "../layouts/Layout.astro";
import { u, site, links } from "../data/site";
${file === "Home.dc.html" ? HOME_IMPORTS : ""}${frontData}---
<Layout
  title=${JSON.stringify(title)}
  description=${JSON.stringify(description)}
  path="${slug}"
  current=${JSON.stringify(current)}
  jsonld={${ldLit}}
>
${body}
${file === "Home.dc.html" ? '<script>import "../scripts/home";</script>' : ""}
</Layout>
`;
  const name = (slug === "/" ? "index" : slug.slice(1)) + ".astro";
  if (file === "Home.dc.html" && !process.argv.includes("--home")) return console.log("skipped index.astro (hand-maintained; pass --home to regenerate)");
  fs.writeFileSync(path.join(outDir, name), out);
  console.log("wrote", name, "current=" + current);
}

fs.mkdirSync(outDir, { recursive: true });
for (const f of FILES) convert(f);
fs.writeFileSync(
  path.resolve("src/styles/hover.css"),
  "/* generated by scripts/convert-handoff.mjs: hover states lifted out of inline styles */\n" +
    [...hover].map(([d, c]) => `.${c}:hover{${d.replace(/;?$/, "")} !important}`).join("\n") + "\n",
);
if (missingIcons.size) console.log("MISSING ICONS:", [...missingIcons].join(", "));
