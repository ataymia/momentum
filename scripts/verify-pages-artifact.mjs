import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = "out";
const fail = (message) => { console.error(`Pages artifact verification failed: ${message}`); process.exit(66); };
if (!existsSync(join(root,"index.html"))) fail("out/index.html is missing");
const html = readFileSync(join(root,"index.html"),"utf8");
if (!html.includes("Momentum Distribution")) fail("brand marker is missing from index.html");
if (/localhost|127\.0\.0\.1/.test(html)) fail("local development URL leaked into the exported HTML");
if (/undefined\/(?:_next|favicon)/.test(html)) fail("undefined base path leaked into exported HTML");
const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/,"");
const refs = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((match)=>match[1]).filter((value)=>value.includes("/_next/")||value.endsWith("/favicon.svg"));
for (const ref of refs) { let relative = ref.split("?")[0].split("#")[0]; if (base && relative.startsWith(base)) relative = relative.slice(base.length); relative = relative.replace(/^\//,""); if (relative && !existsSync(join(root,relative))) fail(`referenced asset is missing: ${ref}`); }
function files(dir){return readdirSync(dir).flatMap((name)=>{const path=join(dir,name);return statSync(path).isDirectory()?files(path):[path];});}
const all = files(root);
if (!all.some((file)=>file.includes(`${join("out","_next")}`))) fail("Next static assets were not exported");
if (!all.some((file)=>file.endsWith(".js"))) fail("no JavaScript bundle was exported");
console.log(`Verified Pages artifact: ${all.length} files, ${refs.length} critical references checked.`);
