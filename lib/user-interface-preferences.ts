export type InterfacePreferences = {
  density: "comfortable" | "compact";
  reduceMotion: boolean;
};
export const defaultInterfacePreferences: InterfacePreferences = {density:"comfortable",reduceMotion:false};
export const preferenceStorageKey = (userId:string) => "momentum-ui-preferences-v1:" + encodeURIComponent(userId);
export function normalizeInterfacePreferences(value:unknown):InterfacePreferences {
  if(!value||typeof value!=="object")return {...defaultInterfacePreferences};
  const candidate=value as Record<string,unknown>;
  return {
    density:candidate.density==="compact"?"compact":"comfortable",
    reduceMotion:candidate.reduceMotion===true,
  };
}
export function readInterfacePreferences(userId:string):InterfacePreferences {
  if(!userId||typeof window==="undefined")return {...defaultInterfacePreferences};
  try{
    const text=window.localStorage.getItem(preferenceStorageKey(userId));
    return text?normalizeInterfacePreferences(JSON.parse(text)):{...defaultInterfacePreferences};
  }catch{return {...defaultInterfacePreferences};}
}
export function saveInterfacePreferences(userId:string,value:InterfacePreferences):boolean {
  if(!userId||typeof window==="undefined")return false;
  try{window.localStorage.setItem(preferenceStorageKey(userId),JSON.stringify(normalizeInterfacePreferences(value)));return true;}catch{return false;}
}
