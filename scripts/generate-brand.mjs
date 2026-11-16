// Generate the code-owned vector mark and fresh native/web assets.
// npm run brand:generate; no network, customer assets or image service required.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";

const root = fileURLToPath(new URL("../", import.meta.url));
const mark = JSON.parse(readFileSync(path.join(root, "assets/brand/symbol.json"), "utf8"));
function symbol(color, background, inset = false) {
  const bg = background ? `<rect width="128" height="128" fill="${background}"/>` : "";
  const transform = inset ? ' transform="translate(15.36 15.36) scale(.76)"' : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 128 128">${bg}<g fill="${color}"${transform}>${mark.paths.map(d => `<path d="${d}"/>`).join("")}</g></svg>`;
}
function render(relative, svg, width) {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, relative.endsWith(".svg") ? svg : new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng());
}
render("assets/brand/crewgrain-symbol.svg", symbol(mark.ink), 1024);
render("assets/brand/crewgrain-symbol-light.svg", symbol(mark.paper), 1024);
render("assets/crewgrain-icon.svg", symbol(mark.paper, mark.ink, true), 1024);
render("assets/crewgrain-icon.png", symbol(mark.paper, mark.ink, true), 1024);
render("assets/crewgrain-mark.png", symbol(mark.paper, undefined, true), 1024);
render("assets/crewgrain-monochrome.png", symbol("#000", undefined, true), 1024);
render("assets/crewgrain-splash.png", symbol(mark.ink), 1024);
render("assets/crewgrain-favicon.png", symbol(mark.paper, mark.ink, true), 64);
render("public/favicon.svg", symbol(mark.paper, mark.ink, true), 64);
for (const size of [192, 512]) render(`public/icons/crewgrain-${size}.png`, symbol(mark.paper, mark.ink, true), size);
// Wordmark uses SVG text so downstream operators can replace it without a design tool.
const lockup = `<svg xmlns="http://www.w3.org/2000/svg" width="880" height="176" viewBox="0 0 880 176"><rect width="880" height="176" fill="white"/><g transform="translate(24 16)" fill="${mark.ink}">${mark.paths.map(d=>`<path d="${d}"/>`).join("")}</g><text x="176" y="95" font-family="sans-serif" font-size="72" font-weight="700" fill="${mark.ink}">Crewgrain</text><text x="180" y="132" font-family="sans-serif" font-size="22" fill="#667080">Work &amp; production</text></svg>`;
render("assets/brand/crewgrain-lockup.svg", lockup, 880);
render("assets/brand/crewgrain-lockup.png", lockup, 880);
console.log("Generated Crewgrain vector and native/web assets.");
