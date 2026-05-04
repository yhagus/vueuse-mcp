import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "vueuse-docs.sqlite");

export type VueUseDocSearchResult = {
  pageTitle: string;
  path: string;
  category: string;
  heading?: string;
  kind?: string;
  snippet: string;
  code?: string;
  score: number;
};

export type VueUseDocSearchOptions = {
  category?: string;
  limit?: number;
};

type VueUseDocSearchState =
  | {
      ok: true;
      dbPath: string;
      results: VueUseDocSearchResult[];
    }
  | {
      ok: false;
      dbPath: string;
      error: string;
    };

let cachedDb: DatabaseSync | null = null;

export function getVueUseDocsDbPath() {
  return DEFAULT_DB_PATH;
}

function getDb() {
  if (cachedDb) {
    return cachedDb;
  }

  if (!existsSync(DEFAULT_DB_PATH)) {
    return null;
  }

  cachedDb = new DatabaseSync(DEFAULT_DB_PATH, {
    readOnly: true,
    timeout: 5_000
  });

  return cachedDb;
}

function hasTable(db: DatabaseSync, tableName: string) {
  return (
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName) !== undefined
  );
}

function normalizeRows(rows: Array<Record<string, unknown>>): VueUseDocSearchResult[] {
  return rows.map((row) => ({
    pageTitle: String(row.pageTitle ?? row.title ?? ""),
    path: String(row.path ?? row.page_path ?? ""),
    category: String(row.category ?? ""),
    heading: row.heading ? String(row.heading) : undefined,
    kind: row.kind ? String(row.kind) : undefined,
    snippet: String(row.snippet ?? ""),
    code: row.code ? String(row.code) : undefined,
    score: typeof row.score === "number" ? row.score : Number(row.score ?? 0)
  }));
}

function normalizeFtsQuery(query: string) {
  const tokens = query.toLowerCase().match(/[a-z0-9_-]+/g)?.filter(Boolean) ?? [];
  if (tokens.length === 0) return query.trim();
  return tokens.map((token) => `${token}*`).join(" AND ");
}

export function searchVueUseDocs(
  query: string,
  options: VueUseDocSearchOptions = {}
): VueUseDocSearchState {
  const dbPath = getVueUseDocsDbPath();
  const db = getDb();

  if (!db) {
    return {
      ok: false,
      dbPath,
      error:
        "VueUse docs index not found. Run `npm run docs:refresh` locally, then commit `data/vueuse-docs.sqlite` and `data/vueuse-docs.meta.json`."
    };
  }

  const searchQuery = normalizeFtsQuery(query);
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 20);
  const useStructuredIndex = hasTable(db, "docs_sections_fts");

  const rows: VueUseDocSearchResult[] = useStructuredIndex
    ? normalizeRows(
        db
          .prepare(
            [
              "SELECT page_title AS pageTitle, page_path AS path, category, heading, kind,",
              "snippet(docs_sections_fts, 5, '[', ']', '…', 16) AS snippet,",
              "code, bm25(docs_sections_fts) AS score",
              "FROM docs_sections_fts",
              "WHERE docs_sections_fts MATCH ?",
              options.category ? "AND lower(category) = lower(?)" : "",
              "ORDER BY score ASC",
              "LIMIT ?"
            ]
              .filter(Boolean)
              .join(" ")
          )
          .all(...(options.category ? [searchQuery, options.category, limit] : [searchQuery, limit])) as Array<
          Record<string, unknown>
        >
      )
    : normalizeRows(
        db
          .prepare(
            [
              "SELECT title AS pageTitle, path, category,",
              "snippet(docs_fts, 3, '[', ']', '…', 16) AS snippet,",
              "bm25(docs_fts) AS score",
              "FROM docs_fts",
              "WHERE docs_fts MATCH ?",
              options.category ? "AND lower(category) = lower(?)" : "",
              "ORDER BY score ASC",
              "LIMIT ?"
            ]
              .filter(Boolean)
              .join(" ")
          )
          .all(...(options.category ? [searchQuery, options.category, limit] : [searchQuery, limit])) as Array<
          Record<string, unknown>
        >
      );

  return {
    ok: true,
    dbPath,
    results: rows
  };
}

export function formatVueUseDocsSearch(query: string, state: VueUseDocSearchState) {
  if (!state.ok) {
    return [
      `Search VueUse docs for: ${query}.`,
      state.error,
      `Expected local index at: ${state.dbPath}.`
    ].join(" ");
  }

  if (state.results.length === 0) {
    return `Search VueUse docs for: ${query}. No local matches found.`;
  }

  const lines = [`Search VueUse docs for: ${query}.`];

  state.results.forEach((result, index) => {
    const label = result.heading ? `${result.pageTitle} / ${result.heading}` : result.pageTitle;
    const kindLabel = result.kind ? ` [${result.kind}]` : "";

    lines.push(`${index + 1}. ${label}${kindLabel} (${result.path})`);
    lines.push(`   Category: ${result.category}`);
    lines.push(`   ${result.snippet}`);
    if (result.code) {
      lines.push(`   Code: ${result.code.slice(0, 180)}`);
    }
  });

  return lines.join("\n");
}
