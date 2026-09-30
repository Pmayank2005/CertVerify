const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
let total = 0;
const directories = ["frontend", "scripts"];
if (process.argv.includes("--include-tests")) {
  if (!fs.existsSync("test")) throw new Error("The optional local test/ directory is not available in this checkout.");
  directories.push("test");
}
for (const directory of directories) {
  for (const file of fs.readdirSync(directory, { recursive: true })) {
    if (!file.endsWith(".js") || file.includes("vendor")) continue;
    const result = spawnSync(process.execPath, ["--check", path.join(directory, file)], { encoding: "utf8", windowsHide: true });
    if (result.status !== 0) throw new Error(result.stderr || `Syntax check failed: ${file}`);
    total += 1;
  }
}
for (const file of ["hardhat.config.js"]) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || `Syntax check failed: ${file}`);
  total += 1;
}
for (const file of ["index.html", "src/app/app.component.html", "src/app/pages/overview.component.html", "src/app/pages/issuer.component.html", "src/app/pages/verifier.component.html"]) {
  const source = fs.readFileSync(path.join("frontend", file), "utf8");
  const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate HTML IDs: ${file}`);
  for (const [, asset] of source.matchAll(/(?:src|href)="([^"?#]+)(?:[?#][^"]*)?"/g)) {
    if (/^(https?:|data:|#|\/)/.test(asset)) continue;
    if (!fs.existsSync(path.join("frontend", asset))) throw new Error(`Missing local asset: ${asset}`);
  }
}
console.log(`${total} JavaScript files passed syntax checks; HTML IDs and local asset references passed.`);
