import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function emptyDir(dirPath) {
  async function removeRecursive(target) {
    try {
      const entries = await fs.readdir(target, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(target, entry.name);
        if (entry.isDirectory()) {
          await removeRecursive(fullPath);
          await fs.rmdir(fullPath).catch(() => {});
        } else {
          await fs.unlink(fullPath).catch(() => {});
        }
      }
    } catch (err) {
      if (err?.code === "ENOENT") return;
      throw err;
    }
    await fs.rmdir(target).catch(() => {});
  }

  await removeRecursive(dirPath);
  await fs.mkdir(dirPath, { recursive: true });
}

export async function readText(filePath) {
  return await fs.readFile(filePath, "utf8");
}

export async function writeText(filePath, contents) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, contents, "utf8");
}

export async function writeBytes(filePath, bytes) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, bytes);
}

export async function copyDir(srcDir, destDir) {
  await ensureDir(destDir);
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) await copyDir(src, dest);
    else if (entry.isFile()) await fs.copyFile(src, dest);
  }
}

export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function listFilesRecursive(rootDir, { filter } = {}) {
  const results = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      else if (entry.isFile()) {
        if (!filter || filter(fullPath)) results.push(fullPath);
      }
    }
  }
  await walk(rootDir);
  return results;
}
