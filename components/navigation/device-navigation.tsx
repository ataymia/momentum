"use client";

import {useEffect, useRef, useState} from "react";
import {ChevronRight, Grid2X2, X} from "lucide-react";
import type {LucideIcon} from "lucide-react";
import type {PageKey, WorkspaceUser} from "../../lib/types";
import {useWorkspace} from "../../lib/workspace-context";

export type DeviceNavItem={key:PageKey;label:string;icon:LucideIcon};
type Props={
  items:DeviceNavItem[];
  currentUser:WorkspaceUser;
  rootPage:PageKey;
  pageParent:Partial<Record<PageKey,PageKey>>;
};

/** Navigation designed for touch, while the desktop sidebar remains unchanged. */
export function DeviceNavigation({items,currentUser,rootPage,pageParent}:Props){
  const {navigate,activePage,setSidebarOpen}=useWorkspace();
  const [expanded,setExpanded]=useState(false);
  const triggerRef=useRef<HTMLButtonElement>(null);
  const closeRef=useRef<HTMLButtonElement>(null);
  const sheetRef=useRef<HTMLElement>(null);
  const primaryKeys:PageKey[]=currentUser.role==="Sales Representative"
    ?["home","accounts","orders","timekeeping"]
    :currentUser.role==="Customer"
    ?["home","accounts","orders","help"]
    :currentUser.role==="Brand Ambassador"
    ?["home","brandAmbassadors","timekeeping","help"]
    :["home","accounts","orders","work"];
  const featured=primaryKeys.map(key=>items.find(item=>item.key===key))
    .filter((item):item is DeviceNavItem=>Boolean(item)).slice(0,4);
  const featuredKeys=new Set(featured.map(item=>item.key));
  const moreItems=items.filter(item=>!featuredKeys.has(item.key));
  const activeFeatured=featuredKeys.has(rootPage);
  const moreSelected=!activeFeatured;
  const go=(page:PageKey)=>{
    setExpanded(false);
    setSidebarOpen(false);
    navigate(page);
  };

  useEffect(()=>{
    if(!expanded)return;
    closeRef.current?.focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();setExpanded(false);return;}
      if(event.key!=="Tab"||!sheetRef.current)return;
      const candidates=[...sheetRef.current.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
      if(!candidates.length)return;
      const first=candidates[0],last=candidates[candidates.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    const onDesktop=()=>{
      if(window.matchMedia("(min-width:1024px)").matches)setExpanded(false);
    };
    document.addEventListener("keydown",onKey);
    window.addEventListener("resize",onDesktop);
    return()=>{
      document.removeEventListener("keydown",onKey);
      window.removeEventListener("resize",onDesktop);
      triggerRef.current?.focus();
    };
  },[expanded]);

  const moreActiveLabel=moreSelected?items.find(item=>item.key===rootPage)?.label??"More":"More";
  return <>
    <nav className="device-bottom-nav" aria-label="Mobile main navigation">
      {featured.map(item=>{
        const Icon=item.icon;
        const active=item.key===rootPage;
        return <button type="button" key={item.key}
          className={active?"is-active":""} aria-current={active?"page":undefined}
          onClick={()=>go(item.key)} aria-label={item.label}>
          <Icon size={21} aria-hidden="true" strokeWidth={1.9}/>
          <span>{currentUser.role==="Customer"&&item.key==="accounts"?"Account":
            item.key==="timekeeping"?"Clock":item.key==="accounts"?"CRM":
            item.key==="orders"?"Orders":item.label}</span>
        </button>;
      })}
      <button ref={triggerRef} type="button" className={expanded||moreSelected?"is-active":""}
        aria-haspopup="dialog" aria-expanded={expanded} aria-controls="device-more-menu"
        onClick={()=>setExpanded(open=>!open)} aria-label="More navigation">
        <Grid2X2 size={21} aria-hidden="true" strokeWidth={1.9}/>
        <span>More</span>
      </button>
    </nav>
    {expanded&&<div className="device-nav-layer">
      <button type="button" className="device-nav-scrim" aria-label="Close navigation" onClick={()=>setExpanded(false)}/>
      <section ref={sheetRef} id="device-more-menu" className="device-nav-sheet" role="dialog"
        aria-modal="true" aria-label="All Momentum sections">
        <header className="device-nav-sheet__header">
          <div><strong>Momentum</strong><small>{moreActiveLabel} · {currentUser.role}</small></div>
          <button ref={closeRef} type="button" onClick={()=>setExpanded(false)} aria-label="Close navigation"><X size={20}/></button>
        </header>
        <nav className="device-nav-sheet__list" aria-label="All available sections">
          {items.map(item=>{
            const Icon=item.icon;
            const active=item.key===rootPage||pageParent[activePage]===item.key;
            return <button type="button" key={item.key} className={active?"is-active":""}
              onClick={()=>go(item.key)} aria-current={active?"page":undefined}>
              <Icon size={20} aria-hidden="true"/>
              <span>{item.label}</span>
              <ChevronRight size={17} aria-hidden="true"/>
            </button>;
          })}
        </nav>
      </section>
    </div>}
  </>;
}
