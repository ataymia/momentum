from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
source=(ROOT/"scripts"/"apply-platform-integrity-v3.py").read_text()
old='''replace_once(\n    "lib/types.ts",\n    \'\'\'  lowStockApprovalRequired?: boolean;\n};\'\'\',\n    \'\'\'  lowStockApprovalRequired?: boolean;\n  /** Authoritative SKU breakdown. Legacy single-SKU orders may omit this and are treated as one line. */\n  lines?: OrderLine[];\n};\'\'\',\n)'''
new='''replace_once(\n    "lib/types.ts",\n    \'\'\'  sourcePlacementId?: string;\n  inventoryAvailableAtOrder?: number;\n  lowStockApprovalRequired?: boolean;\n};\n\nexport type PlacementSource\'\'\',\n    \'\'\'  sourcePlacementId?: string;\n  inventoryAvailableAtOrder?: number;\n  lowStockApprovalRequired?: boolean;\n  /** Authoritative SKU breakdown. Legacy single-SKU orders may omit this and are treated as one line. */\n  lines?: OrderLine[];\n};\n\nexport type PlacementSource\'\'\',\n)'''
if old not in source:
    raise SystemExit("v4 runner could not locate the v3 Order-lines patch block")
source=source.replace(old,new,1)
exec(compile(source,str(ROOT/"scripts"/"apply-platform-integrity-v3.py"),"exec"),{"__name__":"__main__","__file__":str(ROOT/"scripts"/"apply-platform-integrity-v3.py")})

# Small compile-time corrections layered after the comprehensive patch.
def replace_once(path,old,new):
    p=ROOT/path;text=p.read_text();count=text.count(old)
    if count!=1:raise SystemExit(f"POST PATCH FAILED {path}: {count} matches for {old[:100]!r}")
    p.write_text(text.replace(old,new,1));print(f"post-patched {path}")

replace_once("lib/workspace-context.tsx",'''import type {\n  Account,\n  Activity,''','''import type {\n  Account,\n  CustomerAccount,\n  Activity,''')
replace_once("lib/workspace-context.tsx",'''type CommercialAccountInput = { premiseType?: PremiseType; businessType?: string; categoryReviewDate?: string; pricingTier?: PricingTier; postalCode?: string };''','''type CommercialAccountInput = { premiseType?: PremiseType; businessType?: string; categoryReviewDate?: string; pricingTier?: PricingTier; postalCode?: string; programPricingLabel?:string; programPricePerCase?:number; programPricingEffectiveDate?:string; programPricingExpirationDate?:string; programPricingStatus?:Account["programPricingStatus"] };''')
replace_once("components/app-shell-v4.tsx",'''import { BadgeDollarSign, BarChart3, Bell, Boxes, Building2, CalendarDays, CheckSquare2, ChevronDown, ChevronRight, CircleDollarSign, CircleHelp, Command, KeyRound, LayoutDashboard, LogOut, Megaphone, Menu, PanelLeftClose, PanelLeftOpen, PartyPopper, Search, Settings, ShoppingCart, Store, UsersRound, X } from "lucide-react";''','''import { BadgeDollarSign, BarChart3, Bell, Boxes, Building2, CalendarDays, CheckSquare2, ChevronDown, ChevronRight, CircleDollarSign, CircleHelp, Command, FileText, KeyRound, LayoutDashboard, LogOut, Megaphone, Menu, PanelLeftClose, PanelLeftOpen, PartyPopper, Search, Settings, ShoppingCart, Store, UsersRound, X } from "lucide-react";''')
print("PASS: v4 runner completed")
