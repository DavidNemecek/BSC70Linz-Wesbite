import path from "node:path";

export const repoRoot = path.resolve(process.cwd());

export const paths = {
  assetsDir: path.join(repoRoot, "assets"),
  contentDir: path.join(repoRoot, "content"),
  docsDir: path.join(repoRoot, "docs"),
  scriptsDir: path.join(repoRoot, "scripts"),
  srcDir: path.join(repoRoot, "src"),
  templatesDir: path.join(repoRoot, "src", "templates"),
};

