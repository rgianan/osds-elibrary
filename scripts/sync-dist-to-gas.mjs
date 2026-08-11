import fs from "node:fs";
import path from "node:path";

const distDir = path.resolve(process.cwd(), "dist");
const gasDir = path.resolve(process.cwd(), "..", "apps-script");
const indexHtmlPath = path.join(distDir, "index.html");

if (!fs.existsSync(indexHtmlPath)) {
  throw new Error(`dist/index.html not found at ${indexHtmlPath}. Run the frontend build first.`);
}

const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");
const cssMatches = [...indexHtml.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map((match) => match[1]);
const jsMatches = [...indexHtml.matchAll(/<script[^>]+src="([^"]+\.js)"[^>]*><\/script>/g)].map((match) => match[1]);

const readDistAsset = (assetPath) => {
  const cleaned = assetPath.replace(/^\.\//, "").replace(/^\//, "");
  return fs.readFileSync(path.join(distDir, cleaned), "utf8");
};

const cssText = cssMatches.map(readDistAsset).join("\n\n");
const jsText = jsMatches.map(readDistAsset).join("\n\n");

const cssBase64 = Buffer.from(cssText, "utf8").toString("base64");
const jsBase64 = Buffer.from(jsText, "utf8").toString("base64");

const decodeHelper = `
function __decodeBase64Utf8(b64){
  var bin = atob(b64);
  var len = bin.length;
  var bytes = new Uint8Array(len);
  for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}
`.trim();

const reactCssHtml = `<style id="app-inline-css"></style>\n<script>\n${decodeHelper}\n(function(){\n  var css = __decodeBase64Utf8(${JSON.stringify(cssBase64)});\n  document.getElementById('app-inline-css').textContent = css;\n})();\n<\/script>\n`;

const reactJsHtml = `<script>\n${decodeHelper}\n(function(){\n  var js = __decodeBase64Utf8(${JSON.stringify(jsBase64)});\n  var el = document.createElement('script');\n  el.type = 'module';\n  el.textContent = js;\n  document.body.appendChild(el);\n})();\n<\/script>\n`;

fs.writeFileSync(path.join(gasDir, "ReactCss.html"), reactCssHtml, "utf8");
fs.writeFileSync(path.join(gasDir, "ReactJs.html"), reactJsHtml, "utf8");

console.log("Synced Vite bundle into apps-script/ReactCss.html and apps-script/ReactJs.html using UTF-8-safe base64 loaders.");
