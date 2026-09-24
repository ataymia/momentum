from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def replace_once(path:str,old:str,new:str):
    target=ROOT/path
    text=target.read_text()
    if text.count(old)!=1:
        raise SystemExit(f"expected one match in {path}, found {text.count(old)}: {old[:140]!r}")
    target.write_text(text.replace(old,new,1))
    print(f"patched {path}")

# Open the notification-focused order modal after navigation without synchronous state changes in an Effect.
replace_once(
    "components/pages/orders-v3.tsx",
    ' useEffect(()=>{if(!focusId)return;const target=scope.orders.find((order)=>order.id===focusId);if(target){setSelectedId(target.id);setDetailOpen(true)}sessionStorage.removeItem("momentum-focus-record")},[focusId,scope.orders]);',
    ' useEffect(()=>{if(!focusId)return;const handle=window.setTimeout(()=>{const target=scope.orders.find((order)=>order.id===focusId);if(target){setSelectedId(target.id);setDetailOpen(true)}sessionStorage.removeItem("momentum-focus-record")},0);return()=>window.clearTimeout(handle)},[focusId,scope.orders]);',
)

# Remove now-unused symbols so this release carries no new lint noise and also clears existing safe dead-code warnings.
replace_once(
    "components/pages/orders-v3.tsx",
    'PackageSearch, Phone, Plus',
    'PackageSearch, Plus',
)
replace_once(
    "lib/crm-engine.ts",
    '''  const customerIds=new Set((data.customers??[]).map((customer)=>customer.id));\n  const locationById=new Map(data.accounts.map((location)=>[location.id,location]));\n  const employeeIds=new Set(data.users.filter((user)=>user.role!=="Customer").map((user)=>user.id));\n  const responsibilityUsers=new Set(data.users.filter((user)=>["Administrator","Sales Manager","Sales Representative"].includes(user.role)).map((user)=>user.id));\n\n''',
    '',
)
replace_once(
    "lib/workspace-context.tsx",
    'import { canonicalProductDescription, skuForProductName } from "./product-catalog";',
    'import { skuForProductName } from "./product-catalog";',
)
replace_once(
    "lib/notification-context-v2.tsx",
    '  },[data.accounts,data.users]);',
    '  },[data,data.accounts,data.users]);',
)

print("visual polish lint cleanup applied")
