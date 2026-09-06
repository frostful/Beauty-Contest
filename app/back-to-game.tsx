"use client";
import { useSyncExternalStore } from "react";
import { ENTRY_DRAFT_KEY } from "../lib/use-landing-navigation";

const subscribe = () => () => {};
const serverHref = () => "/";
function storedHref() {
  try {
    const draft=JSON.parse(sessionStorage.getItem(ENTRY_DRAFT_KEY)??"null");
    if(["create","join","rules"].includes(draft?.screen))return `/#${draft.screen}`;
  } catch { /* A fresh visitor returns to the homepage. */ }
  return "/";
}

export function BackToGame() {
  const href=useSyncExternalStore(subscribe,storedHref,serverHref);
  // Full-document navigation preserves the legal-page routing workaround.
  return <a className="back-to-game" href={href}>← Back to game</a>;
}
