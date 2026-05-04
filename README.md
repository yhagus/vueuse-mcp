# vueuse-mcp

MCP server for VueUse docs search.

## Setup

1. Refresh the docs snapshot locally:

```bash
npm run docs:refresh
```

This uses the checked-in `sitemap.xml` in the repo root to discover docs pages.

2. Build the app:

```bash
npm run build
```

3. Start the production server:

```bash
npm run start
```

The MCP endpoint is:

```text
http://localhost:3000/api/mcp
```

## OpenCode

Use a remote MCP config like this:

```json
{
  "mcpServers": {
    "vueuse-mcp": {
      "type": "remote",
      "url": "http://localhost:3000/api/mcp",
      "enabled": true
    }
  }
}
```
