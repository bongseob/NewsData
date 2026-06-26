import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "dotenv";

function findEnvPath(startDir: string): string | null {
  let currentDir = startDir;

  while (true) {
    const candidate = join(currentDir, ".env");
    if (existsSync(candidate)) {
      return candidate;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

const envPath = findEnvPath(process.cwd());
if (envPath) {
  config({ path: envPath });
}
