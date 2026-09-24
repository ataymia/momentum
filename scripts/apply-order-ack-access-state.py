from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"PATCH FAILED: expected one match in {path}, found {count}: {old[:180]!r}")
    target.write_text(text.replace(old, new, 1))
    print(f"patched {path}")


# ---------------------------------------------------------------------------
# 1. Persistence acknowledgement. A business action is not successful merely
# because React/local state changed. The caller can now wait until the exact
# storage key has either left the dirty queue or has a real sync error.
# ---------------------------------------------------------------------------
replace_once(
    "lib/persistence.ts",
    '''  /** Force pending Firestore writes now (used before sign-out). */
  async flush(){await backend?.flush();},
};''',
    '''  /** Force pending Firestore writes now (used before sign-out). */
  async flush(){await backend?.flush();},
  /** Confirm that one storage key actually reached Firestore. Local/demo mode succeeds immediately. */
  async flushAndConfirm(key:string,timeoutMs=12_000):Promise<{ok:boolean;message?:string}>{
    if(!backend)return{ok:true};
    return backend.flushAndConfirm(key,timeoutMs);
  },
};''',
)
replace_once(
    "lib/persistence.ts",
    '''  getItem(key:string){return this.cache.get(key)??null;}

  setItem(key:string,value:string){''',
    '''  getItem(key:string){return this.cache.get(key)??null;}

  async flushAndConfirm(key:string,timeoutMs:number){
    const started=Date.now();
    while(Date.now()-started<timeoutMs){
      if(!this.flushing&&this.dirty.has(key))await this.flush();
      if(!this.flushing&&!this.dirty.has(key))return{ok:true};
      await new Promise((resolve)=>setTimeout(resolve,75));
    }
    return{ok:false,message:status.lastError??"Momentum cloud did not confirm this change before the safety timeout."};
  }

  setItem(key:string,value:string){''',
)

# ---------------------------------------------------------------------------
# 2. Commercial order creation writes the exact next commercial snapshot to
# Momentum storage immediately, before returning an order id. The existing
# effect remains as a harmless reconciliation backstop.
# ---------------------------------------------------------------------------
replace_once(
    "lib/workspace-context.tsx",
    'const COMMERCIAL_KEY = "momentum-commercial-controls-v1";',
    'export const COMMERCIAL_KEY = "momentum-commercial-controls-v1";',
)
replace_once(
    "lib/workspace-context.tsx",
    '''    setCommercial((state)=>({...state,orders:[order,...state.orders],approvals:[approval,...state.approvals],accountPatches:{...state.accountPatches,[accountId]:{...(state.accountPatches[accountId]??{}),stage:"Opening order",lastActivity:`Order request ${number} submitted`}},activities:[{id:uid("act-order"),accountId,type:"order",title:lowStock?"Low-stock order submitted":"Order submitted",detail:`${number} · ${lineSummary} · ${cases} total cases · ${price.toFixed(2)}/case.`,at:now(),userId:currentUser.id},...state.activities]}));
    window.setTimeout(()=>void momentumStorage.flush(),0);
    return id;''',
    '''    const nextCommercial:CommercialState={...commercial,orders:[order,...commercial.orders],approvals:[approval,...commercial.approvals],accountPatches:{...commercial.accountPatches,[accountId]:{...(commercial.accountPatches[accountId]??{}),stage:"Opening order",lastActivity:`Order request ${number} submitted`}},activities:[{id:uid("act-order"),accountId,type:"order",title:lowStock?"Low-stock order submitted":"Order submitted",detail:`${number} · ${lineSummary} · ${cases} total cases · ${price.toFixed(2)}/case.`,at:now(),userId:currentUser.id},...commercial.activities]};
    // Persist immediately. The UI will not call this submitted until Firestore acknowledges this exact key.
    momentumStorage.setItem(COMMERCIAL_KEY,JSON.stringify(nextCommercial));
    setCommercial(nextCommercial);
    return id;''',
)

# ---------------------------------------------------------------------------
# 3. Order UI waits for Firestore acknowledgement and blocks authoritative
# access-state drift. A locally-created order is never presented as submitted
# until the commercial domain is confirmed remotely.
# ---------------------------------------------------------------------------
replace_once(
    "components/pages/orders-v3.tsx",
    'import { evaluatePartnerPricing } from "../../lib/pricing-engine";\nimport type { OrderStatus } from "../../lib/types";\nimport { useWorkspace } from "../../lib/workspace-context";',
    'import { useFirebaseSessionOptional } from "../../lib/firebase-session-context";\nimport { momentumStorage } from "../../lib/persistence";\nimport { evaluatePartnerPricing } from "../../lib/pricing-engine";\nimport type { OrderStatus } from "../../lib/types";\nimport { COMMERCIAL_KEY, useWorkspace } from "../../lib/workspace-context";',
)
replace_once(
    "components/pages/orders-v3.tsx",
    ''' const{data,scope,currentUser,createOrder,navigate}=useWorkspace();const{ledger,advanceOrderFulfillment}=useInventoryLedger();
 const focusId=typeof window!=="undefined"?sessionStorage.getItem("momentum-focus-record"):null;''',
    ''' const{data,scope,currentUser,createOrder,navigate}=useWorkspace();const{ledger,advanceOrderFulfillment}=useInventoryLedger();const firebase=useFirebaseSessionOptional();
 const focusId=typeof window!=="undefined"?sessionStorage.getItem("momentum-focus-record"):null;''',
)
replace_once(
    "components/pages/orders-v3.tsx",
    ''' const[query,setQuery]=useState("");const[selectedId,setSelectedId]=useState(focused?.id??scope.orders[0]?.id??"");const[open,setOpen]=useState(false);const[error,setError]=useState("");
 const[accountId,setAccountId]=useState(focusedAccount?.id??scope.accounts[0]?.id??"");''',
    ''' const[query,setQuery]=useState("");const[selectedId,setSelectedId]=useState(focused?.id??scope.orders[0]?.id??"");const[open,setOpen]=useState(false);const[error,setError]=useState("");const[submitting,setSubmitting]=useState(false);
 const[accountId,setAccountId]=useState(focusedAccount?.id??scope.accounts[0]?.id??"");''',
)
replace_once(
    "components/pages/orders-v3.tsx",
    ''' const submit=(e:FormEvent)=>{e.preventDefault();if(!price){setError("Current account pricing must be configured before this order can be submitted.");return}if(!lines.length||lines.some((l)=>!Number.isInteger(l.cases)||l.cases<1)){setError("Every order line needs a whole-number case quantity of at least 1.");return}const id=createOrder({accountId,lines:lines.map((l)=>({...l,inventoryAvailableAtOrder:productInventoryStatus(ledger,data,l.product).available}))});if(!id){setError("Momentum rejected this request. Review the account, pricing, quantities, and permissions. Nothing was silently submitted.");return}setSelectedId(id);setOpen(false);setError("")};''',
    ''' const submit=async(e:FormEvent)=>{e.preventDefault();if(submitting)return;if(firebase&&currentUser?.role!=="Customer"&&firebase.access?.accountState!=="Active"){setError(`Your Momentum access is ${firebase.access?.accountState??"not active"}. The order was not submitted. An Administrator must activate the Firebase access record first.`);return}if(!price){setError("Current account pricing must be configured before this order can be submitted.");return}if(!lines.length||lines.some((l)=>!Number.isInteger(l.cases)||l.cases<1)){setError("Every order line needs a whole-number case quantity of at least 1.");return}setSubmitting(true);setError("");const id=createOrder({accountId,lines:lines.map((l)=>({...l,inventoryAvailableAtOrder:productInventoryStatus(ledger,data,l.product).available}))});if(!id){setSubmitting(false);setError("Momentum rejected this request. Review the account, pricing, quantities, and permissions. Nothing was silently submitted.");return}const confirmed=await momentumStorage.flushAndConfirm(COMMERCIAL_KEY);setSubmitting(false);setSelectedId(id);if(!confirmed.ok){setError(`Order ${id} is safely queued on this device but Momentum cloud has NOT confirmed it. Do not submit it again. ${confirmed.message??"Use the sync indicator and retry after access/connectivity is corrected."}`);return}setOpen(false);setError("")};''',
)
replace_once(
    "components/pages/orders-v3.tsx",
    '''<Button type="submit" form="order-v3-form">Submit order</Button>''',
    '''<Button type="submit" form="order-v3-form" disabled={submitting}>{submitting?"Confirming with cloud…":"Submit order"}</Button>''',
)

# ---------------------------------------------------------------------------
# 4. Firebase userAccess is the authority. If it is not Active, never expose
# the live operational workspace just because a separate onboarding record says
# Active. This closes the exact drift path that can show a working order form
# while Security Rules reject every business write.
# ---------------------------------------------------------------------------
replace_once(
    "components/momentum-app.tsx",
    '''  if(!currentUser)return <LoginScreen/>;
  if(currentUser.role!=="Customer"&&currentRecord?.state!=="Active"&&!activeAdministrator)return <OnboardingPortal/>;
  return <><AppShell/><DeparturePrompt/></>;''',
    '''  if(!currentUser)return <LoginScreen/>;
  if(firebase&&currentUser.role!=="Customer"&&firebase.access?.accountState!=="Active")return <OnboardingPortal/>;
  if(currentUser.role!=="Customer"&&currentRecord?.state!=="Active"&&!activeAdministrator)return <OnboardingPortal/>;
  return <><AppShell/><DeparturePrompt/></>;''',
)

# ---------------------------------------------------------------------------
# 5. Permanent source-level regression guards for the two failure modes.
# ---------------------------------------------------------------------------
test_path=ROOT/"tests/order-cloud-ack.test.ts"
test_path.write_text('''import assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\nimport test from "node:test";\n\nconst read=(path:string)=>readFileSync(path,"utf8");\n\ntest("order submit waits for the commercial Firestore key to be confirmed",()=>{\n  const ui=read("components/pages/orders-v3.tsx");\n  const workspace=read("lib/workspace-context.tsx");\n  const persistence=read("lib/persistence.ts");\n  assert.match(ui,/await momentumStorage\\.flushAndConfirm\\(COMMERCIAL_KEY\\)/);\n  assert.match(ui,/Momentum cloud has NOT confirmed it/);\n  assert.match(workspace,/momentumStorage\\.setItem\\(COMMERCIAL_KEY,JSON\\.stringify\\(nextCommercial\\)\\)/);\n  assert.match(persistence,/async flushAndConfirm\\(key:string,timeoutMs:number\\)/);\n});\n\ntest("authoritative Firebase access state gates the live workspace",()=>{\n  const app=read("components/momentum-app.tsx");\n  const orders=read("components/pages/orders-v3.tsx");\n  assert.match(app,/firebase\\.access\\?\\.accountState!=="Active"/);\n  assert.match(orders,/firebase\\.access\\?\\.accountState!=="Active"/);\n});\n''')
print("wrote tests/order-cloud-ack.test.ts")

print("PASS: order cloud acknowledgement and authoritative access-state patch applied")
