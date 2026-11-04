import assert from "node:assert/strict";
import test from "node:test";
import {validateTimecardCorrectionReceipt,type TrustedTimecardRequest} from "../lib/timecard-trusted-client";

const intent:TrustedTimecardRequest={
 requestId:"request-1234",action:"amend",targetUid:"employee-1234",
 cardId:"timecard-1234",entryId:"entry-1234",date:"2026-11-02",
 reason:"Verified incorrect clock out",
 punch:{clockIn:"08:00",clockOut:"17:00",breakMinutes:30},
 expectedBefore:{clockIn:"08:00",clockOut:"16:00",breakMinutes:30},
};
const receipt={ok:true,requestId:intent.requestId,cardId:intent.cardId,
 status:"Recorded",replayed:false,serverRecordedAt:"2026-11-04T20:00:00.000Z"};

test("authenticated timecard response must have matching durable reference and timecard",()=>{
 const result=validateTimecardCorrectionReceipt(intent,receipt);
 assert.equal(result.cardId,intent.cardId);
 assert.equal(result.replayed,false);
 for(const changed of [
   {...receipt,requestId:"request-someone-else"},
   {...receipt,cardId:"timecard-other"},
   {...receipt,status:"Pending"},
   {...receipt,serverRecordedAt:"bad-date"},
   {...receipt,ok:false},
   {...receipt,replayed:"false"},
 ]){
   assert.throws(()=>validateTimecardCorrectionReceipt(intent,changed));
 }
});
test("create-week receipts may return server-generated timecard ID only after commitment",()=>{
 const creation:TrustedTimecardRequest={requestId:"request-5678",targetUid:"employee-1234",
  action:"create_week",weekDate:"2026-10-19",reason:"Verified missing entire week"};
 assert.equal(validateTimecardCorrectionReceipt(creation,{
   ...receipt,requestId:"request-5678",cardId:"tc-trusted-request-5678",replayed:true,
 }).cardId,"tc-trusted-request-5678");
});
