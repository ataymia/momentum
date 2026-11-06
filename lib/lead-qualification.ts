import type {AccountStage,WorkspaceUser} from "./types";

export type LeadQualificationTarget="Qualified"|"Sampled";
export type QualificationReview={ok:boolean;message?:string};

/** Do not let a CRM preview rewrite paid, ordered, or historical customer lifecycle stages. */
export function reviewLeadQualification(
  role:WorkspaceUser["role"]|undefined,
  actorId:string|undefined,
  ownerId:string,
  current:AccountStage,
  next:LeadQualificationTarget,
  reason:string,
):QualificationReview {
  const manager=role==="Administrator"||role==="Sales Manager";
  const rep=role==="Sales Representative"&&Boolean(actorId)&&actorId===ownerId;
  if(!manager&&!rep)return {ok:false,message:"Only the assigned representative or authorized sales management may qualify this lead."};
  if(!["Prospect","Qualified","Sampled"].includes(current))return {ok:false,message:"Orders and existing customers cannot be moved back into the lead pipeline."};
  if(reason.trim().length<5||reason.trim().length>500)return {ok:false,message:"Enter a qualification reason between 5 and 500 characters."};
  if(current==="Prospect"&&next==="Qualified")return {ok:true};
  if(current==="Qualified"&&next==="Sampled")return {ok:true};
  if(current==="Sampled"&&next==="Qualified"&&manager)return {ok:true};
  return {ok:false,message:"The requested lead stage transition is not permitted."};
}
