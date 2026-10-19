"use client";

import { useId, useState } from "react";
import type { Account } from "../../lib/types";
import { orderAccountLabel, orderAccountSuggestions } from "../../lib/order-account-search";

type Props={
  accounts:readonly Account[];
  query:string;
  selectedId:string;
  onQueryChange:(value:string)=>void;
  onChoose:(account:Account)=>void;
  disabled?:boolean;
};

/** A typed name is never an order account until the user chooses a CRM match. */
export function OrderAccountPicker({accounts,query,selectedId,onQueryChange,onChoose,disabled=false}:Props){
  const listId=useId();
  const [expanded,setExpanded]=useState(false);
  const [highlighted,setHighlighted]=useState(0);
  const matches=orderAccountSuggestions(accounts,query);
  const selected=accounts.find((account)=>account.id===selectedId);
  const showList=expanded&&!disabled;
  const choose=(account:Account)=>{
    onChoose(account);
    setExpanded(false);
    setHighlighted(0);
  };
  return <div className="order-account-picker" onBlur={(event)=>{
    if(!event.currentTarget.contains(event.relatedTarget))setExpanded(false);
  }}>
    <input
      type="text"
      role="combobox"
      aria-label="Customer account name"
      aria-autocomplete="list"
      aria-haspopup="listbox"
      aria-expanded={showList}
      aria-controls={listId}
      aria-activedescendant={showList&&matches.length?listId+"-"+Math.min(highlighted,matches.length-1):undefined}
      placeholder="Start typing a business or location name…"
      autoComplete="off"
      value={query}
      disabled={disabled}
      required
      onFocus={()=>{setExpanded(true);setHighlighted(0);}}
      onChange={(event)=>{onQueryChange(event.target.value);setExpanded(true);setHighlighted(0);}}
      onKeyDown={(event)=>{
        if(event.key==="Escape"){setExpanded(false);return;}
        if(event.key==="ArrowDown"){
          event.preventDefault();
          setExpanded(true);
          setHighlighted((value)=>matches.length?(value+1)%matches.length:0);
        }else if(event.key==="ArrowUp"){
          event.preventDefault();
          setExpanded(true);
          setHighlighted((value)=>matches.length?(value-1+matches.length)%matches.length:0);
        }else if(event.key==="Enter"&&showList&&matches.length){
          event.preventDefault();
          choose(matches[Math.min(highlighted,matches.length-1)]);
        }
      }}
    />
    {selected?<small className="order-account-picker__selected">Selected CRM account: {orderAccountLabel(selected)}</small>:
      <small className="order-account-picker__hint">Select an existing CRM account from the matches before submitting.</small>}
    {showList&&<div id={listId} className="order-account-picker__results" role="listbox" aria-label="Matching customer accounts">
      {matches.length?matches.map((account,index)=><button
        id={listId+"-"+index}
        type="button"
        role="option"
        aria-selected={index===highlighted}
        className={"order-account-picker__option"+(index===highlighted?" is-active":"")}
        key={account.id}
        onMouseEnter={()=>setHighlighted(index)}
        onMouseDown={(event)=>event.preventDefault()}
        onClick={()=>choose(account)}
      >
        <strong>{account.name}</strong>
        <span>{[account.locationName||account.location,account.streetAddress,[account.city,account.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}</span>
      </button>):<p className="order-account-picker__empty">No matching CRM accounts. Check the spelling or create the account in CRM first.</p>}
    </div>}
  </div>;
}
