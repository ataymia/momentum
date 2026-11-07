import {CUSTOMER_MENU,MENU_GROUPS,normalizeRoutePath,routeLabel} from "./navigation-route-registry";
export type BreadcrumbStep={label:string;path?:string};
/** Present actual menu hierarchy. Parent paths are navigable only after the caller checks access. */
export function breadcrumbsForRoute(path:string,customerMode=false):BreadcrumbStep[] {
  const route=normalizeRoutePath(path);
  if(route==="/")return [{label:"Home"}];
  const all=customerMode?CUSTOMER_MENU:MENU_GROUPS.flatMap(group=>group.entries);
  const entry=all.filter(candidate=>route===candidate.path||(candidate.path!=="/"&&route.startsWith(candidate.path+"/")))
    .sort((a,b)=>b.path.length-a.path.length)[0];
  if(!entry)return [{label:routeLabel(route)}];
  const group=customerMode?"Customer Portal":MENU_GROUPS.find(item=>item.entries.some(candidate=>candidate.path===entry.path))?.label??"Workspace";
  const result:BreadcrumbStep[]=[{label:group}];
  if(!customerMode&&route.startsWith("/my-account/"))result.push({label:"My Account",path:"/my-account"});
  result.push({label:entry.label,path:entry.path});
  if(route===entry.path)return result;
  // Customer tab URLs identify a particular account before naming its tab.
  if(entry.path==="/sales/customers"){
    const segments=route.slice(entry.path.length+1).split("/");
    if(segments.length>1){
      result.push({label:"Customer details",path:entry.path+"/"+segments[0]});
      result.push({label:segments[1].replace(/(^|-)([a-z])/g,(_m,_dash,letter:string)=>" "+letter.toUpperCase()).trim()});
      return result;
    }
  }
  const finalLabel=routeLabel(route);
  if(finalLabel!==entry.label)result.push({label:finalLabel});
  return result;
}
