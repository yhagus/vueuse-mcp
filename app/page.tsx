import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { buildTimestamp } from "../src/build-info";

function readMeta() {
  const metaPath = path.join(process.cwd(), "data", "vueuse-docs.meta.json");
  if (!existsSync(metaPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(metaPath, "utf8")) as {
      generatedAt?: string;
      pageCount?: number;
      blockCount?: number;
    };
  } catch {
    return null;
  }
}

export default function HomePage() {
  const meta = readMeta();

  return (
    <main className="shell">
      <section className="hero">
        <p className="kicker">VueUse MCP</p>
        <h1>search_docs for VueUse, with page content indexed locally.</h1>
        <p className="lede">
          This server exposes a single MCP tool. It searches a local SQLite snapshot
          built from VueUse docs pages, including section text, warnings, demo copy,
          usage snippets, and type declarations.
        </p>
        <div className="meta">
          <span className="pill">MCP endpoint: <code>/api/mcp</code></span>
          <span className="pill">Built at: <code>{buildTimestamp}</code></span>
          <span className="pill">
            Snapshot: <code>{meta ? "present" : "missing"}</code>
          </span>
        </div>
      </section>
      <section className="grid">
        <article className="card">
          <h2>Tool</h2>
          <p><code>search_docs</code></p>
          <p>Searches the VueUse docs snapshot.</p>
        </article>
        <article className="card">
          <h2>Refresh flow</h2>
          <p>Run <code>npm run docs:refresh</code>, inspect the SQLite snapshot, then commit it.</p>
        </article>
        <article className="card">
          <h2>Included content</h2>
          <p>Descriptions, warnings, demos, usage, type declarations, and code examples are indexed as blocks.</p>
        </article>
        <article className="card">
          <h2>Local testing</h2>
          <p>Use <code>npm run start</code> after the snapshot exists.</p>
        </article>
      </section>
    </main>
  );
}
