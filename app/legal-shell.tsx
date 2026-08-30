/* eslint-disable @next/next/no-html-link-for-pages -- Vinext's client-side route handoff can stall on standalone legal documents; these links intentionally request full documents. */
import type { ReactNode } from "react";

export function LegalShell({kicker,title,intro,children}:{kicker:string;title:string;intro:string;children:ReactNode}){
  const privacyActive=title==="PRIVACY POLICY";
  const termsActive=title==="TERMS OF USE";
  return <main className="legal-page">
    <div className="legal-grain" aria-hidden="true"/>
    <header className="legal-header"><a className="legal-brand" href="/"><img src="/king-diamond.svg" alt=""/><span>MEDIAN</span></a><nav aria-label="Legal navigation"><a href="/">GAME</a><a className={privacyActive?"active":""} href="/privacy">PRIVACY</a><a className={termsActive?"active":""} href="/terms">TERMS</a></nav></header>
    <article className="legal-document"><span className="legal-kicker">{kicker}</span><h1>{title}</h1><p className="legal-intro">{intro}</p><p className="legal-updated">Effective 20 August 2026 · Last updated 20 August 2026</p><div className="legal-sections">{children}</div></article>
  </main>;
}
