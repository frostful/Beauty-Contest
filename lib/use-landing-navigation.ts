"use client";

import { useCallback, useEffect, useState } from "react";

export type LandingScreen = "home" | "rules" | "create" | "join";
export const ENTRY_DRAFT_KEY = "median-entry-draft";
const screens = new Set(["home", "rules", "create", "join"]);
const profiles = new Set(["diamond", "crown", "laser", "visa", "rabbit", "spade", "heart", "club"]);

export function useLandingNavigation() {
  const [screen, updateScreen] = useState<LandingScreen>("home");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [seconds, setSeconds] = useState(180);
  const [avatar, setAvatar] = useState("diamond");
  const [ready, setReady] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- Hydrate browser-only draft and URL state after SSR; the first render must match the server. */
  useEffect(() => {
    try {
      const draft = JSON.parse(sessionStorage.getItem(ENTRY_DRAFT_KEY) ?? "null");
      if (draft && typeof draft === "object") {
        if (typeof draft.name === "string") setName(draft.name.slice(0, 18));
        if (typeof draft.code === "string") setCode(draft.code.replace(/[^a-z]/gi, "").toUpperCase().slice(0, 4));
        if ([30, 60, 180].includes(draft.seconds)) setSeconds(draft.seconds);
        if (profiles.has(draft.avatar)) setAvatar(draft.avatar);
      }
    } catch { /* Draft storage is optional. */ }
    const room = new URLSearchParams(location.search).get("room");
    if (room && /^[a-z]{4}$/i.test(room)) {
      setCode(room.toUpperCase());
      if (!location.hash) history.replaceState(history.state, "", `${location.pathname}${location.search}#join`);
    }
    const sync = () => {
      const value = location.hash.slice(1);
      updateScreen(screens.has(value) ? value as LandingScreen : "home");
      window.scrollTo(0, 0);
    };
    sync();
    setReady(true);
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!ready) return;
    try { sessionStorage.setItem(ENTRY_DRAFT_KEY, JSON.stringify({ name, code, seconds, avatar, screen })); }
    catch { /* Navigation and forms still work when storage is unavailable. */ }
  }, [name, code, seconds, avatar, screen, ready]);

  const setScreen = useCallback((next: LandingScreen) => {
    // Hash navigation keeps native Back/Forward without the legal-document
    // client routing handoff that previously stalled in vinext.
    if (location.hash !== `#${next}`) location.hash = next;
    updateScreen(next);
    window.scrollTo(0, 0);
  }, []);

  return { screen, setScreen, name, setName, code, setCode, seconds, setSeconds, avatar, setAvatar };
}
