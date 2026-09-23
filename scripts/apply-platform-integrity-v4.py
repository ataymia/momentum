from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
source=(ROOT/"scripts"/"apply-platform-integrity-v3.py").read_text()
old='''replace_once(\n    "lib/types.ts",\n    \'\'\'  lowStockApprovalRequired?: boolean;\n};\'\'\',\n    \'\'\'  lowStockApprovalRequired?: boolean;\n  /** Authoritative SKU breakdown. Legacy single-SKU orders may omit this and are treated as one line. */\n  lines?: OrderLine[];\n};\'\'\',\n)'''
new='''replace_once(\n    "lib/types.ts",\n    \'\'\'  sourcePlacementId?: string;\n  inventoryAvailableAtOrder?: number;\n  lowStockApprovalRequired?: boolean;\n};\n\nexport type PlacementSource\'\'\',\n    \'\'\'  sourcePlacementId?: string;\n  inventoryAvailableAtOrder?: number;\n  lowStockApprovalRequired?: boolean;\n  /** Authoritative SKU breakdown. Legacy single-SKU orders may omit this and are treated as one line. */\n  lines?: OrderLine[];\n};\n\nexport type PlacementSource\'\'\',\n)'''
if old not in source:
    raise SystemExit("v4 runner could not locate the v3 Order-lines patch block")
source=source.replace(old,new,1)
exec(compile(source,str(ROOT/"scripts"/"apply-platform-integrity-v3.py"),"exec"),{"__name__":"__main__","__file__":str(ROOT/"scripts"/"apply-platform-integrity-v3.py")})

def replace_once(path,old,new):
    p=ROOT/path;text=p.read_text();count=text.count(old)
    if count!=1:raise SystemExit(f"POST PATCH FAILED {path}: {count} matches for {old[:100]!r}")
    p.write_text(text.replace(old,new,1));print(f"post-patched {path}")

replace_once("lib/workspace-context.tsx",'''import type { Account, Activity, Appointment, AppointmentStatus, Approval, InventoryLot, Order, OrderStatus, PremiseType, PricingTier, SalesTerritory, WorkspaceData, WorkspaceUser } from "./types";''','''import type { Account, Activity, Appointment, AppointmentStatus, Approval, CustomerAccount, InventoryLot, Order, OrderStatus, PremiseType, PricingTier, SalesTerritory, WorkspaceData, WorkspaceUser } from "./types";''')
replace_once("lib/workspace-context.tsx",'''type CommercialAccountInput = { premiseType?: PremiseType; businessType?: string; categoryReviewDate?: string; pricingTier?: PricingTier; postalCode?: string };''','''type CommercialAccountInput = { premiseType?: PremiseType; businessType?: string; categoryReviewDate?: string; pricingTier?: PricingTier; postalCode?: string; programPricingLabel?:string; programPricePerCase?:number; programPricingEffectiveDate?:string; programPricingExpirationDate?:string; programPricingStatus?:Account["programPricingStatus"] };''')
replace_once("components/app-shell-v4.tsx",'''import { BadgeDollarSign, BarChart3, Bell, Boxes, Building2, CalendarDays, CheckSquare2, ChevronDown, ChevronRight, CircleDollarSign, CircleHelp, Command, KeyRound, LayoutDashboard, LogOut, Megaphone, Menu, PanelLeftClose, PanelLeftOpen, PartyPopper, Search, Settings, ShoppingCart, Store, UsersRound, X } from "lucide-react";''','''import { BadgeDollarSign, BarChart3, Bell, Boxes, Building2, CalendarDays, CheckSquare2, ChevronDown, ChevronRight, CircleDollarSign, CircleHelp, Command, FileText, KeyRound, LayoutDashboard, LogOut, Megaphone, Menu, PanelLeftClose, PanelLeftOpen, PartyPopper, Search, Settings, ShoppingCart, Store, UsersRound, X } from "lucide-react";''')

replace_once("tests/brand-ambassador-onboarding.test.ts",'''  test("a Sales Representative may only schedule their own Brand Ambassadors", () => {
    assert.equal(canSuperviseBrandAmbassador(data, repA, BA_A), true);
    assert.equal(canSuperviseBrandAmbassador(data, repA, BA_B), false);
    assert.equal(canSuperviseBrandAmbassador(data, admin, BA_B), true);
    assert.equal(validateBrandAmbassadorEvent(data, repA, { ...draft, ambassadorIds: [BA_A] }), null);
    assert.ok(validateBrandAmbassadorEvent(data, repA, { ...draft, ambassadorIds: [BA_B] }), "Rep A must not schedule Rep B's Ambassador");
    assert.ok(validateBrandAmbassadorEvent(data, repA, { ...draft, ambassadorIds: [BA_A, BA_B] }), "a mixed roster must be refused wholesale");
    assert.equal(validateBrandAmbassadorEvent(data, admin, { ...draft, ambassadorIds: [BA_A, BA_B] }), null);
  });''','''  test("Sales Representatives request events but only an Administrator assigns Brand Ambassadors", () => {
    assert.equal(canSuperviseBrandAmbassador(data, repA, BA_A), false);
    assert.equal(canSuperviseBrandAmbassador(data, repA, BA_B), false);
    assert.equal(canSuperviseBrandAmbassador(data, admin, BA_B), true);
    assert.ok(validateBrandAmbassadorEvent(data, repA, { ...draft, ambassadorIds: [BA_A] }), "a Sales Representative must request the event instead of assigning an Ambassador");
    assert.ok(validateBrandAmbassadorEvent(data, repA, { ...draft, ambassadorIds: [BA_B] }), "a Sales Representative must not assign another rep's Ambassador");
    assert.ok(validateBrandAmbassadorEvent(data, repA, { ...draft, ambassadorIds: [BA_A, BA_B] }), "a Sales Representative must not assign a mixed roster");
    assert.equal(validateBrandAmbassadorEvent(data, admin, { ...draft, ambassadorIds: [BA_A, BA_B] }), null);
  });''')
replace_once("tests/brand-ambassador-onboarding.test.ts",'''  test("nobody outside Administrator or the assigned rep may schedule at all", () => {
    for (const actor of [manager, ops, warehouse, baA, null]) {
      assert.ok(validateBrandAmbassadorEvent(data, actor, { ...draft, ambassadorIds: [BA_A] }), "only Administrators and the assigned rep may schedule");
    }
  });''','''  test("nobody outside Administrator may assign Brand Ambassadors", () => {
    for (const actor of [repA, manager, ops, warehouse, baA, null]) {
      assert.ok(validateBrandAmbassadorEvent(data, actor, { ...draft, ambassadorIds: [BA_A] }), "only Administrators may assign Brand Ambassadors");
    }
  });''')
print("PASS: v4 runner completed")
