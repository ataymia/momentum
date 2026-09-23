from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "lib/persistence.ts"
text = path.read_text()
old = '      if(pending!==null){this.cache.set(spec.key,pending);this.dirty.add(spec.key);}'
new = '      if(typeof pending==="string"){this.cache.set(spec.key,pending);this.dirty.add(spec.key);}'
count = text.count(old)
if count != 1:
    raise SystemExit(f"lib/persistence.ts: expected one pending-journal guard, found {count}")
path.write_text(text.replace(old, new, 1))
print("PASS: pending journal type guard fixed")
