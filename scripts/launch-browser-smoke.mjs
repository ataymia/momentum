import assert from "node:assert/strict";

const DRIVER = process.env.CHROMEDRIVER_URL ?? "http://127.0.0.1:9515";
const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:4173/";
const ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf";
const pause = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));

async function wd(path, method = "GET", body) {
  const response = await fetch(`${DRIVER}${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.value?.error) throw new Error(`${method} ${path}: ${payload?.value?.message ?? response.statusText}`);
  return payload.value;
}

const sessionPayload = await wd("/session", "POST", {
  capabilities: {
    alwaysMatch: {
      browserName: "chrome",
      "goog:chromeOptions": { args: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--window-size=1440,1000"] },
      "goog:loggingPrefs": { browser: "ALL" },
    },
  },
});
const sessionId = sessionPayload.sessionId;
const endpoint = (path) => `/session/${sessionId}${path}`;

async function execute(script, args = []) { return wd(endpoint("/execute/sync"), "POST", { script, args }); }
async function navigate(url = BASE_URL) { await wd(endpoint("/url"), "POST", { url }); }
async function elements(selector) { const rows = await wd(endpoint("/elements"), "POST", { using: "css selector", value: selector }); return rows.map((row) => row[ELEMENT_KEY]); }
async function element(selector) { const rows = await elements(selector); if (!rows[0]) throw new Error(`Element not found: ${selector}`); return rows[0]; }
async function click(selector) { const id = await element(selector); await wd(endpoint(`/element/${id}/click`), "POST", {}); }
async function clearAndType(selector, value) { const id = await element(selector); await wd(endpoint(`/element/${id}/clear`), "POST", {}); await wd(endpoint(`/element/${id}/value`), "POST", { text: value }); }
async function text(selector) { const id = await element(selector); return wd(endpoint(`/element/${id}/text`)); }
async function rawText(selector) { return execute(`return document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() ?? '';`); }
async function waitFor(predicate, label, timeoutMs = 8000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try { if (await predicate()) return; } catch (error) { lastError = error; }
    await pause();
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}`);
}
async function exists(selector) { return (await elements(selector)).length > 0; }
async function waitExists(selector) { await waitFor(() => exists(selector), selector); }
async function key(value, modifiers = []) {
  const actions = [];
  for (const modifier of modifiers) actions.push({ type:"keyDown", value:modifier });
  actions.push({ type:"keyDown", value }, { type:"keyUp", value });
  for (const modifier of [...modifiers].reverse()) actions.push({ type:"keyUp", value:modifier });
  await wd(endpoint("/actions"), "POST", { actions:[{ type:"key", id:"keyboard", actions }] });
  await wd(endpoint("/actions"), "DELETE");
}
async function setWindow(width, height) { await wd(endpoint("/window/rect"), "POST", { width, height }); }

const roles = [
  { role:"Administrator", email:"director@momentum.demo", nav:["Home","My work","CRM & sales","Dispatch board","Retail execution","Orders & billing","Inventory & fulfillment","Marketing","Human Resources","Payroll","Finance & accounting","Performance & reports","Administration","Help"] },
  { role:"Sales Manager", email:"manager@momentum.demo", nav:["Home","My work","CRM & sales","Dispatch board","Retail execution","Orders & billing","Marketing","Human Resources","Payroll","Finance & accounting","Performance & reports","Help"] },
  { role:"Sales Representative", email:"rep@momentum.demo", nav:["Home","My work","CRM & sales","Dispatch board","Retail execution","Orders & billing","Marketing","Human Resources","Payroll","Finance & accounting","Performance & reports","Help"] },
  { role:"Operations", email:"ops@momentum.demo", nav:["Home","My work","Dispatch board","Orders & billing","Inventory & fulfillment","Marketing","Human Resources","Payroll","Finance & accounting","Help"] },
  { role:"Warehouse", email:"warehouse@momentum.demo", nav:["Home","My work","Orders & billing","Inventory & fulfillment","Human Resources","Payroll","Help"] },
  { role:"Customer", email:"customer@momentum.demo", nav:["Account overview","My account","My orders","Help"] },
];
const allNavLabels = ["Home","Account overview","My work","CRM & sales","My account","Dispatch board","Retail execution","Orders & billing","My orders","Inventory & fulfillment","Marketing","Human Resources","Payroll","Finance & accounting","Performance & reports","Administration","Help"];

async function resetSession() {
  await navigate(BASE_URL);
  await execute(`localStorage.setItem('momentum-runtime-mode-v1', JSON.stringify({version:1,mode:'demo'})); localStorage.removeItem('momentum-demo-session-v2'); localStorage.removeItem('momentum-warehouse-session-v1'); sessionStorage.clear(); location.reload();`);
  await waitExists(".login-form");
  await waitFor(() => execute(`try{return JSON.parse(localStorage.getItem('momentum-runtime-mode-v1')||'{}').mode==='demo'&&!localStorage.getItem('momentum-demo-session-v2')&&!localStorage.getItem('momentum-warehouse-session-v1')}catch{return false}`), "clean demo login state");
}
async function login(role) {
  await resetSession();
  await clearAndType('input[autocomplete="username"]', role.email);
  await clearAndType('input[autocomplete="current-password"]', "admin");
  await click('.login-form button[type="submit"]');
  await waitExists(".user-button");
  // WebDriver's element text is empty for responsive labels hidden by CSS. Verify DOM identity text instead so mobile role checks remain strict.
  await waitFor(async () => (await rawText(".user-button small")) === role.role, `${role.role} role label`);
}
async function navLabels() {
  return execute(`return [...document.querySelectorAll('.sidebar__nav .nav-item')].map((node)=>node.getAttribute('title') || node.textContent.trim()).filter(Boolean);`);
}
async function pageIsHealthy() {
  return execute(`const body=document.body?.innerText||''; return !/Application error|Unhandled Runtime Error|Something went wrong/i.test(body) && Boolean(document.querySelector('.page-container'));`);
}
async function accessibilityViolations() {
  return execute(`
    const visible=(el)=>el instanceof HTMLElement && el.offsetParent!==null;
    const buttons=[...document.querySelectorAll('button')].filter(visible).filter((el)=>!((el.getAttribute('aria-label')||el.getAttribute('title')||el.textContent||'').trim())).map((el)=>el.outerHTML.slice(0,180));
    const controls=[...document.querySelectorAll('input,select,textarea')].filter(visible).filter((el)=>{
      if((el.getAttribute('aria-label')||el.getAttribute('aria-labelledby')||'').trim()) return false;
      if(el.closest('label')) return false;
      const id=el.getAttribute('id'); return !(id && document.querySelector('label[for="'+CSS.escape(id)+'"]'));
    }).map((el)=>el.outerHTML.slice(0,180));
    return {buttons,controls};
  `);
}
async function assertNoDocumentOverflow(context) {
  const metrics = await execute(`return {width:window.innerWidth,scroll:Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth||0)};`);
  assert.ok(metrics.scroll <= metrics.width + 2, `${context} overflows viewport: ${metrics.scroll}px > ${metrics.width}px`);
}
async function clickNav(label) {
  const id = await element(`.sidebar__nav .nav-item[title="${label.replaceAll('"','\\"')}"]`);
  await wd(endpoint(`/element/${id}/click`), "POST", {});
  await waitFor(pageIsHealthy, `${label} page`);
  await pause(80);
}

try {
  await setWindow(1440, 1000);
  for (const role of roles) {
    await login(role);
    const actual = await navLabels();
    assert.deepEqual(actual, role.nav, `${role.role} navigation matrix drifted`);
    for (const forbidden of allNavLabels.filter((label) => !role.nav.includes(label))) assert.equal(actual.includes(forbidden), false, `${role.role} unexpectedly sees ${forbidden}`);
    for (const label of role.nav) {
      await clickNav(label);
      const violations = await accessibilityViolations();
      assert.deepEqual(violations.buttons, [], `${role.role}/${label} has unlabeled visible button(s): ${violations.buttons.join(" | ")}`);
      assert.deepEqual(violations.controls, [], `${role.role}/${label} has unlabeled visible form control(s): ${violations.controls.join(" | ")}`);
    }
    console.log(`ROLE PASS ${role.role}: ${role.nav.length} allowed pages rendered with the expected navigation boundary.`);
  }

  await login(roles[0]);
  const beforeKeys = await execute(`return Object.keys(localStorage).filter((key)=>key.startsWith('momentum-')).sort();`);
  const businessKeys = beforeKeys.filter((key) => !["momentum-demo-session-v2","momentum-sidebar-collapsed-v1","momentum-runtime-mode-v1","momentum-presentation-seed-2026-08-31","momentum-warehouse-session-v1"].includes(key));
  assert.ok(businessKeys.length >= 10, `Expected module persistence stores, found ${businessKeys.length}`);
  const malformedBefore = await execute(`return Object.keys(localStorage).filter((key)=>key.startsWith('momentum-')).filter((key)=>{const value=localStorage.getItem(key);if(!value||!value.trim().startsWith('{'))return false;try{JSON.parse(value);return false}catch{return true}});`);
  assert.deepEqual(malformedBefore, [], "A Momentum JSON store is malformed before reload");
  await click('.sidebar__collapse');
  await waitFor(() => execute(`return document.querySelector('.app-layout')?.classList.contains('is-sidebar-collapsed')===true;`), "collapsed sidebar state");
  await navigate(BASE_URL);
  await waitExists(".user-button");
  assert.equal(await rawText(".user-button small"), "Administrator", "Authenticated demo session did not survive reload");
  assert.equal(await execute(`return localStorage.getItem('momentum-sidebar-collapsed-v1');`), "true", "Sidebar preference did not survive reload");
  const afterKeys = await execute(`return Object.keys(localStorage).filter((key)=>key.startsWith('momentum-')).sort();`);
  for (const keyName of businessKeys) assert.ok(afterKeys.includes(keyName), `Persistence store disappeared after reload: ${keyName}`);
  const malformedAfter = await execute(`return Object.keys(localStorage).filter((key)=>key.startsWith('momentum-')).filter((key)=>{const value=localStorage.getItem(key);if(!value||!value.trim().startsWith('{'))return false;try{JSON.parse(value);return false}catch{return true}});`);
  assert.deepEqual(malformedAfter, [], "A Momentum JSON store is malformed after reload");
  console.log(`PERSISTENCE PASS: ${businessKeys.length} module stores survived browser reload and session/UI preference hydration.`);

  await setWindow(390, 844);
  for (const role of [roles[0], roles[5]]) {
    await login(role);
    for (const label of role.nav) {
      await execute(`document.querySelector('.sidebar__collapse')?.click();`);
      await clickNav(label);
      await assertNoDocumentOverflow(`${role.role}/${label}`);
    }
    console.log(`MOBILE PASS ${role.role}: ${role.nav.length} pages fit the 390px document viewport.`);
  }

  await setWindow(1440, 1000);
  await login(roles[0]);
  await clickNav("Administration");
  const trigger = await element(".platform-mode-card button");
  await wd(endpoint(`/element/${trigger}/click`), "POST", {});
  await waitExists('[role="dialog"]');
  assert.equal(await execute(`return Boolean(document.querySelector('[role="dialog"]')?.contains(document.activeElement));`), true, "Opening modal did not move focus inside dialog");
  for (let i=0;i<12;i++) {
    await key("\uE004");
    assert.equal(await execute(`return Boolean(document.querySelector('[role="dialog"]')?.contains(document.activeElement));`), true, `Tab ${i+1} escaped the modal`);
  }
  await key("\uE00C");
  await waitFor(async () => !(await exists('[role="dialog"]')), "Escape to close runtime modal");
  assert.equal(await execute(`return document.activeElement?.classList.contains('button') || document.activeElement?.closest?.('.platform-mode-card')!==null;`), true, "Modal close did not restore focus to the invoking control");
  await key("k", ["\uE009"]);
  await waitExists('[role="dialog"]');
  assert.equal((await text('[role="dialog"] h2')), "Search Momentum", "Ctrl+K did not open the global search dialog");
  await key("\uE00C");
  await waitFor(async () => !(await exists('[role="dialog"]')), "Escape to close global search");
  console.log("KEYBOARD PASS: shared modal focus trap, Escape close/restore, and Ctrl+K search shortcut work in a real browser.");

  const browserLogs = await wd(endpoint("/se/log"), "POST", { type:"browser" }).catch(() => []);
  const severe = Array.isArray(browserLogs) ? browserLogs.filter((entry) => entry.level === "SEVERE" && !/favicon/i.test(entry.message ?? "")) : [];
  assert.deepEqual(severe, [], `Severe browser console errors: ${severe.map((entry)=>entry.message).join(" | ")}`);
  console.log("LAUNCH BROWSER ACCEPTANCE PASS");
} finally {
  await wd(endpoint(""), "DELETE").catch(() => {});
}
