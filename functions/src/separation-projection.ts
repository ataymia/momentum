/* eslint-disable max-len, keyword-spacing, comma-spacing, key-spacing, indent, space-before-blocks */
/** Server-side projections for an Administrator-approved separation.
 * Keep immutable history and completed visits; open work returns to scheduling.
 */
export type SeparationRow=Record<string,unknown>;
const read=(row:SeparationRow,key:string)=>
  typeof row[key]==="string" ? (row[key] as string).trim() : "";
/**
 * Release open work while keeping completed appointments and historical rows.
 * @param {Array<Object>} items Current appointment snapshot.
 * @param {string} employeeUid Approved separated identity.
 * @param {string} stamp Authorized separation time.
 * @return {Object} Updated projection.
 */
export function releaseSeparatedAppointments(
 items:readonly SeparationRow[],employeeUid:string,stamp:string,
):{items:SeparationRow[];releasedIds:string[]}{
 const releasedIds:string[]=[];
 const projected=items.map((row)=>{
  if(read(row,"ownerId")!==employeeUid)return row;
  // Completed visits are history, never a live assignment.
  if(read(row,"status")==="Completed")return row;
  if(read(row,"status")==="Cancelled")return row;
  const id=read(row,"id");
  if(id)releasedIds.push(id);
  return {...row,ownerId:"",assignedBy:"",assignedAt:"",separationReviewRequired:true,
    separationReviewAt:stamp,dispatchException:"Employee separated; reassignment required"};
 });
 return{items:projected,releasedIds};
}
