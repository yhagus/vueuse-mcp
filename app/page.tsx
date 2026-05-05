import { buildTimestamp } from "../src/build-info";

export default function HomePage() {
  return (
    <main>
      <h1>VueUse MCP</h1>
      <p>Available tools:</p>
      <ul>
        <li>
          <code>search_docs</code> - Search VueUse documentation.
        </li>
      </ul>
      <p>
        Built at: <time dateTime={buildTimestamp}>{buildTimestamp}</time>
      </p>
      <p>MCP endpoint: <code>/api/mcp</code></p>
    </main>
  );
}
