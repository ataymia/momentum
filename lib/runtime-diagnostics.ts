export const RUNTIME_ERROR_STORAGE_KEY="momentum-runtime-errors-v1";

export type RuntimeErrorEntry={
  id:string;
  at:string;
  scope:string;
  message:string;
  stack?:string;
  componentStack?:string;
};

const clip=(value:string|undefined,max:number)=>value?value.slice(0,max):undefined;
const errorMessage=(error:unknown)=>error instanceof Error?error.message:typeof error==="string"?error:"Unknown client error";
const errorStack=(error:unknown)=>error instanceof Error?error.stack:undefined;

export function recordRuntimeError(error:unknown,scope:string,componentStack?:string){
  const id=`runtime-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  const entry:RuntimeErrorEntry={id,at:new Date().toISOString(),scope,message:clip(errorMessage(error),500)??"Unknown client error",stack:clip(errorStack(error),5000),componentStack:clip(componentStack,5000)};
  if(typeof window!=="undefined"){
    try{
      const raw=window.localStorage.getItem(RUNTIME_ERROR_STORAGE_KEY);
      const parsed=raw?JSON.parse(raw):[];
      const previous=Array.isArray(parsed)?parsed.filter((item)=>item&&typeof item==="object"):[];
      window.localStorage.setItem(RUNTIME_ERROR_STORAGE_KEY,JSON.stringify([entry,...previous].slice(0,20)));
    }catch{/* diagnostics may never be allowed to crash the app */}
  }
  console.error("[momentum] client runtime error",entry);
  return id;
}
