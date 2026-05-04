import { writeFile } from "node:fs/promises";
import path from "node:path";

const builtAt = new Date().toISOString();
const outputPath = path.join(process.cwd(), "src", "build-info.ts");
const content = `export const buildTimestamp = ${JSON.stringify(builtAt)} as const;
`;

await writeFile(outputPath, content, "utf8");
