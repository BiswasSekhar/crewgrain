// A narrow source-template guard, not a substitute for a dedicated secret audit.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const findings = [];
for (const file of files) {
  if ((/(^|\/)\.env(?:\.|$)/.test(file) && file !== ".env.example") || /(^|\/)(private|secrets|node_modules|outputs)\//.test(file) || /\.(p12|jks|keystore|pfx)$/.test(file)) findings.push(`${file}: private file class`);
  const buffer = readFileSync(file);
  if (buffer.includes(0)) continue;
  const text = buffer.toString("utf8");
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) findings.push(`${file}: private key`);
  if (/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sb_secret_[A-Za-z0-9_-]{20,})\b/.test(text)) findings.push(`${file}: credential pattern`);
  for (const token of text.matchAll(/\beyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
    try { if (JSON.parse(Buffer.from(token[1], "base64url").toString()).role === "service_role") findings.push(`${file}: service-role JWT`); } catch { /* Not a JWT payload. */ }
  }
}
const app = JSON.parse(readFileSync("app.json", "utf8")).expo;
if (app.owner || app.extra?.eas?.projectId || app.updates?.url) findings.push("app.json: template contains a connected Expo deployment");
if (findings.length) { console.error(findings.join("\n")); process.exitCode = 1; }
else console.log(`Publication guard passed for ${files.length} tracked files. No matched private-file/key patterns or connected Expo template target.`);
