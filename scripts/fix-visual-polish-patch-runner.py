from pathlib import Path

path = Path(__file__).resolve().parent / "apply-visual-polish-notification-routing.py"
text = path.read_text()
old = '''replace_once(
    "lib/access.ts",
    '\"accountHealth\",\"crmTools\",\"dispatch\"',
    '\"accountHealth\",\"dispatch\"',
)
replace_once(
    "lib/access.ts",
    '\"accountHealth\",\"crmTools\",\"dispatch\"',
    '\"accountHealth\",\"dispatch\"',
)
replace_once(
    "lib/access.ts",
    '\"accountHealth\",\"crmTools\",\"dispatch\"',
    '\"accountHealth\",\"dispatch\"',
)'''
new = '''target = ROOT / "lib/access.ts"
text = target.read_text()
old_access = '\"accountHealth\",\"crmTools\",\"dispatch\"'
new_access = '\"accountHealth\",\"dispatch\"'
count = text.count(old_access)
if count != 3:
    raise SystemExit(f"PATCH FAILED: expected three CRM Tools access entries, found {count}")
target.write_text(text.replace(old_access, new_access))
print("patched lib/access.ts (retired CRM Tools for three roles)")'''
if old in text:
    path.write_text(text.replace(old, new, 1))
    print("corrected CRM Tools patch block")
elif "retired CRM Tools for three roles" in text:
    print("patch runner already corrected")
else:
    raise SystemExit("Could not find the CRM Tools patch block to correct")
