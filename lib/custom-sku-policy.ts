/** Test products must never resolve to a production Golden Eagle SKU.
 * They are stored and fulfilled in an independent sandbox domain only.
 */
export type SkuEnvironment="production"|"sandbox";
export type CustomSku={
  id:string;
  description:string;
  shortName:string;
  casePack:number;
  active:boolean;
  environment:SkuEnvironment;
  createdBy:string;
  createdAt:string;
};
export type SkuDraft={description:string;shortName:string;casePack:number;environment:SkuEnvironment};
export type SkuValidation={ok:true;draft:SkuDraft}|{ok:false;message:string};
const normalized=(value:string)=>value.trim().toLowerCase().replace(/\s+/g," ");
const productionReserved=/\b(golden\s*eagle|ge[-\s]?(original|sugarfree|tropical|red|blue|strawberry))\b/i;

export function validateCustomSku(input:SkuDraft,existing:Pick<CustomSku,"description"|"environment">[]):SkuValidation{
  const description=input.description.trim(),shortName=input.shortName.trim();
  if(input.environment!=="sandbox")
    return{ok:false,message:"New SKUs require an approved production catalog workflow. Use the sandbox for testing."};
  if(description.length<3||description.length>120||shortName.length<2||shortName.length>48)
    return{ok:false,message:"Enter a product name and short label."};
  if(!Number.isInteger(input.casePack)||input.casePack<1||input.casePack>1000)
    return{ok:false,message:"Case pack must be a positive whole number."};
  if(productionReserved.test(description)||productionReserved.test(shortName))
    return{ok:false,message:"Use a clearly fictional test product name, not a Golden Eagle SKU or alias."};
  if(existing.some(s=>s.environment==="sandbox"&&normalized(s.description)===normalized(description)))
    return{ok:false,message:"A sandbox product already uses this name."};
  return{ok:true,draft:{description,shortName,casePack:input.casePack,environment:"sandbox"}};
}

export function isolatedSkuUse(sku:Pick<CustomSku,"environment">,orderEnvironment:SkuEnvironment):boolean{
  return sku.environment===orderEnvironment;
}
export function sandboxCanPostProductionSideEffects(orderEnvironment:SkuEnvironment):boolean{
  return orderEnvironment==="production";
}
