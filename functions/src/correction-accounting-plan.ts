/* eslint-disable max-len,comma-spacing,key-spacing,object-curly-spacing */
type RecordData=Record<string,unknown>;
const text=(v:unknown)=>typeof v==="string"?v.trim():"";
const number=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)?v:NaN;
const inCents=(n:number)=>Math.round(n*100);
export type JournalCorrection={
  ok:true;alreadyPosted:boolean;newJournals:RecordData[];voidDraftJournalIds:string[];
  needsCustomerCreditAccount:boolean;
}|{ok:false;message:string};

/** Carry financial journal provenance forward without reposting the full
 * amended invoice. Generates an exact delta journal only when the original
 * invoice was previously posted using an unambiguous AR/revenue pair. */
export function planCorrectionJournal(input:{
  invoices:RecordData[];journals:RecordData[];accounts:RecordData[];
  oldInvoiceId:string;newInvoiceId:string;originalTotal:number;revisedTotal:number;
  customerCreditDue:number;requestId:string;actorUid:string;at:string;date:string;
}):JournalCorrection{
  const allPosted=input.journals.filter(j=>text(j.sourceType)==="Invoice issued"&&
    text(j.status)==="Posted");
  const oldInvoice=input.invoices.find(x=>text(x.id)===input.oldInvoiceId);
  if(!oldInvoice)return{ok:false,message:"The prior invoice cannot be located for journal reconciliation."};
  const rootInvoiceId=text(oldInvoice.id).replace(/(?:-r\d+)+$/,"");
  const ancestors=allPosted.filter(j=>
    [input.oldInvoiceId,rootInvoiceId].includes(text(j.sourceId)));
  if(ancestors.length>2)return{ok:false,message:"Multiple conflicting posted invoice journal entries exist."};
  const root=ancestors.find(j=>text(j.sourceId)===rootInvoiceId)||
    ancestors.find(j=>text(j.sourceId)===input.oldInvoiceId);
  const matchingDraft=input.journals.filter(j=>
    text(j.sourceType)==="Invoice issued"&&text(j.status)==="Draft"&&
    text(j.sourceId)===input.oldInvoiceId);
  if(matchingDraft.length>1||root&&matchingDraft.length>0)
    return{ok:false,message:"Conflicting invoice journal drafts require an audit."};
  if(!root)return{ok:true,alreadyPosted:false,newJournals:[],
    voidDraftJournalIds:matchingDraft.map(j=>text(j.id)),needsCustomerCreditAccount:false};
  const originalLines=Array.isArray(root.lines)?root.lines.filter(x=>x&&typeof x==="object") as RecordData[]:[];
  if(originalLines.length!==2)return{ok:false,message:"The original posted journal uses a complex allocation that cannot be safely amended automatically."};
  const debitLine=originalLines.find(l=>number(l.debit)>0&&number(l.credit)===0);
  const creditLine=originalLines.find(l=>number(l.credit)>0&&number(l.debit)===0);
  const arAccount=input.accounts.find(a=>text(a.id)===text(debitLine?.accountId));
  const revenueAccount=input.accounts.find(a=>text(a.id)===text(creditLine?.accountId));
  if(!debitLine||!creditLine||!arAccount||!revenueAccount||
     text(arAccount.type)!=="Asset"||text(revenueAccount.type)!=="Revenue"||
     !["Accounts receivable",""].includes(text(arAccount.systemRole)))
    return{ok:false,message:"Posted invoice chart mapping cannot be reconciled automatically."};
  const delta=inCents(input.revisedTotal)-inCents(input.originalTotal);
  const postings:RecordData[]=[];
  if(delta!==0){
    const smaller=delta<0,amount=Math.abs(delta)/100;
    postings.push({id:"journal-correction-"+input.requestId,
      number:"JE-CORR-"+input.requestId,date:input.date,
      memo:"Invoice correction "+input.requestId+"; adjusts previous posted revenue",
      status:"Posted",sourceType:"Invoice issued",sourceId:input.newInvoiceId,
      createdAt:input.at,createdBy:input.actorUid,postedAt:input.at,postedBy:input.actorUid,
      lines:[{id:"correction-debit-"+input.requestId,
        accountId:smaller?creditLine.accountId:debitLine.accountId,debit:amount,credit:0},
        {id:"correction-credit-"+input.requestId,
          accountId:smaller?debitLine.accountId:creditLine.accountId,debit:0,credit:amount}]});
  }
  if(inCents(input.customerCreditDue)>0){
    const liability=input.accounts.find(a=>text(a.id)==="acct-customer-credits");
    if(liability&&text(liability.type)!=="Liability")
      return{ok:false,message:"Customer-credit liability account is misconfigured."};
    const amount=inCents(input.customerCreditDue)/100;
    postings.push({id:"journal-customer-credit-"+input.requestId,
      number:"JE-CREDIT-"+input.requestId,date:input.date,
      memo:"Unapplied customer credit liability from "+input.requestId,
      status:"Posted",sourceType:"Manual",sourceId:"customer-credit-due:"+input.requestId,
      createdAt:input.at,createdBy:input.actorUid,postedAt:input.at,postedBy:input.actorUid,
      lines:[{id:"credit-due-debit-"+input.requestId,accountId:debitLine.accountId,
        debit:amount,credit:0},{id:"credit-due-credit-"+input.requestId,
        accountId:"acct-customer-credits",debit:0,credit:amount}]});
  }
  return{ok:true,alreadyPosted:true,newJournals:postings,
    voidDraftJournalIds:[],needsCustomerCreditAccount:inCents(input.customerCreditDue)>0};
}
