/* Legal links deliberately load full documents; vinext client handoffs previously stalled. */
export function SiteFooter({active,home=false}:{active?:"privacy"|"terms";home?:boolean}) {
  return <footer className={`site-footer${home?" home-footer":""}`}>
    <nav className="public-legal-links" aria-label="Legal information">
      <a href="/privacy" aria-current={active==="privacy"?"page":undefined}>Privacy</a>
      <a href="/terms" aria-current={active==="terms"?"page":undefined}>Terms</a>
      <a href="https://github.com/frostful/Beauty-Contest" target="_blank" rel="noreferrer">Source</a>
      <a href="https://github.com/frostful/Beauty-Contest/blob/main/LICENSE" target="_blank" rel="noreferrer">AGPL-3.0</a>
      <span>© 2026 frostful · Code provided without warranty · Unofficial fan-made game, not affiliated with Netflix</span>
    </nav>
  </footer>;
}
