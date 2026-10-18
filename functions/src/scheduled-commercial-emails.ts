/* eslint-disable max-len, comma-spacing, space-before-blocks, indent, keyword-spacing, key-spacing, brace-style, semi-spacing */
import {createHash} from "node:crypto";
import {getFirestore} from "firebase-admin/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {arizonaDateKey} from "./weekly-email-policy";
import {byId,items,number,row,text} from "./commercial-email-policy";
import {context,customerMail,repMail,writeIntent} from "./commercial-email-producers";

const hash=(textValue:string)=>createHash("sha256").update(textValue).digest("hex");
const nextDay=(day:string,days:number)=>{
  const date=new Date(day+"T12:00:00Z");
  if(Number.isNaN(date.getTime()))return "";
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
};

const commercialRoot=async ()=>{
  const snap=await getFirestore().doc("domains/commercial/fields/_root").get();
  return snap.data()?.data as Record<string,unknown>|undefined;
};

/**
 * Once daily, queue exactly-30-day active program pricing expiration warnings.
 * Customer notice goes to A/P, billing, then location; rep to active work email.
 */
export const sendProgramPricingWarnings=onSchedule({
  schedule:"0 10 * * *",
  timeZone:"America/Phoenix",
  region:"us-central1",
},async ()=>{
  if(process.env.RESEND_LIVE_EMAIL_ENABLED!=="true")return;
  const today=arizonaDateKey();
  const thirtyDayDate=nextDay(today,30);
  const state=await context();
  const root=await commercialRoot();
  const patches=row(root?.accountPatches)?root.accountPatches:{};
  for(const account of state.accounts){
    const patch=patches[text(account.id)];
    if(!row(patch))continue;
    const expires=text(account.programPricingExpirationDate);
    if(expires!==thirtyDayDate||
       text(account.programPricingStatus)!=="Active"||
       !Number.isFinite(number(account.programPricePerCase))||
       number(account.programPricePerCase)<=0)continue;
    const id=text(account.id);
    const eventId="pricing-30d:"+id+":"+expires;
    const note="Program pricing for "+
      (text(account.locationName)||text(account.name))+
      " is scheduled to expire on "+expires+
      ". Review your account for renewal or updated terms.";
    await customerMail(state,id,eventId,
      "program_pricing.expiring_30d.customer",
      "pricing_warning_customer","domains/commercial/fields/_root",
      id+":"+expires,
      "Momentum program pricing expires in 30 days",note);
    const owner=text(account.ownerId)||text(account.programPricingOwnerId);
    if(owner){
      await repMail(owner,id,eventId,
        "program_pricing.expiring_30d.rep",
        "pricing_warning_rep","domains/commercial/fields/_root",
        id+":"+expires,
        "Account pricing expires in 30 days",
        "The active program for "+(text(account.name)||id)+
        " expires on "+expires+". Review renewal and next steps.");
    }
  }
});

const warehouse="node-warehouse-main";
// Matched to WAREHOUSE_REORDER_THRESHOLD_CASES in lib/inventory-ledger.ts.
const reorderThreshold=500;

const inventoryStock=async ()=>{
  const db=getFirestore();
  const paths=[
    "domains/workspace/fields/inventory",
    "domains/commercial/fields/inventoryLots",
    "domains/inventoryLedger/fields/movements",
    "domains/inventoryLedger/fields/reservations",
  ];
  const docs=await db.getAll(...paths.map((path)=>db.doc(path)));
  const [base,extra,movements,reservations]=docs.map((doc)=>items(doc.data()));
  const all=[...extra,...base.filter((lot)=>
    !extra.some((other)=>text(other.id)===text(lot.id)))];
  const results=new Map<string,number>();
  for(const lot of all){
    const product=text(lot.product);
    const lotId=text(lot.id);
    if(!product||!lotId||text(lot.status)==="Quality hold")continue;
    const physical=movements.filter((movement)=>
      text(movement.lotId)===lotId&&number(movement.quantity)>0)
      .reduce((sum,movement)=>sum+
        (text(movement.toNodeId)===warehouse?number(movement.quantity):0)-
        (text(movement.fromNodeId)===warehouse?number(movement.quantity):0),0);
    const held=reservations.filter((reservation)=>
      text(reservation.lotId)===lotId&&
      text(reservation.status)==="Active")
      .reduce((sum,item)=>sum+Math.max(0,number(item.quantity)),0);
    results.set(product,(results.get(product)??0)+
      Math.max(0,physical-held));
  }
  return results;
};

const activeRecipients=async ()=>{
  const access=await getFirestore().collection("userAccess").get();
  return access.docs.filter((doc)=>
    doc.data().accountState==="Active"&&
    ["Administrator","Warehouse","Operations"].includes(doc.data().role)&&
    typeof doc.data().email==="string"&&doc.data().email.includes("@"));
};

/**
 * Daily product-level crossing monitor; first observation establishes baseline.
 * Alerts only on a new crossing below 500 sellable warehouse cases.
 */
export const sendInventoryReorderWarnings=onSchedule({
  schedule:"15 10 * * *",
  timeZone:"America/Phoenix",
  region:"us-central1",
},async ()=>{
  if(process.env.RESEND_LIVE_EMAIL_ENABLED!=="true")return;
  const db=getFirestore();
  const stock=await inventoryStock();
  const recipients=await activeRecipients();
  for(const [product,available] of stock){
    const id=hash(product.trim().toLowerCase());
    const ref=db.doc("notificationInventoryThreshold/"+id);
    const prior=await ref.get();
    const previous=prior.data();
    const low=available<reorderThreshold;
    const seq=typeof previous?.crossing==="number"?
      previous.crossing:0;
    // First run is intentionally a baseline, not a retroactive email blast.
    if(!prior.exists){
      await ref.create({product,low,crossing:0,available,
        updatedAt:new Date().toISOString()});
      continue;
    }
    if(low&&previous?.low!==true){
      const sourceId=id+":"+(seq+1);
      for(const recipient of recipients){
        const role=text(recipient.data().role);
        const email=text(recipient.data().email).toLowerCase();
        if(!email)continue;
        await writeIntent({
          policyId:"inventory.reorder_threshold",
          kind:"inventory_reorder",
          scopeId:sourceId,
          sourcePath:"domains/inventoryLedger/fields/movements",
          sourceRecordId:sourceId,
          recipient:email,
          recipientUid:recipient.id,
          eventId:"stock-crossing:"+sourceId,
          subject:"Momentum inventory reorder threshold reached",
          body:"Warehouse sellable stock for "+product+" is "+
            available+" cases, below the "+reorderThreshold+
            " case reorder threshold. Review current lots, "+
            "reservations, and purchasing needs in Momentum.",
          version:1,
        });
      }
      await ref.update({low:true,crossing:seq+1,available,
        updatedAt:new Date().toISOString()});
    }else if(!low&&previous?.low!==false){
      await ref.update({low:false,available,
        updatedAt:new Date().toISOString()});
    }else{
      await ref.update({available,updatedAt:new Date().toISOString()});
    }
  }
});
