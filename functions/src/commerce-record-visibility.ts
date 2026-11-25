/* eslint-disable max-len,comma-spacing,key-spacing,object-curly-spacing,space-before-blocks,keyword-spacing,curly,brace-style,semi-spacing,arrow-parens,one-var,indent,operator-linebreak,space-before-function-paren,require-jsdoc */
import {createHash} from "node:crypto";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {onRequest} from "firebase-functions/v2/https";

type Row=Record<string,unknown>;
const row=(v:unknown):v is Row=>Boolean(v&&typeof v==="object"&&!Array.isArray(v));
const str=(v:unknown)=>typeof v==="string"?v.trim():"";
const rows=(v:unknown):Row[]=>row(v)&&Array.isArray(v.items)?v.items.filter(row):[];
const kinds=["order","invoice","payment"];
const validId=(v:string)=>/^[A-Za-z0-9_-]{1,150}$/.test(v);
const recordKey=(kind:string,id:string)=>kind+"-"+createHash("sha256").update(id).digest("hex");

/** Display metadata only. No ledger, order status, payment, inventory or deletion writes. */
export const commerceRecordVisibility=onRequest({cors:true,region:"us-central1"},async(request,response)=>{
  if(request.method!=="POST"){response.status(405).json({ok:false,message:"POST required."});return;}
  const token=(request.headers.authorization??"").match(/^Bearer (.+)$/)?.[1];
  if(!token){response.status(401).json({ok:false,message:"Sign in first."});return;}
  let uid:string;
  try{uid=(await getAuth().verifyIdToken(token,true)).uid;}
  catch{response.status(401).json({ok:false,message:"Session expired."});return;}
  const input=request.body;
  if(!row(input)||!["list","set"].includes(str(input.action))){response.status(400).json({ok:false,message:"Invalid visibility action."});return;}
  const db=getFirestore(),accessRef=db.doc("userAccess/"+uid);
  try{
    const access=(await accessRef.get()).data();
    const role=str(access?.role);
    if(str(access?.accountState)!=="Active"||!["Administrator","Sales Manager","Sales Representative","Operations","Warehouse","Delivery Driver"].includes(role)){
      response.status(403).json({ok:false,message:"Active staff access required."});return;
    }
    if(input.action==="list"){
      const [markers,accountsDoc,rootDoc]=await Promise.all([
        db.collection("commerceRecordVisibility").where("hidden","==",true).limit(1001).get(),
        db.doc("domains/workspace/fields/accounts").get(),db.doc("domains/commercial/fields/_root").get(),
      ]);
      if(markers.size>1000){response.status(409).json({ok:false,message:"Visibility register needs pagination before displaying results."});return;}
      const root=rootDoc.data()?.data;
      const patches=row(root)&&row(root.accountPatches)?root.accountPatches:{};
      const accounts=rows(accountsDoc.data()).map(account=>{
        const patch=patches[str(account.id)];return row(patch)?{...account,...patch}:account;
      });
      const allowed=new Set<string>();
      if(role==="Sales Manager"){
        const team=await db.collection("userAccess").where("managerId","==",uid).get();
        const reports=new Set(team.docs.filter(doc=>doc.data().accountState==="Active"&&doc.data().role==="Sales Representative"&&doc.data().team==="Sales").map(doc=>doc.id));
        for(const account of accounts){if(str(account.ownerId)===uid||reports.has(str(account.ownerId)))allowed.add(str(account.id));}
      }else if(role==="Sales Representative"){
        for(const account of accounts){if(str(account.ownerId)===uid)allowed.add(str(account.id));}
      }
      const all=["Administrator","Operations","Warehouse"].includes(role);
      const hidden=markers.docs.map(doc=>doc.data()).filter(marker=>all||allowed.has(str(marker.accountId)))
        .filter(marker=>kinds.includes(str(marker.kind))&&validId(str(marker.recordId)))
        .map(marker=>({kind:marker.kind,id:marker.recordId}));
      response.status(200).json({ok:true,hidden});return;
    }
    if(role!=="Administrator"){response.status(403).json({ok:false,message:"Administrator required to change visibility."});return;}
    const kind=str(input.kind),recordId=str(input.id),reason=str(input.reason);
    if(!kinds.includes(kind)||!validId(recordId)||typeof input.hidden!=="boolean"||reason.length<3||reason.length>240){
      response.status(400).json({ok:false,message:"Choose a record and provide a reason."});return;
    }
    const hidden=input.hidden,key=recordKey(kind,recordId),markerRef=db.doc("commerceRecordVisibility/"+key);
    const auditRef=db.collection("commerceRecordVisibilityAudit").doc();
    const sourceRefs=kind==="order"?[db.doc("domains/commercial/fields/orders"),db.doc("domains/workspace/fields/orders")]:[db.doc("domains/commerce/fields/"+(kind==="invoice"?"invoices":"payments"))];
    const saved=await db.runTransaction(async tx=>{
      const [freshAccess,previous,...sources]=await Promise.all([tx.get(accessRef),tx.get(markerRef),...sourceRefs.map(ref=>tx.get(ref))]);
      if(freshAccess.data()?.role!=="Administrator"||freshAccess.data()?.accountState!=="Active")return false;
      const record=sources.flatMap(source=>rows(source.data())).find(item=>str(item.id)===recordId);
      if(!record||!validId(str(record.accountId)))return false;
      if(previous.exists&&previous.data()?.hidden===hidden)return true;
      const at=new Date().toISOString();
      const marker={kind,recordId,accountId:str(record.accountId),hidden,reason,updatedAt:at,updatedBy:uid};
      tx.set(markerRef,marker);
      tx.create(auditRef,{...marker,previousHidden:previous.data()?.hidden===true});
      return true;
    });
    if(!saved){response.status(409).json({ok:false,message:"Record or current administrator authorization could not be verified."});return;}
    response.status(200).json({ok:true,kind,id:recordId,hidden});
  }catch(error){
    console.error("commerceRecordVisibility failed",error);
    response.status(503).json({ok:false,message:"Visibility change or read could not be confirmed."});
  }
});
