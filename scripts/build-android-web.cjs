const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "www");
const copiedExtensions = new Set([".html", ".js", ".css", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".ico", ".json"]);
const excludedNames = new Set(["android", "node_modules", "scripts", "www", ".git"]);

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (excludedNames.has(entry.name) || !entry.isFile()) continue;
  const extension = path.extname(entry.name).toLowerCase();
  if (
    !copiedExtensions.has(extension) ||
    entry.name === "capacitor.config.json" ||
    entry.name === "package.json" ||
    entry.name === "package-lock.json"
  ) continue;

  const source = path.join(root, entry.name);
  const destination = path.join(output, entry.name);
  if (extension === ".html") {
    const html = fs.readFileSync(source, "utf8");
    const bridgeTag = '  <script src="android-bridge.js"></script>\n';
    fs.writeFileSync(destination, html.replace(/<\/body>/i, `${bridgeTag}</body>`));
  } else {
    fs.copyFileSync(source, destination);
  }
}

fs.copyFileSync(path.join(__dirname, "android-bridge.js"), path.join(output, "android-bridge.js"));
console.log(`Android web bundle created at ${output}`);
