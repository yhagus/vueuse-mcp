import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import process from "node:process";
import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";

type DocsBlock = {
  kind: "description" | "demo" | "example" | "type-interface" | "prose" | "code";
  heading: string;
  content: string;
  code: string;
  searchText: string;
  order: number;
};

type PageEntry = {
  url: string;
  path: string;
  title: string;
  category: string;
  blocks: DocsBlock[];
};

const DATA_DIR = path.join(process.cwd(), "data");
const SITEMAP_PATH = path.join(process.cwd(), "sitemap.xml");
const DB_PATH = path.join(DATA_DIR, "vueuse-docs.sqlite");
const META_PATH = path.join(DATA_DIR, "vueuse-docs.meta.json");

function parseSitemapLocs(xml: string) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

function normalizePath(url: string) {
  const parsed = new URL(url);
  return parsed.pathname.replace(/\/+$/, "") || "/";
}

function isDocsHost(hostname: string) {
  return (
    hostname === "vueuse.org" ||
    hostname === "vueuse.pages.dev" ||
    hostname.endsWith(".vueuse.org")
  );
}

function shouldIncludeUrl(url: string) {
  const parsed = new URL(url);
  if (!isDocsHost(parsed.hostname)) {
    return false;
  }

  const pathName = normalizePath(url).toLowerCase();
  if (pathName.endsWith(".xml")) {
    return true;
  }

  if (pathName.includes("/sitemap")) {
    return false;
  }

  if (/\.(png|jpe?g|gif|webp|svg|ico|css|js|mjs|json|map|txt|woff2?|ttf|otf)$/i.test(pathName)) {
    return false;
  }

  return true;
}

function categoryFromPath(pathName: string) {
  if (pathName === "/") return "home";
  const segment = pathName.split("/").filter(Boolean)[0];
  return segment ?? "docs";
}

function cleanText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function cleanCode(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function extractTitleFromDocumentTitle(title: string) {
  const cleaned = cleanText(title);
  if (!cleaned) {
    return "";
  }

  return cleaned.split("|").map((part) => part.trim()).filter(Boolean)[0] ?? cleaned;
}

function getNodeClassList(node: AnyNode) {
  const attribs = (node as Element).attribs;
  return attribs?.class?.split(/\s+/).filter(Boolean) ?? [];
}

function hasAncestorWithClass(node: AnyNode, className: string) {
  let current: AnyNode | null | undefined = node.parent;

  while (current) {
    if (getNodeClassList(current).includes(className)) {
      return true;
    }
    current = current.parent;
  }

  return false;
}

function isTypeDeclarationsHeading(heading: string) {
  return heading.toLowerCase() === "type declarations";
}

function extractBlocks($: cheerio.CheerioAPI, container: cheerio.Cheerio<AnyNode>) {
  const blocks: DocsBlock[] = [];
  let currentHeading = "Overview";
  let proseLines: string[] = [];
  let order = 0;

  const flushProse = () => {
    const prose = cleanText(proseLines.join(" "));
    proseLines = [];

    if (!prose) {
      return;
    }

    blocks.push({
      kind: "prose",
      heading: currentHeading,
      content: prose,
      code: "",
      searchText: [currentHeading, prose].filter(Boolean).join("\n"),
      order: order++
    });
  };

  const pushCode = (code: string) => {
    const cleaned = cleanCode(code);
    if (!cleaned) {
      return;
    }

    blocks.push({
      kind: isTypeDeclarationsHeading(currentHeading) ? "type-interface" : "example",
      heading: currentHeading,
      content: cleaned,
      code: cleaned,
      searchText: [currentHeading, cleaned].filter(Boolean).join("\n"),
      order: order++
    });
  };

  const pushDemo = (element: Element) => {
    const demoText = cleanText($(element).text());
    if (!demoText) {
      return;
    }

    blocks.push({
      kind: "demo",
      heading: currentHeading,
      content: demoText,
      code: "",
      searchText: [currentHeading, demoText].filter(Boolean).join("\n"),
      order: order++
    });
  };

  container.find("h2,h3,h4,h5,h6,p,blockquote,pre,li,table,div.demo").each((_, element: Element) => {
    const tag = element.tagName?.toLowerCase();

    if (!tag) {
      return;
    }

    if (hasAncestorWithClass(element, "demo") && !getNodeClassList(element).includes("demo")) {
      return;
    }

    if (/^h[2-6]$/.test(tag)) {
      flushProse();
      currentHeading = cleanText($(element).text()) || currentHeading;
      return;
    }

    if (tag === "div" && getNodeClassList(element).includes("demo")) {
      flushProse();
      pushDemo(element);
      return;
    }

    if (tag === "pre") {
      flushProse();
      pushCode($(element).text());
      return;
    }

    const text = cleanText($(element).text());
    if (text) {
      proseLines.push(text);
    }
  });

  flushProse();
  return blocks;
}

function extractTitle($: cheerio.CheerioAPI) {
  const h1 = cleanText($("h1").first().text());
  const titleTag = extractTitleFromDocumentTitle($("title").first().text());
  const metaTitle =
    cleanText($('meta[property="og:title"]').attr("content") ?? "") ||
    cleanText($('meta[name="twitter:title"]').attr("content") ?? "");

  return h1 || titleTag || (metaTitle && metaTitle !== "VueUse" ? metaTitle : "") || "VueUse";
}

function extractDescription($: cheerio.CheerioAPI) {
  return cleanText(
    $('meta[property="og:description"]').attr("content") ??
      $('meta[name="description"]').attr("content") ??
      ""
  );
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "vueuse-mcp"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function collectDocsUrlsFromLocalSitemap() {
  if (!existsSync(SITEMAP_PATH)) {
    throw new Error(
      `Local sitemap not found at ${SITEMAP_PATH}. Put sitemap.xml in the repo root before running docs:refresh.`
    );
  }

  const xml = readFileSync(SITEMAP_PATH, "utf8");
  const docs = new Set<string>();

  for (const loc of parseSitemapLocs(xml)) {
    if (shouldIncludeUrl(loc)) {
      docs.add(loc);
    }
  }

  return [...docs].sort((a, b) => a.localeCompare(b));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
) {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function main() {
  console.log("Building VueUse docs index...");

  try {
    const urls = collectDocsUrlsFromLocalSitemap();

    if (urls.length === 0) {
      throw new Error(`No VueUse docs URLs were discovered from ${path.relative(process.cwd(), SITEMAP_PATH)}.`);
    }

    const pages = await mapWithConcurrency(urls, 8, async (url) => {
      const html = await fetchText(url);
      const $ = cheerio.load(html);
      const pathName = normalizePath(url);
      const title = extractTitle($);
      const description = extractDescription($);
      const category = categoryFromPath(pathName);
      const article = $("main article").first().length ? $("main article").first() : $("main").first();

      const blocks = extractBlocks($, article);
      if (description) {
        blocks.unshift({
          kind: "description",
          heading: title,
          content: description,
          code: "",
          searchText: [title, description].filter(Boolean).join("\n"),
          order: -1
        });
      }

      return {
        url,
        path: pathName,
        title,
        category,
        blocks
      } satisfies PageEntry;
    });

    mkdirSync(DATA_DIR, { recursive: true });
    rmSync(DB_PATH, { force: true });

    const db = new DatabaseSync(DB_PATH);
    db.exec(`
      PRAGMA journal_mode = OFF;
      PRAGMA synchronous = OFF;
      PRAGMA temp_store = MEMORY;
      DROP TABLE IF EXISTS docs_sections_fts;
      DROP TABLE IF EXISTS docs_sections_meta;
      CREATE VIRTUAL TABLE docs_sections_fts USING fts5(
        page_title,
        page_path UNINDEXED,
        category,
        heading,
        kind UNINDEXED,
        search_text,
        content UNINDEXED,
        code UNINDEXED,
        tokenize = 'unicode61 remove_diacritics 2'
      );
      CREATE TABLE docs_sections_meta (
        rowid INTEGER PRIMARY KEY AUTOINCREMENT,
        page_title TEXT NOT NULL,
        page_path TEXT NOT NULL,
        category TEXT NOT NULL,
        heading TEXT NOT NULL,
        kind TEXT NOT NULL,
        sort_order INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    const insert = db.prepare(
      "INSERT INTO docs_sections_fts (page_title, page_path, category, heading, kind, search_text, content, code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    const insertMeta = db.prepare(
      "INSERT INTO docs_sections_meta (page_title, page_path, category, heading, kind, sort_order) VALUES (?, ?, ?, ?, ?, ?)"
    );
    const meta = db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)");

    db.exec("BEGIN");
    try {
      for (const page of pages) {
        for (const block of page.blocks) {
          insert.run(
            page.title,
            page.path,
            page.category,
            block.heading,
            block.kind,
            block.searchText,
            block.content,
            block.code
          );
          insertMeta.run(
            page.title,
            page.path,
            page.category,
            block.heading,
            block.kind,
            block.order
          );
        }
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    const generatedAt = new Date().toISOString();
    const blockCount = pages.reduce((total, page) => total + page.blocks.length, 0);
    meta.run("source", path.relative(process.cwd(), SITEMAP_PATH));
    meta.run("generatedAt", generatedAt);
    meta.run("pageCount", String(pages.length));
    meta.run("blockCount", String(blockCount));
    meta.run("schemaVersion", "1");
    db.close();

    writeFileSync(
      META_PATH,
      JSON.stringify(
        {
          source: path.relative(process.cwd(), SITEMAP_PATH),
          generatedAt,
          pageCount: pages.length,
          blockCount,
          indexPath: path.relative(process.cwd(), DB_PATH)
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    console.log(`Indexed ${pages.length} VueUse pages at ${DB_PATH}`);
  } catch (error) {
    if (existsSync(DB_PATH)) {
      console.warn(`VueUse docs index refresh failed, keeping cached index at ${DB_PATH}.`);
      console.warn(error);
      return;
    }

    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
