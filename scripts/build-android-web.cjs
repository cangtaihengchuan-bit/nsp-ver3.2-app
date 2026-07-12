const fs = require("node:fs");
const path = require("node:path");
const { transformAndroidHtml } = require("./android-html-transform.cjs");

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
    const html = fs.readFileSync(source, "utf8").replace(/\r\n/g, "\n");
    fs.writeFileSync(destination, transformAndroidHtml(entry.name, html));
  } else {
    fs.copyFileSync(source, destination);
  }
}

fs.copyFileSync(path.join(__dirname, "android-bridge.js"), path.join(output, "android-bridge.js"));
fs.copyFileSync(path.join(__dirname, "android-local-mode.js"), path.join(output, "android-local-mode.js"));
fs.copyFileSync(path.join(__dirname, "android-home-illustration.svg"), path.join(output, "android-home-illustration.svg"));
for (const [sourceName, outputName] of [
  ["shopping-bag.svg", "android-icon-shopping.svg"],
  ["tag.svg", "android-icon-discount.svg"],
  ["wallet-cards.svg", "android-icon-household.svg"],
]) {
  fs.copyFileSync(
    path.join(root, "node_modules", "lucide-static", "icons", sourceName),
    path.join(output, outputName),
  );
}
console.log(`Android web bundle created at ${output}`);
