"use client";

import { AlertTriangle, ArrowLeft, Building2, CalendarPlus, ChevronLeft, ChevronRight, Mail, MapPin, Phone, Plus, Search, Store, UserRound } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {loadPrivateAccountNicknames,savePrivateAccountNickname} from "../../lib/private-account-nicknames";
import { canClaimUnassignedProspect, canCreateAccount, isCustomer } from "../../lib/access";
import { validateNewAccountContact } from "../../lib/account-creation";
import {taxIdentityMissing,validateTaxIdentity,type TaxIdentityInput,type TaxFieldErrors} from "../../lib/account-tax-identity";
import { businessAddressLabel, deliveryAddressLabel } from "../../lib/account-address";
import { isOpenCommercialAccount } from "../../lib/account-view-filter";
import { ACCOUNT_PRICING_TIERS } from "../../lib/account-health";
import { evaluateSalesRepAccountBonuses, SALES_REP_ACCOUNT_BONUS_RULE } from "../../lib/bonus-engine";
import { useCrm } from "../../lib/crm-context";
import { findAccountDuplicate } from "../../lib/duplicate-engine";
import { evaluatePartnerPricing } from "../../lib/pricing-engine";
import { territoryForPostalCode, territorySystemEnabled } from "../../lib/territory-engine";
import type { AccountStage, PremiseType, PricingTier } from "../../lib/types";
import { useWorkspace } from "../../lib/workspace-context";
import { RecordHistory } from "../audit/record-history";
import { CrmDepthPanel } from "../crm/crm-depth-panel";
import { Avatar, Button, Field, Modal, PageHeader, Section, StatusPill, formatDate, formatMoney } from "../ui";

// View filters intentionally stay narrower than legacy account stages; historical stages are preserved in records.
const stages=["All","Prospect","Opening order"] as const;
const stageDisplay=(stage:string)=>stage==="Opening order"?"Open account":stage;
const stageFilterDisplay=(stage:(typeof stages)[number])=>stage==="All"?"All":stage==="Prospect"?"Prospects":"Open accounts";
const stageTone=(stage:AccountStage)=>stage==="Reordered"||stage==="Placed"?"success" as const:stage==="At risk"?"danger" as const:stage==="Opening order"||stage==="Sampled"?"gold" as const:"info" as const;
const bonusTone=(status:string)=>status==="Earned"?"success" as const:status==="Window expired"||status==="Not qualified"?"danger" as const:status==="Awaiting payment"?"warning" as const:"info" as const;
const pricingTone=(status:string)=>status==="Partner pricing"||status==="Intro partner pricing"?"success" as const:status==="Standard pricing"?"warning" as const:"info" as const;
const blankForm={legalBusinessName:"",ein:"",azTptLicenseNumber:"",taxDocumentType:"Undetermined",name:"",location:"Phoenix, AZ",streetAddress:"",postalCode:"",deliveryAddressSameAsBusiness:true,deliveryStreetAddress:"",deliveryLocation:"",deliveryPostalCode:"",channel:"Independent retail",contactName:"",contactRole:"Owner / buyer",phone:"",mobilePhone:"",fax:"",email:""};
const pageSize=50;

type AccountTab="accounts"|"unassigned"|"pricing"|"incentives";
type CommercialForm={premiseType:PremiseType;businessType:string;categoryReviewDate:string;streetAddress:string;location:string;postalCode:string;deliveryAddressSameAsBusiness:boolean;deliveryStreetAddress:string;deliveryLocation:string;deliveryPostalCode:string;pricingTier?:PricingTier};

export function AccountsPage(){
  const {data,scope,currentUser,createAccount,claimUnassignedProspect,navigate,updateAccountCommercial,updateCustomerCommercial,transferAccountResponsibility}=useWorkspace();
  const {recordResponsibility}=useCrm();
  const focusId=typeof window!=="undefined"?window.sessionStorage.getItem("momentum-focus-record"):null;
  const focusedAccountId=focusId&&scope.accounts.some((account)=>account.id===focusId)?focusId:null;
  const initialId=focusedAccountId??scope.accounts[0]?.id??"";
  const [tab,setTab]=useState<AccountTab>("accounts");
  const [query,setQuery]=useState("");
  const [showAllAccountOrders,setShowAllAccountOrders]=useState(false);
  const [incentiveRep,setIncentiveRep]=useState("all");
  const [incentiveStatus,setIncentiveStatus]=useState("all");
  const [stage,setStage]=useState<(typeof stages)[number]>("All");
  const [selectedId,setSelectedId]=useState(initialId);
  const [accountPageId,setAccountPageId]=useState<string|null>(focusedAccountId);
  const [listPage,setListPage]=useState(1);
  const [createOpen,setCreateOpen]=useState(false);
  const [manageOpen,setManageOpen]=useState(false);
  const [taxOpen,setTaxOpen]=useState(false);
  const [taxForm,setTaxForm]=useState<TaxIdentityInput>({});
  const [taxErrors,setTaxErrors]=useState<TaxFieldErrors>({});
  const [taxMessage,setTaxMessage]=useState("");
  const [createErrors,setCreateErrors]=useState<Record<string,string>>({});
  const [duplicateWarning,setDuplicateWarning]=useState<string|null>(null);
  const [form,setForm]=useState(blankForm);
  const [newNickname,setNewNickname]=useState("");
  const [nicknames,setNicknames]=useState<Map<string,string>>(new Map());
  const [nicknameDraft,setNicknameDraft]=useState("");
  const [nicknameOpen,setNicknameOpen]=useState(false);
  const [nicknameError,setNicknameError]=useState("");
  const [nicknameSaving,setNicknameSaving]=useState(false);
  const [commercialForm,setCommercialForm]=useState<CommercialForm>({premiseType:"Unclassified",businessType:"",categoryReviewDate:"",streetAddress:"",location:"",postalCode:"",deliveryAddressSameAsBusiness:true,deliveryStreetAddress:"",deliveryLocation:"",deliveryPostalCode:""});
  const [handoffTo,setHandoffTo]=useState("");
  const [handoffReason,setHandoffReason]=useState("");

  useEffect(()=>{if(focusId)window.sessionStorage.removeItem("momentum-focus-record")},[focusId]);
  useEffect(()=>{
    let active=true;
    if(!currentUser||currentUser.role==="Customer")return;
    loadPrivateAccountNicknames(currentUser.id,scope.accounts.map(a=>a.id)).then(values=>{if(active)setNicknames(values)}).catch(()=>{if(active)setNicknameError("Private nicknames could not load.")});
    return()=>{active=false};
  },[currentUser?.id]);

  // An account with real orders stays open even when a legacy stage has not been advanced.
  // Qualified and Sampled remain in the Prospects view; no historic stage is rewritten.
  const orderedAccountIds=useMemo(()=>new Set(scope.orders.filter((order)=>order.status!=="Cancelled"&&order.status!=="Draft").map((order)=>order.accountId)),[scope.orders]);
  const filtered=useMemo(()=>{const normalized=query.trim().toLowerCase();return scope.accounts.filter((account)=>{
    const isOpenAccount=isOpenCommercialAccount(account,orderedAccountIds);
    const matchesStage=stage==="All"||(stage==="Prospect"?!isOpenAccount:isOpenAccount);
    if(!matchesStage||(tab==="unassigned"&&account.ownerId))return false;
    if(!normalized)return true;
    const territory=territoryForPostalCode(data,account.postalCode);
    return [account.name,account.locationName,account.location,account.streetAddress,account.postalCode,account.deliveryStreetAddress,account.deliveryLocation,account.deliveryPostalCode,territory?.name,account.channel,account.businessType,account.contactName,account.phone,account.mobilePhone,account.fax,account.email].join(" ").toLowerCase().includes(normalized);
  }).sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:"base"})||(a.locationName??a.location).localeCompare(b.locationName??b.location,undefined,{sensitivity:"base"}))},[data,orderedAccountIds,query,scope.accounts,stage,tab]);
  const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
  const visibleAccounts=filtered.slice((Math.min(listPage,totalPages)-1)*pageSize,Math.min(listPage,totalPages)*pageSize);
  const selected=scope.accounts.find((account)=>account.id===(accountPageId??selectedId))??filtered[0];
  const selectedCustomer=(data.customers??[]).find(customer=>customer.id===selected?.customerId);
  const selectedTerritory=selected?territoryForPostalCode(data,selected.postalCode):undefined;
  const suggestedRep=selectedTerritory?.ownerId?data.users.find((user)=>user.id===selectedTerritory.ownerId):undefined;
  const responsible=data.users.find((user)=>user.id===selected?.ownerId);
  const accountActivities=scope.activities.filter((activity)=>activity.accountId===selected?.id);
  const accountOrders=scope.orders.filter((order)=>order.accountId===selected?.id).sort((a,b)=>b.placedAt.localeCompare(a.placedAt));
  const siblingLocations=selected?.customerId?scope.accounts.filter((account)=>account.customerId===selected.customerId).sort((a,b)=>(a.locationName??a.location).localeCompare(b.locationName??b.location)):[];
  const selectedPricing=selected&&(accountPageId||isCustomer(currentUser))?evaluatePartnerPricing(data,selected.id):null;
  const scopeAccountIds=useMemo(()=>new Set(scope.accounts.map((account)=>account.id)),[scope.accounts]);
  // Pricing and milestone computation scales with order history. Never run either while browsing the account list.
  const bonusSignals=useMemo(()=>tab==="incentives"?evaluateSalesRepAccountBonuses(data).filter((signal)=>scopeAccountIds.has(signal.accountId)):[],[data,scopeAccountIds,tab]);
  const pricingRows=useMemo(()=>tab==="pricing"?scope.accounts.map((account)=>({account,pricing:evaluatePartnerPricing(data,account.id)})):[],[data,scope.accounts,tab]);
  const earnedBonus=bonusSignals.filter((signal)=>signal.status==="Earned").reduce((sum,signal)=>sum+signal.amount,0);
  const qualifyingAccounts=new Set(bonusSignals.filter((signal)=>signal.status==="Earned").map((signal)=>signal.accountId)).size;
  const repBonusSummary=data.users.filter((user)=>user.role==="Sales Representative").map((user)=>{
    const signals=bonusSignals.filter((signal)=>signal.repId===user.id);
    return {user,earnedMilestones:signals.filter((signal)=>signal.status==="Earned").length,
      qualifyingAccounts:new Set(signals.filter((signal)=>signal.status==="Earned").map((signal)=>signal.accountId)).size,
      earnedAmount:signals.filter((signal)=>signal.status==="Earned").reduce((total,signal)=>total+signal.amount,0),
      pendingAmount:signals.filter((signal)=>["Tracking","Awaiting payment"].includes(signal.status)).reduce((total,signal)=>total+signal.amount,0)};
  }).filter((row)=>row.earnedMilestones||row.pendingAmount);
  const visibleBonusSignals=bonusSignals.filter((signal)=>
    (incentiveRep==="all"||signal.repId===incentiveRep)&&
    (incentiveStatus==="all"||signal.status===incentiveStatus));

  const paidCases=accountOrders.filter((order)=>order.paymentStatus==="Paid").reduce((sum,order)=>sum+order.cases,0);
  const openOrderValue=accountOrders.filter((order)=>order.paymentStatus!=="Paid").reduce((sum,order)=>sum+order.amount,0);
  const canEditCommercial=Boolean(currentUser&&["Administrator","Sales Manager","Sales Representative"].includes(currentUser.role));
  const canManagePricing=Boolean(currentUser&&["Administrator","Sales Manager"].includes(currentUser.role));
  const canTransfer=Boolean(currentUser&&["Administrator","Sales Manager"].includes(currentUser.role));
  const territoryEnabled=territorySystemEnabled(data);
  const salesUsers=data.users.filter((user)=>user.employmentStatus!=="Separated"&&["Sales Representative","Sales Manager"].includes(user.role));
  const handoffTarget=data.users.find((user)=>user.id===handoffTo);
  const handoffDiffersFromSuggestion=Boolean(handoffTarget?.role==="Sales Representative"&&territoryEnabled&&selectedTerritory?.ownerId!==handoffTarget.id);

  const submit=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    const errors:Record<string,string>={...validateTaxIdentity(form)};
    // Full account identity is the licensed name; shorthand stays private.
    const legalName=form.legalBusinessName.trim();
    const accountInput={...form,name:legalName,customerName:legalName,locationName:legalName};
    if(!form.location.trim())errors.location="Enter the business city or market.";
    if(!/^\d{5}(?:-\d{4})?$/.test(form.postalCode.trim()))errors.postalCode="Enter a valid five-digit ZIP code.";
    if(!form.deliveryAddressSameAsBusiness){
      if(!form.deliveryStreetAddress.trim())errors.deliveryStreetAddress="Enter the delivery street address.";
      if(!form.deliveryLocation.trim())errors.deliveryLocation="Enter the delivery city or market.";
      if(!/^\d{5}(?:-\d{4})?$/.test(form.deliveryPostalCode.trim()))errors.deliveryPostalCode="Enter a valid delivery ZIP code.";
    }
    if(!form.contactName.trim())errors.contactName="Enter the primary contact name.";
    if(!form.contactRole.trim())errors.contactRole="Enter the contact's role.";
    if(!form.phone.trim()&&!form.mobilePhone.trim()&&!form.email.trim())errors.phone="Provide a business phone, mobile phone or email.";
    if(form.email.trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))errors.email="Enter a valid email address.";
    const validation=validateNewAccountContact(accountInput);
    if(!validation.ok&&!Object.keys(errors).length)errors.name=validation.message;
    setCreateErrors(errors);
    if(Object.keys(errors).length){setDuplicateWarning("Correct the highlighted fields before creating the account.");return;}
    const duplicate=findAccountDuplicate(data.accounts,accountInput);
    if(duplicate){setDuplicateWarning(`${duplicate.reason} Existing record: ${duplicate.account.locationName??duplicate.account.name} (${duplicate.account.location}). Open and edit that record instead.`);return;}
    const id=createAccount({...accountInput,taxDocumentType:form.taxDocumentType as "Undetermined"|"Taxable"|"Resale 5000A"|"Exemption 5000"});
    if(!id){setDuplicateWarning("Account was not created. Check the ZIP, territory exception, and duplicate-account rules.");return;}
    setSelectedId(id);setAccountPageId(id);setTab("accounts");
    setCreateOpen(false);setDuplicateWarning(null);setCreateErrors({});setForm(blankForm);
    if(newNickname.trim()&&currentUser){
      void savePrivateAccountNickname(currentUser.id,id,newNickname).then(value=>setNicknames(previous=>new Map(previous).set(id,value))).catch(()=>setNicknameError("Account created. Your personal nickname was not saved; edit it from the account profile."));
    }
    setNewNickname("");
  };
  const openAccountPage=(accountId:string)=>{setSelectedId(accountId);setAccountPageId(accountId);setShowAllAccountOrders(false)};
  const saveNickname=async()=>{
    if(!selected||!currentUser)return;
    setNicknameSaving(true);setNicknameError("");
    try{
      const value=await savePrivateAccountNickname(currentUser.id,selected.id,nicknameDraft);
      setNicknames(previous=>{const next=new Map(previous);if(value)next.set(selected.id,value);else next.delete(selected.id);return next});
      setNicknameOpen(false);
    }catch{setNicknameError("Nickname could not be saved. Try again.");}
    finally{setNicknameSaving(false)}
  };
  const changeTab=(next:AccountTab)=>{setTab(next);if(next!=="accounts")setAccountPageId(null)};
  const openLinkedPage=(page:"dispatch"|"orders",intent?:"new-order")=>{if(selected)window.sessionStorage.setItem("momentum-focus-record",selected.id);if(intent)window.sessionStorage.setItem("momentum-order-intent",intent);navigate(page)};
  const openTaxDetails=()=>{
    if(!selected||!selectedCustomer)return;
    setTaxForm({legalBusinessName:selectedCustomer.legalBusinessName??"",ein:selectedCustomer.ein??"",azTptLicenseNumber:selectedCustomer.azTptLicenseNumber??"",taxDocumentType:selectedCustomer.taxDocumentType??"Undetermined"});
    setTaxErrors({});setTaxMessage("");setTaxOpen(true);
  };
  const saveTaxDetails=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(!selectedCustomer)return;
    const errors=validateTaxIdentity(taxForm);
    setTaxErrors(errors);
    if(Object.keys(errors).length){setTaxMessage("Correct the highlighted business identity fields.");return;}
    const saved=updateCustomerCommercial(selectedCustomer.id,{
      legalBusinessName:taxForm.legalBusinessName?.trim(),
      ein:taxForm.ein?.trim(),
      azTptLicenseNumber:taxForm.azTptLicenseNumber?.trim(),
      taxDocumentType:taxForm.taxDocumentType as typeof selectedCustomer.taxDocumentType,
    });
    if(saved){setTaxOpen(false);setTaxMessage("");}
    else setTaxMessage("Not saved. Check your editing permissions and retry.");
  };
  const openManage=()=>{if(!selected)return;setCommercialForm({premiseType:selected.premiseType??"Unclassified",businessType:selected.businessType??selected.channel,categoryReviewDate:selected.categoryReviewDate??"",streetAddress:selected.streetAddress??"",location:selected.location,postalCode:selected.postalCode??"",deliveryAddressSameAsBusiness:selected.deliveryAddressSameAsBusiness!==false,deliveryStreetAddress:selected.deliveryStreetAddress??selected.streetAddress??"",deliveryLocation:selected.deliveryLocation??selected.location,deliveryPostalCode:selected.deliveryPostalCode??selected.postalCode??"",pricingTier:selected.pricingTier==="B"||selected.pricingTier==="C"?selected.pricingTier:undefined});setHandoffTo(selected.ownerId);setHandoffReason("");setManageOpen(true)};
  const saveCommercial=(event:FormEvent)=>{event.preventDefault();if(!selected)return;const common={premiseType:commercialForm.premiseType,businessType:commercialForm.businessType.trim()||selected.channel,categoryReviewDate:commercialForm.categoryReviewDate||undefined,...(canManagePricing?{streetAddress:commercialForm.streetAddress,location:commercialForm.location,postalCode:commercialForm.postalCode,deliveryAddressSameAsBusiness:commercialForm.deliveryAddressSameAsBusiness,...(!commercialForm.deliveryAddressSameAsBusiness?{deliveryStreetAddress:commercialForm.deliveryStreetAddress,deliveryLocation:commercialForm.deliveryLocation,deliveryPostalCode:commercialForm.deliveryPostalCode}: {})}: {})};const saved=updateAccountCommercial(selected.id,canManagePricing?{...common,pricingTier:commercialForm.pricingTier}:common);if(saved)setManageOpen(false)};
  const transfer=()=>{if(!selected||!handoffTo||handoffTo===selected.ownerId||!handoffReason.trim())return;const priorOwner=selected.ownerId;if(!transferAccountResponsibility(selected.id,handoffTo,handoffReason.trim()))return;recordResponsibility({locationId:selected.id,fromUserId:priorOwner,toUserId:handoffTo,reason:handoffReason.trim()});setHandoffReason("")};

  if(isCustomer(currentUser))return <div className="page page--accounts page--customer-account"><PageHeader title="My account" actions={<Button variant="gold" icon={<Plus size={17}/>} onClick={()=>openLinkedPage("orders","new-order")}>Place order</Button>}/>{selected?(()=>{const pricing=evaluatePartnerPricing(data,selected.id);const price=pricing.currentPricePerCase;return <div className="customer-account-layout"><section className="customer-account-card"><header><span><Building2 size={25}/></span><div><StatusPill tone={price?"success":"warning"}>{price?"Pricing active":"Pricing review"}</StatusPill><h2>{selected.name}</h2><p><MapPin size={14}/> {selected.location} · {selected.channel}</p></div></header><div className="customer-account-card__metrics"><div><span>Orders</span><strong>{accountOrders.length}</strong></div><div><span>Paid cases</span><strong>{paidCases}</strong></div><div><span>Current price</span><strong>{price?formatMoney(price):"Pricing review"}</strong></div></div></section><section className="customer-contact-card"><h3>Pricing</h3><p>{price?`${formatMoney(price)} per case. Your current account price is applied automatically when you place an order.`:"Online ordering is temporarily unavailable while current pricing is reviewed. Please contact your Momentum representative."}</p><h3>Contact</h3><div><span><UserRound size={18}/></span><p><strong>{selected.contactName||"Contact not yet recorded"}</strong><small>{selected.contactRole}</small></p></div>{selected.phone&&<a href={`tel:${selected.phone}`}><Phone size={16}/> {selected.phone}</a>}{selected.email&&<a href={`mailto:${selected.email}`}><Mail size={16}/> {selected.email}</a>}</section></div>})():<div className="list-empty">No account is linked to this customer login.</div>}</div>;

  return <div className="page page--accounts">
    {(tab==="accounts"||tab==="unassigned")&&accountPageId&&selected?<>
      <PageHeader title={selected.name} actions={<div className="account-detail__actions"><Button variant="ghost" icon={<ArrowLeft size={16}/>} onClick={()=>setAccountPageId(null)}>Back to accounts</Button>{canClaimUnassignedProspect(currentUser,selected)&&<Button variant="gold" onClick={()=>{claimUnassignedProspect(selected.id)}}>Claim prospect</Button>}{canEditCommercial&&<Button variant="secondary" onClick={openManage}>Account details</Button>}<Button icon={<CalendarPlus size={15}/>} onClick={()=>openLinkedPage("dispatch")}>Schedule</Button><Button variant="gold" icon={<Plus size={15}/>} onClick={()=>openLinkedPage("orders","new-order")}>Draft order</Button></div>}/>
      <div className="account-profile-page">
        <section className="account-profile-page__hero"><div className="account-profile-page__identity"><span className="account-detail__logo"><Building2 size={24}/></span><div><StatusPill tone={stageTone(selected.stage)}>{stageDisplay(selected.stage)}</StatusPill><h2>{nicknames.get(selected.id)||selected.locationName||selected.name}</h2><p><MapPin size={14}/> {selected.streetAddress?`${selected.streetAddress}, `:""}{selected.location}{selected.postalCode?` ${selected.postalCode}`:""}</p></div></div><div className="account-profile-page__owner"><span>Responsible</span>{responsible?<div><Avatar initials={responsible.initials} color={responsible.accent} size="sm"/><strong>{responsible.name}</strong></div>:<strong>Unassigned</strong>}</div></section>
        <div className="account-profile-page__metrics"><div><span>Paid cases</span><strong>{paidCases}</strong><small>Cleared orders only</small></div><div><span>Orders</span><strong>{accountOrders.length}</strong><small>{formatMoney(openOrderValue)} still open</small></div><div><span>Reorders</span><strong>{selected.reorderCount}</strong><small>Recorded account history</small></div><div><span>Geographic suggestion</span><strong>{selectedTerritory?.name??"Outside configured map"}</strong><small>{suggestedRep?`Suggested rep: ${suggestedRep.name}`:selected.postalCode?`ZIP ${selected.postalCode} has no configured suggestion`:"ZIP missing"}</small></div><div><span>Pricing</span><strong>{selectedPricing?.effectiveTier?`Tier ${selectedPricing.effectiveTier}`:"Pricing setup required"}</strong><small>{selectedPricing?.currentPricePerCase?`${formatMoney(selectedPricing.currentPricePerCase)}/case · ${selectedPricing.status}`:selectedPricing?.status??"Not started"}</small></div></div>
        <div className="account-profile-page__grid">
          <Section title="Recent activity"><div className="next-action-card"><div><strong>{selected.lastActivity||"No activity logged"}</strong><p>Responsible: {responsible?.name??"Unassigned"}</p></div></div></Section>
          <Section title="Legal business & Arizona tax details">{nicknameError&&<p role="alert" className="form-validation-notice">{nicknameError}</p>}<div className="account-nickname-inline"><span>My nickname: {nicknames.get(selected.id)||"None"}</span><Button size="sm" variant="secondary" onClick={()=>{setNicknameDraft(nicknames.get(selected.id)||"");setNicknameError("");setNicknameOpen(true)}}>Edit nickname</Button></div><dl className="account-profile-facts">
            <div><dt>Legal business name</dt><dd>{selectedCustomer?.legalBusinessName||"Not collected"}</dd></div>
            <div><dt>EIN</dt><dd>{selectedCustomer?.ein?"On file":"Not collected"}</dd></div>
            <div><dt>Arizona TPT license</dt><dd>{selectedCustomer?.azTptLicenseNumber||"Not collected"}</dd></div>
            <div><dt>Tax documentation</dt><dd>{selectedCustomer?.taxDocumentType??"Undetermined"} · {selectedCustomer?.taxExemptionStatus??"Not verified"}</dd></div>
          </dl>{selectedCustomer&&taxIdentityMissing(selectedCustomer).length>0&&<p className="form-validation-notice">Missing: {taxIdentityMissing(selectedCustomer).join("; ")}.</p>}
          {canEditCommercial&&selectedCustomer&&<Button size="sm" variant="secondary" onClick={openTaxDetails}>Edit business identity</Button>}</Section>
          <Section title="Primary contact"><div className="account-profile-contact"><div className="contact-card"><span><UserRound size={17}/></span><div><strong>{selected.contactName||"Contact not yet recorded"}</strong><p>{selected.contactRole}</p></div></div>{selected.phone&&<a href={`tel:${selected.phone}`}><Phone size={15}/> Business: {selected.phone}</a>}{selected.mobilePhone&&<a href={`tel:${selected.mobilePhone}`}><Phone size={15}/> Mobile: {selected.mobilePhone}</a>}{selected.fax&&<span><Phone size={15}/> Fax: {selected.fax}</span>}{selected.email&&<a href={`mailto:${selected.email}`}><Mail size={15}/> {selected.email}</a>}</div></Section>
          <Section title="Account details"><dl className="account-profile-facts"><div><dt>Stage</dt><dd><StatusPill tone={stageTone(selected.stage)}>{stageDisplay(selected.stage)}</StatusPill></dd></div><div><dt>Geographic suggestion</dt><dd>{selectedTerritory?`${selectedTerritory.name}${suggestedRep?` · ${suggestedRep.name}`:""}`:"Outside configured suggestion map"}</dd></div><div><dt>Responsible rep</dt><dd>{responsible?.name??"Unassigned"}</dd></div><div><dt>Business address</dt><dd>{businessAddressLabel(selected)||"Missing"}</dd></div><div><dt>Delivery address</dt><dd>{deliveryAddressLabel(selected)||"Missing"}{selected.deliveryAddressSameAsBusiness!==false?" · same as business":""}</dd></div><div><dt>ZIP</dt><dd>{selected.postalCode??"Missing"}</dd></div><div><dt>Channel</dt><dd>{selected.channel}</dd></div><div><dt>Premise</dt><dd>{selected.premiseType??"Unclassified"}</dd></div><div><dt>Business type</dt><dd>{selected.businessType??selected.channel}</dd></div><div><dt>Current pricing</dt><dd>{selectedPricing?.effectiveTier&&selectedPricing.currentPricePerCase?`Tier ${selectedPricing.effectiveTier} · ${formatMoney(selectedPricing.currentPricePerCase)}/case`:"Pricing setup required"}</dd></div><div><dt>Outside-Partner fallback</dt><dd>{selected.pricingTier==="B"||selected.pricingTier==="C"?`Tier ${selected.pricingTier} · ${formatMoney(ACCOUNT_PRICING_TIERS[selected.pricingTier].pricePerCase)}/case`:"Not assigned"}</dd></div><div><dt>Category review</dt><dd>{selected.categoryReviewDate?formatDate(selected.categoryReviewDate,{month:"short",day:"numeric",year:"numeric"}):"Not scheduled"}</dd></div></dl></Section>
          <Section title="Associated locations" description="Linked locations share a billing customer while keeping separate delivery addresses, orders and inventory records.">
            <div className="account-profile-list">{siblingLocations.map((location)=><button type="button" key={location.id} onClick={()=>openAccountPage(location.id)}><strong>{location.locationName??location.name}{location.id===selected.id?" · Current location":""}</strong><span>{deliveryAddressLabel(location)||"Delivery address missing"}</span></button>)}</div>
            {!selected.customerId&&<p>No parent customer association is recorded. Ask Operations to verify this legacy account before adding locations.</p>}
          </Section>
        </div>
        <CrmDepthPanel accountId={selected.id} view="relationships"/>
        <Section title="Order history"><div className="account-profile-orders">{accountOrders.slice(0,showAllAccountOrders?undefined:10).map((order)=><button key={order.id} onClick={()=>{window.sessionStorage.setItem("momentum-focus-record",order.id);navigate("orders")}}><span><strong>{order.number}</strong><small>{order.product??"Golden Eagle"} · Placed by {data.users.find((user)=>user.id===order.ownerId)?.name??order.ownerId}</small></span><span>{formatDate(order.placedAt,{month:"short",day:"numeric",year:"numeric"})}</span><span>{order.cases} cases</span><span>{formatMoney(order.amount)}</span><StatusPill tone={order.paymentStatus==="Paid"?"success":order.status==="Draft"?"warning":"info"}>{order.paymentStatus==="Paid"?"Paid":order.status}</StatusPill><ChevronRight size={16}/></button>)}{accountOrders.length===0&&<div className="review-empty"><Store size={21}/><p>No orders are linked to this account yet.</p></div>}</div>{accountOrders.length>10&&<Button type="button" variant="secondary" size="sm" onClick={()=>setShowAllAccountOrders((value)=>!value)}>{showAllAccountOrders?"Show first 10 orders":`View all ${accountOrders.length} orders`}</Button>}</Section>
        <CrmDepthPanel accountId={selected.id} view="engagement"/>
        <div className="account-profile-page__grid account-profile-page__grid--history"><details className="crm-collapsed-history"><summary>Account activity · {accountActivities.length} entries (expand to review)</summary><Section title="Activity"><div className="mini-timeline">{accountActivities.slice(0,8).map((activity)=><article key={activity.id}><i/><div><strong>{activity.title}</strong><p>{activity.detail}</p><small>{formatDate(activity.at,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</small></div></article>)}</div></Section></details><Section title="Internal note"><div className="account-profile-note"><p>{selected.notes||"No internal note recorded."}</p></div></Section></div>
        <RecordHistory accountId={selected.id}/>
      </div>
    </>:<>
      <PageHeader title="Sales & accounts" actions={canCreateAccount(currentUser)?<Button variant="gold" icon={<Plus size={17}/>} onClick={()=>{setDuplicateWarning(null);setCreateOpen(true)}}>New account</Button>:undefined}/>
      <div className="company-tabs"><button className={tab==="accounts"?"is-active":""} onClick={()=>changeTab("accounts")}>Accounts</button><button className={tab==="unassigned"?"is-active":""} onClick={()=>{setTab("unassigned");setAccountPageId(null);setListPage(1);setStage("All")}}>Unassigned accounts <i>{scope.accounts.filter((account)=>!account.ownerId).length}</i></button><button className={tab==="pricing"?"is-active":""} onClick={()=>changeTab("pricing")}>Pricing</button><button className={tab==="incentives"?"is-active":""} onClick={()=>changeTab("incentives")}>Sales incentives {tab==="incentives"&&<i>{bonusSignals.filter((s)=>s.status==="Earned").length}</i>}</button></div>
      {(tab==="accounts"||tab==="unassigned")&&<><div className="account-toolbar"><label className="table-search"><Search size={17}/><input value={query} onChange={(event)=>{setQuery(event.target.value);setListPage(1)}} placeholder="Search name, buyer, address, phone, ZIP…"/></label><div className="stage-filters" role="group" aria-label="Filter by stage">{stages.map((item)=><button key={item} className={stage===item?"is-active":""} onClick={()=>{setStage(item);setListPage(1)}}>{stageFilterDisplay(item)}</button>)}</div></div><section className="account-list-panel account-list-panel--full"><div className="list-summary"><span><strong>{filtered.length}</strong> accounts</span><small>{filtered.length>pageSize?`Showing ${((listPage-1)*pageSize)+1}-${Math.min(listPage*pageSize,filtered.length)}`:"Select an account to open it"}</small></div><div className="account-table account-table--head"><span>Account</span><span>Stage</span><span>Responsible</span><span>Next action</span><span/></div><div className="account-table-body">{visibleAccounts.map((account)=>{const accountResponsible=data.users.find((user)=>user.id===account.ownerId);const territory=territoryForPostalCode(data,account.postalCode);return <button className="account-table" key={account.id} onClick={()=>openAccountPage(account.id)}><span className="account-name-cell"><i><Store size={17}/></i><span><strong>{nicknames.get(account.id)||account.name}</strong><small>{account.streetAddress?`${account.streetAddress} · `:""}{account.location}{account.postalCode?` ${account.postalCode}`:""} · {territory?`Suggestion: ${territory.name}`:"Outside suggestion map"}</small></span></span><span><StatusPill tone={stageTone(account.stage)}>{account.stage}</StatusPill></span><span className="account-owner-cell">{accountResponsible&&<><Avatar initials={accountResponsible.initials} color={accountResponsible.accent} size="sm"/><span>{accountResponsible.firstName}</span></>}</span><span className="account-action-cell"><strong>{account.nextAction}</strong><small>{formatDate(account.nextActionDate,{month:"short",day:"numeric"})}</small></span><ChevronRight size={17}/></button>})}{filtered.length===0&&<div className="list-empty">No accounts match these filters. For existing customers, ask a manager to assign responsibility.</div>}</div>{totalPages>1&&<div className="account-pagination"><Button size="sm" variant="ghost" icon={<ChevronLeft size={15}/>} disabled={listPage<=1} onClick={()=>setListPage((page)=>Math.max(1,page-1))}>Previous</Button><span>Page {Math.min(listPage,totalPages)} of {totalPages}</span><Button size="sm" variant="ghost" disabled={listPage>=totalPages} onClick={()=>setListPage((page)=>Math.min(totalPages,page+1))}>Next <ChevronRight size={15}/></Button></div>}</section></>}
      {tab==="pricing"&&<><div className="company-rule-facts"><div><span>Tier A · Partner</span><strong>{formatMoney(ACCOUNT_PRICING_TIERS.A.pricePerCase)}/case</strong></div><div><span>Tier B</span><strong>{formatMoney(ACCOUNT_PRICING_TIERS.B.pricePerCase)}/case</strong></div><div><span>Tier C</span><strong>{formatMoney(ACCOUNT_PRICING_TIERS.C.pricePerCase)}/case</strong></div><div><span>Partner continuation</span><strong>20 paid cases</strong><small>Per eligibility period</small></div></div><Section title="Account pricing"><div className="bonus-ledger">{pricingRows.map(({account,pricing})=><article key={account.id}><div className="bonus-ledger__head"><div><small>{account.location}</small><strong>{account.name}</strong><p>{pricing.effectiveTier&&pricing.currentPricePerCase?`Current: Tier ${pricing.effectiveTier} · ${formatMoney(pricing.currentPricePerCase)}/case · ${pricing.status}`:"Current pricing requires B/C setup"}</p></div><StatusPill tone={pricingTone(pricing.status)}>{pricing.effectiveTier?`Tier ${pricing.effectiveTier}`:pricing.status}</StatusPill></div><div className="bonus-ledger__foot"><span>{pricing.countedCases}/{pricing.thresholdCases} paid cases in tracked period</span><span>{account.pricingTier==="B"||account.pricingTier==="C"?`Outside fallback: Tier ${account.pricingTier}`:"Outside fallback not assigned"}</span><span>{pricing.nextReviewDate?`Eligibility review ${formatDate(pricing.nextReviewDate,{month:"short",day:"numeric",year:"numeric"})}`:account.categoryReviewDate?`Category review ${formatDate(account.categoryReviewDate,{month:"short",day:"numeric",year:"numeric"})}`:"Review date not set"}</span></div></article>)}</div></Section></>}
      {tab==="incentives"&&<>
        <p className="form-callout">Eligibility is calculated from CRM orders and settlement evidence. <strong>Earned does not mean paid.</strong> Payroll remains the authority for approved bonuses, prior disbursements and adjustments.</p>
        <div className="company-rule-facts"><div><span>Qualifying accounts</span><strong>{qualifyingAccounts}</strong><small>Distinct accounts with an earned milestone</small></div><div><span>Earned milestones</span><strong>{bonusSignals.filter((signal)=>signal.status==="Earned").length}</strong><small>Milestones, not payments</small></div></div>
        <Section title="Bonuses by Sales Rep" description="Distinct qualifying customer accounts and earned milestones are counted separately."><div className="company-grid company-grid--two">{repBonusSummary.map((row)=><article key={row.user.id} className="company-rule-facts"><div><strong>{row.user.name}</strong><small>{row.qualifyingAccounts} qualifying accounts · {row.earnedMilestones} earned milestones</small></div><div><span>Earned</span><strong>{formatMoney(row.earnedAmount)}</strong><small>Verify against payroll before payment</small></div><div><span>Still tracking / awaiting payment</span><strong>{formatMoney(row.pendingAmount)}</strong><small>Not yet earned</small></div></article>)}</div>{!repBonusSummary.length&&<p>No bonus-eligible rep milestones yet.</p>}</Section>
        <div className="account-toolbar"><label>Sales Rep <select value={incentiveRep} onChange={(event)=>setIncentiveRep(event.target.value)}><option value="all">All reps</option>{data.users.filter((user)=>user.role==="Sales Representative").map((user)=><option key={user.id} value={user.id}>{user.name}</option>)}</select></label><label>Milestone status <select value={incentiveStatus} onChange={(event)=>setIncentiveStatus(event.target.value)}><option value="all">All statuses</option>{["Earned","Awaiting payment","Tracking","Not started","Window expired","Not qualified"].map((value)=><option key={value} value={value}>{value}</option>)}</select></label></div>
        <div className="company-rule-facts"><div><span>Opening threshold</span><strong>{SALES_REP_ACCOUNT_BONUS_RULE.openingOrderCases} cases</strong><small>{formatMoney(SALES_REP_ACCOUNT_BONUS_RULE.openingBonusAmount)} after payment clears</small></div><div><span>Sustained threshold</span><strong>{SALES_REP_ACCOUNT_BONUS_RULE.sustainedAccountCases} paid cases</strong><small>{formatMoney(SALES_REP_ACCOUNT_BONUS_RULE.sustainedBonusAmount)}</small></div><div><span>Window</span><strong>{SALES_REP_ACCOUNT_BONUS_RULE.windowDays} days</strong></div><div><span>Earned in scope</span><strong>{formatMoney(earnedBonus)}</strong></div></div><Section title="Account milestone ledger"><div className="bonus-ledger">{visibleBonusSignals.map((signal)=>{const account=data.accounts.find((item)=>item.id===signal.accountId);const rep=data.users.find((item)=>item.id===signal.repId);const progress=Math.min(100,Math.round((signal.observedCases/Math.max(1,signal.thresholdCases))*100));return <article key={signal.id}><div className="bonus-ledger__head"><div><small>{signal.milestone}</small><strong>{account?.name}</strong><p>{rep?.name} · {signal.observedCases}/{signal.thresholdCases} cases</p></div><StatusPill tone={bonusTone(signal.status)}>{signal.status}</StatusPill></div><div className="bonus-progress"><i style={{width:`${progress}%`}}/></div><div className="bonus-ledger__foot"><span>Amount {formatMoney(signal.amount)}</span><span>{signal.windowEnd?`Through ${formatDate(signal.windowEnd,{month:"short",day:"numeric",year:"numeric"})}`:"Not started"}</span></div></article>})}{!visibleBonusSignals.length&&<p>No milestones match these filters.</p>}</div></Section></>}
    </>}

    <Modal open={createOpen} title="Create account" onClose={()=>{setCreateOpen(false);setDuplicateWarning(null)}} footer={<><Button variant="ghost" onClick={()=>{setCreateOpen(false);setDuplicateWarning(null)}}>Cancel</Button><Button type="submit" form="new-account-form">Create account</Button></>}><form id="new-account-form" className="form-grid" noValidate onChangeCapture={()=>setCreateErrors({})} onSubmit={submit}>{duplicateWarning&&<div className="form-callout field--full"><AlertTriangle size={17}/><p>{duplicateWarning}</p></div>}
<Field label="Legal business name" error={createErrors.legalBusinessName}><input required value={form.legalBusinessName} onChange={event=>setForm({...form,legalBusinessName:event.target.value})} placeholder="Same as business license"/></Field>
<Field label="Federal EIN (if available)" error={createErrors.ein} hint="Nine digits. Not a substitute for a resale certificate."><input inputMode="numeric" autoComplete="off" value={form.ein} onChange={event=>setForm({...form,ein:event.target.value})} placeholder="XX-XXXXXXX"/></Field>
<Field label="Arizona TPT license number" error={createErrors.azTptLicenseNumber} hint="Eight-digit AZ TPT license number."><input inputMode="numeric" autoComplete="off" value={form.azTptLicenseNumber} onChange={event=>setForm({...form,azTptLicenseNumber:event.target.value})} placeholder="12345678"/></Field>
<Field label="Tax documentation route" error={createErrors.taxDocumentType}><select value={form.taxDocumentType} onChange={event=>setForm({...form,taxDocumentType:event.target.value})}><option value="Undetermined">Undetermined / collect documentation</option><option value="Taxable">Taxable purchase</option><option value="Resale 5000A">Resale certificate (AZ 5000A)</option><option value="Exemption 5000">General exemption certificate (AZ 5000)</option></select></Field>
<Field label="Personal nickname (optional)" hint="Only you can see this shorthand."><input maxLength={80} value={newNickname} onChange={event=>setNewNickname(event.target.value)} placeholder="My shorthand"/></Field><Field label="Business city / market" error={createErrors.location}><input required value={form.location} onChange={(event)=>{setDuplicateWarning(null);setForm({...form,location:event.target.value})}}/></Field><Field label="Business street address"><input value={form.streetAddress} onChange={(event)=>{setDuplicateWarning(null);setForm({...form,streetAddress:event.target.value})}} placeholder="1234 W Example Ave, Suite 100"/></Field><Field label="Business ZIP code" error={createErrors.postalCode}><input required inputMode="numeric" pattern="[0-9]{5}(?:-[0-9]{4})?" value={form.postalCode} onChange={(event)=>{setDuplicateWarning(null);setForm({...form,postalCode:event.target.value})}} placeholder="85016"/></Field><div className="field--full account-address-toggle"><label><input type="checkbox" checked={form.deliveryAddressSameAsBusiness} onChange={(event)=>{const same=event.target.checked;setForm({...form,deliveryAddressSameAsBusiness:same,...(!same?{deliveryStreetAddress:form.deliveryStreetAddress||form.streetAddress,deliveryLocation:form.deliveryLocation||form.location,deliveryPostalCode:form.deliveryPostalCode||form.postalCode}: {})})}}/><span>Delivery address is the same as business address</span></label></div>{!form.deliveryAddressSameAsBusiness&&<><Field label="Delivery city / market" error={createErrors.deliveryLocation}><input required value={form.deliveryLocation} onChange={(event)=>setForm({...form,deliveryLocation:event.target.value})}/></Field><Field label="Delivery street address" error={createErrors.deliveryStreetAddress}><input required value={form.deliveryStreetAddress} onChange={(event)=>setForm({...form,deliveryStreetAddress:event.target.value})} placeholder="1234 W Example Ave, Suite 100"/></Field><Field label="Delivery ZIP code" error={createErrors.deliveryPostalCode}><input required inputMode="numeric" pattern="[0-9]{5}(?:-[0-9]{4})?" value={form.deliveryPostalCode} onChange={(event)=>setForm({...form,deliveryPostalCode:event.target.value})} placeholder="85016"/></Field></>}<Field label="Channel"><select value={form.channel} onChange={(event)=>setForm({...form,channel:event.target.value})}><option>Independent retail</option><option>Convenience store</option><option>Restaurant / nightlife</option><option>Gym / fitness</option><option>Vending</option><option>Distributor</option></select></Field><Field label="Primary contact" error={createErrors.contactName}><input required value={form.contactName} onChange={(event)=>setForm({...form,contactName:event.target.value})}/></Field><Field label="Contact role" error={createErrors.contactRole}><input required value={form.contactRole} onChange={(event)=>setForm({...form,contactRole:event.target.value})}/></Field><Field label="Business phone" error={createErrors.phone} hint="Business phone, mobile, or email is required."><input type="tel" value={form.phone} onChange={(event)=>{setDuplicateWarning(null);setForm({...form,phone:event.target.value})}}/></Field><Field label="Mobile phone" error={createErrors.mobilePhone}><input type="tel" value={form.mobilePhone} onChange={(event)=>{setDuplicateWarning(null);setForm({...form,mobilePhone:event.target.value})}}/></Field><Field label="Fax"><input type="tel" value={form.fax} onChange={(event)=>setForm({...form,fax:event.target.value})}/></Field><Field label="Email" error={createErrors.email} hint="Optional when a business or mobile phone number is provided."><input type="email" value={form.email} onChange={(event)=>{setDuplicateWarning(null);setForm({...form,email:event.target.value})}}/></Field></form></Modal>

    <Modal open={nicknameOpen} title="My account nickname" onClose={()=>setNicknameOpen(false)} footer={<><Button variant="ghost" onClick={()=>setNicknameOpen(false)}>Cancel</Button><Button disabled={nicknameSaving||nicknameDraft.length>80} onClick={()=>void saveNickname()}>{nicknameSaving?"Saving…":"Save nickname"}</Button></>}><div className="form-grid"><Field className="field--full" label="Private nickname" error={nicknameError}><input maxLength={80} value={nicknameDraft} onChange={event=>setNicknameDraft(event.target.value)} placeholder="Your shorthand"/></Field></div></Modal>
    <Modal open={taxOpen} title="Legal business & tax identity" onClose={()=>{setTaxOpen(false);setTaxMessage("");}} footer={<><Button variant="ghost" onClick={()=>setTaxOpen(false)}>Cancel</Button><Button type="submit" form="account-identity-form">Save identity</Button></>}>
      <form id="account-identity-form" className="form-grid" noValidate onChangeCapture={()=>setTaxErrors({})} onSubmit={saveTaxDetails}>
        {taxMessage&&<div className="form-validation-notice field--full" role="alert">{taxMessage}</div>}
        <Field label="Legal business name" error={taxErrors.legalBusinessName}><input required placeholder="Same as business license" value={taxForm.legalBusinessName??""} onChange={event=>setTaxForm({...taxForm,legalBusinessName:event.target.value})}/></Field>
        <Field label="Federal EIN" error={taxErrors.ein}><input inputMode="numeric" autoComplete="off" value={taxForm.ein??""} onChange={event=>setTaxForm({...taxForm,ein:event.target.value})} placeholder="XX-XXXXXXX"/></Field>
        <Field label="Arizona TPT license number" error={taxErrors.azTptLicenseNumber}><input inputMode="numeric" autoComplete="off" value={taxForm.azTptLicenseNumber??""} onChange={event=>setTaxForm({...taxForm,azTptLicenseNumber:event.target.value})} placeholder="12345678"/></Field>
        <Field label="Tax documentation route" error={taxErrors.taxDocumentType}><select value={taxForm.taxDocumentType??"Undetermined"} onChange={event=>setTaxForm({...taxForm,taxDocumentType:event.target.value})}><option value="Undetermined">Undetermined / documentation pending</option><option value="Taxable">Taxable purchase</option><option value="Resale 5000A">Resale certificate (AZ 5000A)</option><option value="Exemption 5000">General exemption certificate (AZ 5000)</option></select></Field>
        
      </form>
    </Modal>

    <Modal open={manageOpen} title="Account details" onClose={()=>setManageOpen(false)} footer={<><Button variant="ghost" onClick={()=>setManageOpen(false)}>Cancel</Button><Button type="submit" form="account-commercial-form">Save changes</Button></>}><form id="account-commercial-form" className="form-grid" onSubmit={saveCommercial}>{canManagePricing&&<Field label="Outside-Partner fallback tier" hint="Tier A is assigned automatically while Partner Pricing is active. Choose only the authorized fallback used when Partner eligibility is inactive."><select value={commercialForm.pricingTier??""} onChange={(event)=>setCommercialForm({...commercialForm,pricingTier:event.target.value?event.target.value as PricingTier:undefined})}><option value="">Not assigned</option><option value="B">Tier B · {formatMoney(ACCOUNT_PRICING_TIERS.B.pricePerCase)}/case</option><option value="C">Tier C · {formatMoney(ACCOUNT_PRICING_TIERS.C.pricePerCase)}/case</option></select></Field>}{canManagePricing&&<><Field label="Business city / market"><input required value={commercialForm.location} onChange={(event)=>setCommercialForm({...commercialForm,location:event.target.value})}/></Field><Field label="Business street address"><input required value={commercialForm.streetAddress} onChange={(event)=>setCommercialForm({...commercialForm,streetAddress:event.target.value})}/></Field><Field label="Business ZIP code" hint="Changing the business ZIP updates the geographic suggestion only. It does not change the responsible representative automatically."><input required inputMode="numeric" pattern="[0-9]{5}(?:-[0-9]{4})?" value={commercialForm.postalCode} onChange={(event)=>setCommercialForm({...commercialForm,postalCode:event.target.value})}/></Field><div className="field--full account-address-toggle"><label><input type="checkbox" checked={commercialForm.deliveryAddressSameAsBusiness} onChange={(event)=>{const same=event.target.checked;setCommercialForm({...commercialForm,deliveryAddressSameAsBusiness:same,...(!same?{deliveryStreetAddress:commercialForm.deliveryStreetAddress||commercialForm.streetAddress,deliveryLocation:commercialForm.deliveryLocation||commercialForm.location,deliveryPostalCode:commercialForm.deliveryPostalCode||commercialForm.postalCode}: {})})}}/><span>Delivery address is the same as business address</span></label></div>{!commercialForm.deliveryAddressSameAsBusiness&&<><Field label="Delivery city / market"><input required value={commercialForm.deliveryLocation} onChange={(event)=>setCommercialForm({...commercialForm,deliveryLocation:event.target.value})}/></Field><Field label="Delivery street address"><input required value={commercialForm.deliveryStreetAddress} onChange={(event)=>setCommercialForm({...commercialForm,deliveryStreetAddress:event.target.value})}/></Field><Field label="Delivery ZIP code"><input required inputMode="numeric" pattern="[0-9]{5}(?:-[0-9]{4})?" value={commercialForm.deliveryPostalCode} onChange={(event)=>setCommercialForm({...commercialForm,deliveryPostalCode:event.target.value})}/></Field></>}</>}<Field label="Premise"><select value={commercialForm.premiseType} onChange={(event)=>setCommercialForm({...commercialForm,premiseType:event.target.value as PremiseType})}><option>Unclassified</option><option>On-premise</option><option>Off-premise</option><option>Hybrid</option></select></Field><Field label="Business type"><input value={commercialForm.businessType} onChange={(event)=>setCommercialForm({...commercialForm,businessType:event.target.value})} placeholder="Restaurant, bar, food truck, convenience store…"/></Field><Field label="Category review date"><input type="date" value={commercialForm.categoryReviewDate} onChange={(event)=>setCommercialForm({...commercialForm,categoryReviewDate:event.target.value})}/></Field>{canTransfer&&selected&&<div className="field--full account-handoff-form"><strong>Responsibility handoff</strong><p>{selectedTerritory?`Geographic suggestion: ${selectedTerritory.name}${suggestedRep?` recommends ${suggestedRep.name}`:""}. You may assign another authorized sales user; the reason remains part of the account history and a sales-rep deviation is documented for management review.`:"This ZIP has no configured geographic suggestion. Assignment is still allowed; document the reason so responsibility remains clear."}</p>{handoffDiffersFromSuggestion?<div className="form-callout"><AlertTriangle size={17}/><p>This assignment differs from the geographic suggestion. Momentum will document the exception instead of blocking the handoff.</p></div>:null}<div className="form-grid"><Field label="New responsible rep"><select value={handoffTo} onChange={(event)=>setHandoffTo(event.target.value)}><option value="">Select representative</option>{salesUsers.map((user)=><option key={user.id} value={user.id}>{user.name}</option>)}</select></Field><Field label="Reason"><input value={handoffReason} onChange={(event)=>setHandoffReason(event.target.value)} placeholder="Why this person should own the account"/></Field></div><Button type="button" variant="secondary" size="sm" disabled={!handoffReason.trim()||!handoffTo||handoffTo===selected.ownerId} onClick={transfer}>Transfer responsibility</Button></div>}</form></Modal>
  </div>
}
