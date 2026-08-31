"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { RULE_AMENDMENTS, type RuleAmendmentId } from "../lib/rule-amendments";

type Player = { id:string; name:string; avatar:string; isHost:boolean; isBot:boolean; score:number; alive:boolean; submitted:boolean; pick:number|null; invalid:boolean; roundDelta:number; online:boolean };
type Spectator = { id:string; name:string; avatar:string; online:boolean };
type GameState = {
  room:{ code:string; status:"lobby"|"briefing"|"playing"|"results"|"finished"; round:number; roundSeconds:number; deadline:number|null; resultStartedAt:number|null; autoFinishAt:number|null; average:number|null; target:number|null; winnerId:string|null; winnerName:string|null; exactHit:boolean; message:string|null; initialPlayers:number; bannedNumbers:number[]; amendmentIds:RuleAmendmentId[]; briefingStartedAt:number|null; briefingEndsAt:number|null };
  me:{ id:string; name:string; avatar:string; isHost:boolean; isSpectator:boolean; alive:boolean; submitted:boolean; pick:number|null; score:number };
  players:Player[]; spectators:Spectator[]; testControlsEnabled:boolean; serverNow:number;
};
type Session = { code:string; token:string };
type AmendmentPreview = { id:RuleAmendmentId; startedAt:number; run:number };

const SESSION_KEY = "median-game-session";
const SOUND_KEY = "median-game-sound";
const DEFAULT_ROOM_SIZE = 5;
const AVATAR_OPTIONS=[{id:"diamond",symbol:"◆",label:"Diamond"},{id:"crown",symbol:"♛",label:"King"},{id:"laser",symbol:"ϟ",label:"Pulse"},{id:"visa",symbol:"◉",label:"Vision"},{id:"rabbit",symbol:"兔",label:"Rabbit"},{id:"spade",symbol:"♠",label:"Spade"},{id:"heart",symbol:"♥",label:"Heart"},{id:"club",symbol:"♣",label:"Club"}];
type SoundKind = "lock"|"reveal"|"transfer"|"divide"|"average"|"multiply"|"target"|"resolve"|"eliminate"|"victory"|"select"|"tick"|"round"|"flip"|"amendment";
let sharedAudioContext:AudioContext|null=null;
let sharedAudioMaster:AudioNode|null=null;

function audioContext() {
  const Context=window.AudioContext||(window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext;
  sharedAudioContext??=new Context();
  return sharedAudioContext;
}

function audioMaster(ctx:AudioContext) {
  if(sharedAudioMaster)return sharedAudioMaster;
  const compressor=ctx.createDynamicsCompressor();
  compressor.threshold.value=-22;
  compressor.knee.value=14;
  compressor.ratio.value=9;
  compressor.attack.value=.004;
  compressor.release.value=.22;
  const master=ctx.createGain();
  master.gain.value=.72;
  compressor.connect(master);
  master.connect(ctx.destination);
  sharedAudioMaster=compressor;
  return sharedAudioMaster;
}

async function api(body:Record<string,unknown>) {
  const payload={...body};
  const sessionToken=typeof payload.token==="string"?payload.token:"";
  delete payload.token;
  const headers:Record<string,string>={"Content-Type":"application/json"};
  if(sessionToken)headers.Authorization=`Bearer ${sessionToken}`;
  const response = await fetch("/api/game", { method:"POST", headers, body:JSON.stringify(payload) });
  const data = await response.json() as Record<string,unknown>;
  if (!response.ok) throw new Error(String(data.error ?? "Something went wrong."));
  return data;
}

function useTone(enabled:boolean) {
  return useCallback((kind:SoundKind) => {
    if(!enabled)return;
    try {
      const ctx=audioContext();if(ctx.state==="suspended")void ctx.resume();const now=ctx.currentTime,master=audioMaster(ctx);
      const pulse=(frequency:number,delay:number,duration:number,type:OscillatorType="sine",volume=.045,endFrequency?:number)=>{const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=type;osc.frequency.setValueAtTime(frequency,now+delay);if(endFrequency)osc.frequency.exponentialRampToValueAtTime(endFrequency,now+delay+duration);gain.gain.setValueAtTime(.0001,now+delay);gain.gain.exponentialRampToValueAtTime(volume,now+delay+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+delay+duration);osc.connect(gain);gain.connect(master);osc.start(now+delay);osc.stop(now+delay+duration+.02);};
      if(kind==="lock"){pulse(230,0,.13,"square",.025,520);pulse(760,.13,.2,"sine",.05,1040);}
      if(kind==="select"){pulse(330,0,.055,"triangle",.018,430);}
      if(kind==="tick"){pulse(920,0,.065,"square",.016,650);pulse(1320,.07,.045,"sine",.012,980);}
      if(kind==="round"){pulse(72,0,.42,"sine",.08,48);pulse(294,.1,.32,"triangle",.035,392);pulse(523,.28,.38,"sine",.03,698);}
      if(kind==="flip"){pulse(880,0,.12,"triangle",.025,260);pulse(260,.1,.14,"triangle",.02,940);}
      if(kind==="amendment"){pulse(68,0,.8,"sine",.085,42);pulse(218,.16,.46,"triangle",.028,174);pulse(960,.52,.08,"square",.016,620);}
      if(kind==="reveal"){pulse(90,0,.42,"sawtooth",.035,280);pulse(560,.16,.35,"sine",.04,760);}
      if(kind==="transfer"){pulse(940,0,.08,"square",.018,1280);pulse(420,.09,.15,"sine",.04,610);}
      if(kind==="divide"){[520,420,320].forEach((f,i)=>pulse(f,i*.12,.09,"triangle",.035));}
      if(kind==="average"){pulse(392,0,.42,"sine",.035);pulse(523,.05,.45,"sine",.03);pulse(659,.1,.48,"sine",.025);}
      if(kind==="multiply"){pulse(170,0,.75,"sawtooth",.025,920);pulse(340,.1,.62,"sine",.025,1120);}
      if(kind==="target"){pulse(70,0,.34,"sine",.09,45);pulse(1180,.04,.5,"sine",.045,720);}
      if(kind==="resolve"){[262,392,523].forEach((f,i)=>pulse(f,i*.07,.65,"triangle",.035));pulse(1046,.28,.55,"sine",.035);}
      if(kind==="eliminate"){pulse(92,0,1.1,"sawtooth",.04,38);[760,690,810,620,720,540].forEach((f,i)=>pulse(f,.35+i*.18,.1,"square",.018,f*.7));pulse(45,1.35,1.2,"sine",.1,28);}
      if(kind==="victory"){pulse(55,0,1.2,"sine",.12,34);[196,294,392,523].forEach((f,i)=>pulse(f,.32+i*.13,.8,"triangle",.045));pulse(1180,.92,.7,"sine",.05,1760);}
    } catch { /* Sound is decorative. */ }
  }, [enabled]);
}

export default function Home() {
  const [screen,setScreen] = useState<"home"|"rules"|"create"|"join">("home");
  const [session,setSession] = useState<Session|null>(null);
  const [state,setState] = useState<GameState|null>(null);
  const [name,setName] = useState(""); const [code,setCode] = useState(""); const [seconds,setSeconds] = useState(180);const [avatar,setAvatar]=useState("diamond");
  const [choice,setChoice] = useState(40); const [busy,setBusy] = useState(false); const [error,setError] = useState("");
  const [connectionLost,setConnectionLost]=useState(false);
  const [scoreBusy,setScoreBusy]=useState<Set<string>>(()=>new Set());
  const [copied,setCopied] = useState(false); const [now,setNow] = useState(Date.now());
  const [soundOn,setSoundOn]=useState(true);const previousStatus = useRef<string|null>(null); const tone = useTone(soundOn);
  const [announcementLab,setAnnouncementLab]=useState(false);
  const serverClock=useRef({server:Date.now(),client:Date.now()});
  const requestVersion=useRef(0);
  const mutationInFlight=useRef(false);
  const refreshAbort=useRef<AbortController|null>(null);
  const briefingAudioKey=state?.room.status==="briefing"?state.room.amendmentIds.join(","):"";

  const receiveState=useCallback((next:GameState)=>{
    serverClock.current={server:next.serverNow,client:Date.now()};
    setState(next);
  },[]);

  const saveSession = useCallback((next:Session|null) => {
    refreshAbort.current?.abort();
    refreshAbort.current=null;
    requestVersion.current+=1;
    setSession(next); setState(null);
    if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next)); else localStorage.removeItem(SESSION_KEY);
  }, []);

  useEffect(() => {
    try { const value = localStorage.getItem(SESSION_KEY); if (value) setSession(JSON.parse(value) as Session); } catch { localStorage.removeItem(SESSION_KEY); }
    try { setSoundOn(localStorage.getItem(SOUND_KEY)!=="off"); } catch { /* Preference is optional. */ }
  }, []);
  useEffect(()=>{if(new URLSearchParams(location.search).get("rehearse")==="announcements")setAnnouncementLab(true);},[]);
  useEffect(()=>{const unlock=()=>{try{const ctx=audioContext();if(ctx.state==="suspended")void ctx.resume();}catch{/* Audio is optional. */}};window.addEventListener("pointerdown",unlock,{capture:true});return()=>window.removeEventListener("pointerdown",unlock,{capture:true});},[]);
  const toggleSound=()=>setSoundOn(value=>{const next=!value;try{localStorage.setItem(SOUND_KEY,next?"on":"off");}catch{/* Preference is optional. */}return next;});

  const refresh = useCallback(async (quiet=true) => {
    if (!session||mutationInFlight.current) return;
    refreshAbort.current?.abort();
    const controller=new AbortController();
    refreshAbort.current=controller;
    const requestId=++requestVersion.current;
    try {
      const response = await fetch(`/api/game?code=${encodeURIComponent(session.code)}`, {
        cache:"no-store",
        headers:{Authorization:`Bearer ${session.token}`},
        signal:controller.signal,
      });
      const data = await response.json() as GameState & {error?:string};
      if(requestId!==requestVersion.current)return;
      if (!response.ok) {
        if (response.status===401||response.status===404) { previousStatus.current=null;setConnectionLost(false); saveSession(null); return; }
        throw new Error(data.error ?? "Room not found.");
      }
      // A refresh must not resurrect a completed match and replay its ceremony.
      if (previousStatus.current===null&&data.room.status==="finished") { saveSession(null); return; }
      receiveState(data); setError("");setConnectionLost(false);
      if (previousStatus.current === "playing" && data.room.status !== "playing") tone("reveal");
      previousStatus.current = data.room.status;
    } catch (e) {
      if(e instanceof DOMException&&e.name==="AbortError")return;
      if(requestId===requestVersion.current){setConnectionLost(true);if (!quiet) setError(e instanceof Error ? e.message : "Connection lost.");}
    } finally {
      if(refreshAbort.current===controller)refreshAbort.current=null;
    }
  }, [session,tone,saveSession,receiveState]);

  useEffect(() => {
    if (!session) return;
    let stopped=false;
    let socket:WebSocket|null=null;
    let reconnectTimer:ReturnType<typeof setTimeout>|null=null;
    let keepAlive:ReturnType<typeof setInterval>|null=null;
    let attempts=0;

    const connect=()=>{
      if(stopped)return;
      const protocol=location.protocol==="https:"?"wss:":"ws:";
      socket=new WebSocket(
        `${protocol}//${location.host}/api/live?code=${encodeURIComponent(session.code)}`,
        ["median.v1",`median.auth.${session.token}`],
      );
      socket.onopen=()=>{
        attempts=0;
        if(keepAlive)clearInterval(keepAlive);
        keepAlive=setInterval(()=>{if(socket?.readyState===WebSocket.OPEN)socket.send("ping");},45_000);
      };
      socket.onmessage=event=>{if(event.data!=="pong")void refresh(true);};
      socket.onclose=()=>{
        if(keepAlive){clearInterval(keepAlive);keepAlive=null;}
        if(stopped)return;
        const delay=Math.min(30_000,1_000*2**Math.min(attempts++,5));
        reconnectTimer=setTimeout(connect,delay);
      };
      socket.onerror=()=>socket?.close();
    };

    void refresh(false);
    connect();
    // A low-frequency safety snapshot covers temporary WebSocket failures and
    // legacy Sites deployments without returning to request-heavy polling.
    const fallback=setInterval(()=>void refresh(true),60_000);
    return()=>{
      stopped=true;
      clearInterval(fallback);
      if(reconnectTimer)clearTimeout(reconnectTimer);
      if(keepAlive)clearInterval(keepAlive);
      socket?.close(1000,"Page closed");
    };
  },[session,refresh]);
  useEffect(()=>{if(!session)return;const reconnect=()=>refresh(false);const visible=()=>{if(document.visibilityState==="visible")refresh(true);};window.addEventListener("online",reconnect);document.addEventListener("visibilitychange",visible);return()=>{window.removeEventListener("online",reconnect);document.removeEventListener("visibilitychange",visible);};},[session,refresh]);
  // The shared clock only drives second-level interface copy. Animation scenes
  // keep their own local frame clock so the entire game shell is not repainted
  // four times a second.
  useEffect(() => {
    if(!session&&!announcementLab)return;
    const id=setInterval(()=>setNow(Date.now()),1000);
    return()=>clearInterval(id);
  },[session,announcementLab]);
  useEffect(()=>{
    if(!briefingAudioKey)return;
    for(const id of briefingAudioKey.split(",") as RuleAmendmentId[]){
      const amendment=RULE_AMENDMENTS[id];
      if(amendment)void fetch(amendment.audioSrc,{cache:"force-cache"}).catch(()=>undefined);
    }
  },[briefingAudioKey]);

  useEffect(()=>{
    if(!state)return;
    const transitionAt=state.room.status==="briefing"||state.room.status==="playing"
      ? state.room.deadline
      : state.room.status==="results"
        ? state.room.autoFinishAt
        : null;
    if(!transitionAt)return;
    const clockNow=serverClock.current.server+(Date.now()-serverClock.current.client);
    const id=setTimeout(()=>void refresh(true),Math.max(100,transitionAt-clockNow+150));
    return()=>clearTimeout(id);
  },[state,refresh]);

  const act = async (action:string, extra:Record<string,unknown>={}) => {
    if (!session || busy) return; setBusy(true); setError("");mutationInFlight.current=true;const requestId=++requestVersion.current;
    try { const result=await api({action,...session,...extra}); if(requestId!==requestVersion.current)return;if ("room" in result) receiveState(result as unknown as GameState); else {mutationInFlight.current=false;await refresh(false);} }
    catch(e){setError(e instanceof Error?e.message:"Action failed.");} finally{mutationInFlight.current=false;setBusy(false);}
  };

  const leaveRoom=async()=>{
    if(!session){saveSession(null);return;}
    mutationInFlight.current=true;requestVersion.current+=1;
    try{await api({action:"leave",...session});}catch{/* Leaving locally must never trap the player. */}
    finally{mutationInFlight.current=false;previousStatus.current=null;saveSession(null);}
  };

  const advanceRound=async()=>{
    if(busy)return;
    await act("next");
  };

  const adjustScore = (playerId:string,delta:-1|1) => {
    if(!session||scoreBusy.has(playerId))return;
    setScoreBusy(current=>new Set(current).add(playerId));
    void api({action:"adjustScore",...session,playerId,delta})
      .then(()=>refresh(true))
      .catch(error=>setError(error instanceof Error?error.message:"Score adjustment failed."))
      .finally(()=>setScoreBusy(current=>{const next=new Set(current);next.delete(playerId);return next;}));
  };

  const enter = async (event:FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try {
      const submitter=(event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement|null;
      const joinAction=submitter?.value==="spectate"?"spectate":"join";
      const result = screen === "create" ? await api({action:"create",name,avatar,roundSeconds:seconds}) : await api({action:joinAction,name,avatar,code:code.replace(/\s/g,"").toUpperCase()});
      saveSession({code:String(result.code),token:String(result.token)});
    } catch(e){setError(e instanceof Error?e.message:"Could not enter room.");} finally{setBusy(false);}
  };

  const synchronizedNow=serverClock.current.server+(now-serverClock.current.client);
  const remaining = state?.room.deadline ? Math.max(0,Math.ceil((state.room.deadline-synchronizedNow)/1000)) : 0;
  const champion = state?.players.find(p=>p.alive);
  const inviteUrl = useMemo(() => state && typeof window !== "undefined" ? `${window.location.origin}/?room=${state.room.code}` : "",[state]);
  useEffect(()=>{ const room=new URLSearchParams(location.search).get("room"); if(room&&!session){setCode(room.toUpperCase());setScreen("join");}},[session]);

  if(announcementLab)return <AnnouncementRehearsal now={now} soundOn={soundOn} toggleSound={toggleSound} tone={tone}/>;
  if (!session) return <Landing screen={screen} setScreen={setScreen} name={name} setName={setName} avatar={avatar} setAvatar={setAvatar} code={code} setCode={setCode} seconds={seconds} setSeconds={setSeconds} enter={enter} busy={busy} error={error} tone={tone}/>;
  if (!state) return <Loading error={error} retry={()=>refresh(false)} leave={()=>saveSession(null)}/>;

  return (
    <main className={`game-shell phase-${state.room.status}`}>
      <div className="grain" aria-hidden="true" />
      <div className="suit-field" aria-hidden="true" />
      <BorderlandAtmosphere />
      <header className="game-top">
        <button className="mini-brand" onClick={leaveRoom} aria-label="Leave room"><img src="/king-diamond.svg" alt=""/> MEDIAN</button>
        <button className={`sound-toggle ${soundOn?"on":""}`} onClick={toggleSound} aria-label={soundOn?"Mute sound effects":"Enable sound effects"}><span>{soundOn?"◖))":"◖×"}</span><small>{soundOn?"SOUND ON":"MUTED"}</small></button>
        <div className="room-meta"><small>ROOM</small><button onClick={async()=>{await navigator.clipboard.writeText(inviteUrl);setCopied(true);setTimeout(()=>setCopied(false),1500)}}>{copied?"LINK COPIED":state.room.code} <span>⧉</span></button></div>
        <div className="round-meta"><small>ROUND</small><b>{String(state.room.round).padStart(2,"0")}</b></div>
      </header>

      {error && <div className="toast" role="alert">{error}<button onClick={()=>setError("")}>×</button></div>}
      {connectionLost&&<div className="reconnect-banner" role="status"><i/><span><strong>CONNECTION INTERRUPTED</strong><small>Your seat is reserved on this device.</small></span><button onClick={()=>refresh(false)}>RECONNECT</button></div>}
      {state.testControlsEnabled&&state.me.isHost&&state.room.status!=="lobby"&&state.room.status!=="briefing"&&state.room.status!=="finished"&&
        <HostScorePanel players={state.players} adjust={adjustScore} pending={scoreBusy}/>
      }

      {state.room.status === "lobby" && <Lobby state={state} copied={copied} copy={async()=>{await navigator.clipboard.writeText(inviteUrl);setCopied(true);setTimeout(()=>setCopied(false),1500)}} fillBots={()=>act("fillBots")} kick={playerId=>act("kick",{playerId})} start={()=>act("start")} busy={busy}/>}
      {state.room.status === "briefing" && (
        <RuleAmendmentTransition key={`briefing-${state.room.round}`} state={state} now={synchronizedNow} soundOn={soundOn} tone={tone}/>
      )}
      {state.room.status === "playing" && (
        <Arena key={`arena-${state.room.round}`} state={state} choice={choice} setChoice={setChoice} remaining={remaining} lock={()=>{tone("lock");act("pick",{pick:choice});}} kick={playerId=>act("kick",{playerId})} busy={busy} tone={tone}/>
      )}
      {state.room.status === "results" && (
        <Results key={`results-${state.room.round}`} state={state} next={advanceRound} leave={leaveRoom} busy={busy} tone={tone}/>
      )}
      {state.room.status === "finished" && (
        <Finished state={state} champion={champion} restart={()=>act("restart")} busy={busy} tone={tone}/>
      )}
    </main>
  );
}

function BorderlandAtmosphere(){return <div className="borderland-atmosphere" aria-hidden="true"><img className="balance-scale-bg" src="/balance-scale.svg" alt=""/><img className="lady-justice-blueprint-bg" src="/median-lady-justice-blueprint.svg" alt=""/><img className="borderland-crossing" src="/borderland-crossing.svg" alt=""/><img className="borderland-gate" src="/borderland-gate.svg" alt=""/><img className="borderland-visa" src="/borderland-visa.svg" alt=""/></div>}

function AnnouncementRehearsal({now,soundOn,toggleSound,tone}:{now:number;soundOn:boolean;toggleSound:()=>void;tone:(kind:SoundKind)=>void}){
  const [preview,setPreview]=useState<AmendmentPreview|null>(null);
  const [loop,setLoop]=useState(false);
  const launch=(id:RuleAmendmentId)=>{tone("select");setPreview(current=>({id,startedAt:Date.now(),run:(current?.run??0)+1}));};
  useEffect(()=>{
    if(!loop||!preview)return;
    const timer=window.setTimeout(()=>setPreview(current=>current?{...current,startedAt:Date.now(),run:current.run+1}:current),RULE_AMENDMENTS[preview.id].duration+650);
    return()=>window.clearTimeout(timer);
  },[loop,preview]);
  return <main className="game-shell announcement-lab">
    <div className="grain" aria-hidden="true"/><div className="suit-field" aria-hidden="true"/><BorderlandAtmosphere/>
    <header className="announcement-lab-head"><div><img src="/king-diamond.svg" alt=""/><span><small>INTERNAL TEST CHANNEL</small><strong>ANNOUNCEMENT REHEARSAL</strong></span></div><Link href="/">RETURN TO SITE →</Link></header>
    <nav className="announcement-lab-console" aria-label="Choose an announcement to rehearse">
      <div className="lab-announcement-list">{(Object.keys(RULE_AMENDMENTS) as RuleAmendmentId[]).map(id=><button className={preview?.id===id?"active":""} onClick={()=>launch(id)} key={id}><b>{RULE_AMENDMENTS[id].number}</b><span>{RULE_AMENDMENTS[id].title}</span></button>)}</div>
      <div className="lab-playback"><button onClick={toggleSound}>{soundOn?"SOUND ON":"ENABLE SOUND"}</button><button className={loop?"active":""} aria-pressed={loop} onClick={()=>setLoop(value=>!value)}>LOOP {loop?"ON":"OFF"}</button>{preview&&<button onClick={()=>launch(preview.id)}>REPLAY ↻</button>}</div>
    </nav>
    {preview?<RuleAmendmentTransition key={`${preview.id}-${preview.run}`} preview={preview} now={now} soundOn={soundOn} tone={tone}/>:<section className="announcement-lab-idle"><span>K♦ / AUDIO-VISUAL TEST</span><h1>SELECT AN<br/><em>AMENDMENT</em></h1><p>Every test uses the production narration, timing, card reveal and transmission sequence. Turn on Loop to rehearse one announcement continuously.</p></section>}
  </main>;
}

const AMENDMENT_CUES:Record<RuleAmendmentId,[number,number,number]>={
  tie_seal:[.14,.47,.76],
  consecutive_tie:[.14,.48,.73],
  duplicates_void:[.13,.46,.75],
  exact_double:[.14,.45,.73],
  hundred_zero:[.14,.51,.72],
};

function AmendmentVisual({id,step,sealedNumbers=[42],mentionZero=false,mentionHundred=false}:{id:RuleAmendmentId;step:number;sealedNumbers?:number[];mentionZero?:boolean;mentionHundred?:boolean}){
  const amendment=RULE_AMENDMENTS[id];
  const seals=[...new Set(sealedNumbers.filter(value=>Number.isInteger(value)&&value>=0&&value<=100))];
  const displayedSeals=seals.length?seals:[42];
  const firstSeal=displayedSeals[0];
  const secondSeal=displayedSeals[1]??firstSeal;
  const intro=id==="hundred_zero"?<>FINAL RULE <br className="story-title-break"/>AMENDMENT</>:id==="consecutive_tie"?"DEADLOCK PROTOCOL":<>RULE <br className="story-title-break"/>AMENDMENT <br className="story-title-break"/>{amendment.number} / 05</>;
  return <div className={`amendment-story story-${id} story-step-${step} ${mentionZero?"mention-zero":""} ${mentionHundred?"mention-hundred":""}`}>
    <div className="story-title"><small>K♦ / TABLE AUTHORITY</small><h2>{intro}</h2><span>{amendment.title}</span></div>
    <div className="story-example" aria-hidden="true">
      {id==="tie_seal"&&<>
        <div className="choice-chip chip-a"><small>PLAYER A</small><b>{firstSeal}</b></div>
        <div className="choice-chip chip-b"><small>PLAYER B</small><b>{secondSeal}</b></div>
        <div className="tie-link">{displayedSeals.length>1?"EQUAL DISTANCE":"SAME CLOSEST CHOICE"}</div>
        <div className="seal-result"><b>{displayedSeals.join(" · ")}</b><i>×</i><span>SEALED</span><small>NEXT ROUND</small></div>
      </>}
      {id==="consecutive_tie"&&<>
        <div className="deadlock-round first"><small>ROUND 06</small><b>TIE</b></div>
        <div className="deadlock-repeat">AGAIN</div>
        <div className="deadlock-round second"><small>ROUND 07</small><b>TIE</b></div>
        <div className="penalty-card penalty-a"><small>PLAYER A</small><b>−1</b></div>
        <div className="penalty-card penalty-b"><small>PLAYER B</small><b>−1</b></div>
      </>}
      {id==="duplicates_void"&&<>
        <div className="duplicate-choice duplicate-a"><small>PLAYER A</small><b>37</b></div>
        <div className="duplicate-sign">=</div>
        <div className="duplicate-choice duplicate-b"><small>PLAYER B</small><b>37</b></div>
        <div className="void-cross cross-a"/><div className="void-cross cross-b"/>
        <div className="valid-equation"><span>18 + 44 + 52</span><b>÷ 3</b><i>=</i><strong>38</strong></div>
      </>}
      {id==="exact_double"&&<>
        <div className="target-gauge"><span>33</span><span className="exact-choice">34</span><span>41</span><i/><b>TARGET 34.00</b></div>
        <div className="exact-lock">EXACT MATCH</div>
        <div className="loss-switch"><span>LOSING PENALTY</span><b className="single-loss">−1</b><i>→</i><b className="double-loss">−2</b></div>
      </>}
      {id==="hundred_zero"&&<>
        <div className="extreme-choice extreme-zero"><small>SELECTED</small><b>0</b><span>ZERO</span></div>
        <div className="extreme-versus">VS</div>
        <div className="extreme-choice extreme-hundred"><small>SELECTED</small><b>100</b><span>ONE HUNDRED</span><i>♛</i></div>
        <div className="extreme-impact"><strong>100</strong><span>DEFEATS</span><s>0</s></div>
      </>}
    </div>
  </div>;
}

function RuleAmendmentTransition({state,preview,now,soundOn,tone}:{state?:GameState;preview?:AmendmentPreview;now:number;soundOn:boolean;tone:(kind:SoundKind)=>void}) {
  const clockAnchor=useRef({server:now,client:0});
  const [renderNow,setRenderNow]=useState(now);
  useEffect(()=>{
    let frame=0;
    let lastPaint=0;
    const tick=(timestamp:number)=>{
      if(clockAnchor.current.client===0)clockAnchor.current.client=performance.now();
      if(timestamp-lastPaint>=50){
        lastPaint=timestamp;
        const anchor=clockAnchor.current;
        setRenderNow(anchor.server+(performance.now()-anchor.client));
      }
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(frame);
  },[]);
  useEffect(()=>{
    const anchor=clockAnchor.current;
    const estimated=anchor.server+(performance.now()-anchor.client);
    if(Math.abs(now-estimated)>1200)clockAnchor.current={server:now,client:performance.now()};
  },[now]);
  const currentNow=renderNow;
  const ids=preview?[preview.id]:state?.room.amendmentIds.length?state.room.amendmentIds:["duplicates_void" as RuleAmendmentId];
  const startedAt=preview?.startedAt??state?.room.briefingStartedAt??currentNow;
  const elapsed=Math.max(0,currentNow-startedAt);
  let elapsedBeforeActive=0;
  let activeIndex=ids.length-1;
  let cursor=0;
  for(let index=0;index<ids.length;index++){
    const duration=RULE_AMENDMENTS[ids[index]].duration;
    if(elapsed<cursor+duration||index===ids.length-1){activeIndex=index;elapsedBeforeActive=cursor;break;}
    cursor+=duration;
  }
  const activeId=ids[activeIndex];
  const amendment=RULE_AMENDMENTS[activeId];
  const itemElapsed=Math.max(0,elapsed-elapsedBeforeActive);
  const serverProgress=Math.max(0,Math.min(1,itemElapsed/amendment.duration));
  const itemStartsAt=startedAt+elapsedBeforeActive;
  const endsAt=preview?preview.startedAt+amendment.duration:state?.room.briefingEndsAt??currentNow;
  const seconds=Math.max(0,Math.ceil((endsAt-currentNow)/1000));
  const [voiceClock,setVoiceClock]=useState<{id:RuleAmendmentId|"";current:number;duration:number;playing:boolean;mode:"idle"|"loading"|"voice"|"fallback";fallbackStartedAt:number}>({id:"",current:0,duration:0,playing:false,mode:"idle",fallbackStartedAt:0});

  useEffect(()=>{
    if(!soundOn)return;
    const audio=new Audio(amendment.audioSrc);
    audio.preload="auto";
    let cancelled=false;
    let started=false;
    let mediaReady=false;
    let syncFrame=0;
    let lastSync=0;
    const timers:number[]=[];
    // Anchor the server-authored start time to this browser once. Clock skew
    // and later polling updates cannot make the local presentation jump.
    const clientStartAt=Date.now()+Math.max(0,itemStartsAt-currentNow);
    const estimatedServerNow=()=>itemStartsAt+Math.max(0,Date.now()-clientStartAt);
    const later=(callback:()=>void,delay:number)=>{timers.push(window.setTimeout(callback,Math.max(0,delay)));};
    const sync=()=>setVoiceClock({id:activeId,current:audio.currentTime,duration:Number.isFinite(audio.duration)?audio.duration:amendment.duration/1000,playing:!audio.paused,mode:"voice",fallbackStartedAt:0});
    const syncLoop=(timestamp:number)=>{
      if(cancelled)return;
      if(timestamp-lastSync>=50){lastSync=timestamp;sync();}
      syncFrame=window.requestAnimationFrame(syncLoop);
    };
    const startSync=()=>{if(!syncFrame)syncFrame=window.requestAnimationFrame(syncLoop);};
    const beginFallback=()=>{
      if(cancelled||started)return;
      if(Date.now()<clientStartAt){later(beginFallback,clientStartAt-Date.now());return;}
      started=true;
      tone("amendment");
      setVoiceClock({id:activeId,current:0,duration:amendment.duration/1000,playing:true,mode:"fallback",fallbackStartedAt:estimatedServerNow()});
    };
    const beginVoice=()=>{
      if(cancelled||started||!mediaReady)return;
      if(Date.now()<clientStartAt){later(beginVoice,clientStartAt-Date.now());return;}
      started=true;
      audio.currentTime=0;
      audio.play().then(()=>{startSync();sync();}).catch(()=>{started=false;beginFallback();});
    };
    const ready=()=>{mediaReady=true;beginVoice();};
    setVoiceClock({id:activeId,current:0,duration:0,playing:false,mode:"loading",fallbackStartedAt:0});
    audio.addEventListener("canplay",ready,{once:true});
    audio.addEventListener("canplaythrough",ready,{once:true});
    audio.addEventListener("timeupdate",sync);
    audio.addEventListener("play",sync);
    audio.addEventListener("pause",sync);
    audio.addEventListener("ended",sync);
    audio.addEventListener("error",beginFallback,{once:true});
    audio.load();
    later(beginVoice,clientStartAt-Date.now());
    // If decoding or autoplay stalls, start the visual fallback shortly after
    // the scheduled beat instead of leaving the player on a frozen frame.
    later(beginFallback,clientStartAt-Date.now()+1500);
    return()=>{cancelled=true;timers.forEach(timer=>window.clearTimeout(timer));if(syncFrame)window.cancelAnimationFrame(syncFrame);audio.removeEventListener("canplay",ready);audio.removeEventListener("canplaythrough",ready);audio.removeEventListener("timeupdate",sync);audio.removeEventListener("play",sync);audio.removeEventListener("pause",sync);audio.removeEventListener("ended",sync);audio.removeEventListener("error",beginFallback);audio.pause();};
  // Each amendment receives one locally anchored narration attempt.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[activeId,itemStartsAt,soundOn,tone]);

  const voiceProgress=voiceClock.id===activeId&&voiceClock.duration>0?voiceClock.current/voiceClock.duration:0;
  const fallbackProgress=voiceClock.id===activeId&&voiceClock.mode==="fallback"?Math.max(0,(currentNow-voiceClock.fallbackStartedAt)/amendment.duration):0;
  // With narration enabled, visuals stay at frame zero until media is ready
  // and the scheduled start arrives. They never reveal elapsed beats first.
  const progress=soundOn
    ?Math.max(0,Math.min(1,voiceClock.mode==="voice"?voiceProgress:voiceClock.mode==="fallback"?fallbackProgress:0))
    :serverProgress;
  const cues=AMENDMENT_CUES[activeId];
  const beat=progress<cues[0]?0:progress<cues[1]?1:progress<cues[2]?2:3;
  const mentionZero=activeId==="hundred_zero"&&((progress>=.14&&progress<.29)||progress>=.83);
  const mentionHundred=activeId==="hundred_zero"&&((progress>=.29&&progress<.53)||(progress>=.60&&progress<.83));

  return <section className={`rule-amendment-stage kinetic-amendment amendment-${activeId} beat-${beat} ${soundOn&&voiceClock.playing?"voice-playing":""} ${currentNow<itemStartsAt||voiceClock.mode==="loading"?"announcement-preparing":""}`} style={{"--voice-progress":progress} as React.CSSProperties} aria-live="assertive" aria-label={`Rule amendment: ${amendment.title}`}>
    <div className="amendment-scan" aria-hidden="true"/>
    <header className="amendment-head"><span>{preview?"REHEARSAL":`ROUND ${String(state?.room.round??0).padStart(2,"0")}`}</span><b>TABLE AMENDMENT</b><small>{preview?`TRANSMISSION · ${seconds}s`:`SELECTION OPENS IN ${seconds}s`}</small></header>
    <AmendmentVisual id={activeId} step={beat} sealedNumbers={state?.room.bannedNumbers} mentionZero={mentionZero} mentionHundred={mentionHundred}/>
    <div className="amendment-queue" aria-label={`${activeIndex+1} of ${ids.length} amendments`}>
      {ids.map((id,index)=><span className={index<activeIndex?"done":index===activeIndex?"active":""} key={id}><b>{RULE_AMENDMENTS[id].number}</b>{RULE_AMENDMENTS[id].title}</span>)}
    </div>
    <div className="amendment-timeline"><i style={{transform:`scaleX(${progress})`}}/></div>
  </section>;
}

function CreepingJoker(){
  const [appearance,setAppearance]=useState({visible:false,x:50,tilt:0,gazeX:0,gazeY:5});
  useEffect(()=>{let arrival=0,departure=0,cooldown=0,cancelled=false;const schedule=()=>{const delay=[7000,11000,16000][Math.floor(Math.random()*3)];arrival=window.setTimeout(()=>{if(cancelled)return;const mobile=window.innerWidth<600;const left=Math.random()<.5;const x=mobile?(left?8:92):50;setAppearance(value=>({...value,visible:true,x,tilt:-3+Math.random()*6,gazeX:0,gazeY:5}));departure=window.setTimeout(()=>{setAppearance(value=>({...value,visible:false}));cooldown=window.setTimeout(schedule,6000+Math.random()*6000);},14000);},delay);};schedule();return()=>{cancelled=true;clearTimeout(arrival);clearTimeout(departure);clearTimeout(cooldown);};},[]);
  useEffect(()=>{const follow=(event:PointerEvent)=>setAppearance(value=>value.visible?{...value,gazeX:(event.clientX/window.innerWidth-.5)*12,gazeY:Math.max(2,Math.min(8,event.clientY/window.innerHeight*9))}:value);const roam=window.setInterval(()=>setAppearance(value=>value.visible?{...value,gazeX:-5+Math.random()*10,gazeY:3+Math.random()*5}:value),720);window.addEventListener("pointermove",follow,{passive:true});return()=>{clearInterval(roam);window.removeEventListener("pointermove",follow);};},[]);
  const fingers=()=>Array.from({length:4}).map((_,index)=><i key={index}/>);
  return <div className={`creeping-joker ${appearance.visible?"is-visible":""}`} style={{"--joker-x":`${appearance.x}%`,"--joker-tilt":`${appearance.tilt}deg`,"--look-x":`${appearance.gazeX}px`,"--look-y":`${appearance.gazeY}px`} as React.CSSProperties} aria-hidden="true"><div className="joker-grip"/><div className="joker-hand left">{fingers()}<b/></div><div className="joker-hand right">{fingers()}<b/></div><div className="joker-head"><div className="joker-hat"><i/><b>♦</b><i/></div><div className="joker-face"><span className="joker-brow left"/><span className="joker-brow right"/><span className="joker-eye left"><i/></span><span className="joker-eye right"><i/></span><span className="joker-nose">♦</span><span className="joker-smile"/></div><small>YOU SHOULD HAVE CHOSEN LOWER</small></div></div>;
}
function Frame({children,screen,setScreen}:{children:React.ReactNode;screen:"home"|"rules"|"create"|"join";setScreen:(v:"home"|"rules"|"create"|"join")=>void}) { return <><div className="grain"/><div className="suit-field" aria-hidden="true"/><BorderlandAtmosphere/>{screen==="home"&&<CreepingJoker/>}<header className="topbar"><button className="brand" onClick={()=>setScreen("home")}><span className="brand-mark"><img src="/king-diamond.svg" alt=""/></span><span>MEDIAN</span></button><span className="topbar-lore" aria-hidden="true">K ♦ / CITIZEN CLASS</span><nav className="home-tabs" aria-label="Homepage navigation"><button className={screen==="home"?"active":""} onClick={()=>setScreen("home")}>GAME</button><button className={screen==="rules"?"active":""} onClick={()=>setScreen("rules")}>RULES</button></nav></header>{children}</>; }

function Landing(p:{screen:"home"|"rules"|"create"|"join";setScreen:(v:"home"|"rules"|"create"|"join")=>void;name:string;setName:(v:string)=>void;avatar:string;setAvatar:(v:string)=>void;code:string;setCode:(v:string)=>void;seconds:number;setSeconds:(v:number)=>void;enter:(e:FormEvent<HTMLFormElement>)=>void;busy:boolean;error:string;tone:(kind:SoundKind)=>void}) {
  const [cardFlipped,setCardFlipped]=useState(false);
  return <main className={`shell landing-${p.screen}`}><Frame screen={p.screen} setScreen={p.setScreen}>
    {p.screen==="rules"?<RulesDeck play={()=>p.setScreen("create")}/>:p.screen==="home"?<><section className="hero"><h1><span className="title-the">THE</span><span className="title-beauty">BEAUTY</span><em>CONTEST</em></h1><p className="lede">Choose a number. Read the room. Survive the average.</p>
      <div className="actions"><button className="primary" onClick={()=>p.setScreen("create")}><span>CREATE ROOM</span><b>↗</b></button><button className="secondary" onClick={()=>p.setScreen("join")}>JOIN WITH CODE</button></div>
    </section><button type="button" className={`hero-table-card ${cardFlipped?"is-flipped":""}`} aria-label="Flip the King of Diamonds playing card" aria-pressed={cardFlipped} onClick={()=>{p.tone("flip");setCardFlipped(value=>!value);}}><span className="hero-card-inner"><span className="hero-card-face front"><img src="/king-diamond-card.svg" alt="Mirrored King of Diamonds playing card"/></span><span className="hero-card-face back"><img src="/king-diamond.svg" alt=""/><b>K♦</b><small>THE TABLE IS WATCHING</small></span></span></button><footer className="home-footer"><nav className="public-legal-links" aria-label="Legal information"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="https://github.com/frostful/Beauty-Contest" target="_blank" rel="noreferrer">Source</a><a href="https://github.com/frostful/Beauty-Contest/blob/main/LICENSE" target="_blank" rel="noreferrer">AGPL-3.0</a><span>© 2026 frostful · Code provided without warranty · Unofficial fan-made game, not affiliated with Netflix</span></nav></footer></>:
      <section className="entry-stage"><form className="entry-panel" onSubmit={p.enter}><button type="button" className="back" onClick={()=>p.setScreen("home")}>←</button><span className="form-kicker">{p.screen==="create"?"NEW FIVE-SEAT MATCH":"ENTER PROTOCOL"}</span>
        {p.screen==="join"&&<label>ROOM CODE<input value={p.code} onChange={e=>p.setCode(e.target.value.replace(/[^a-z]/gi,"").toUpperCase())} required minLength={4} maxLength={4} pattern="[A-Za-z]{4}" placeholder="KJRM"/></label>}
        <label>PLAYER NAME<input value={p.name} onChange={e=>p.setName(e.target.value)} required maxLength={18} placeholder="YOUR ALIAS"/></label>
        <div className="avatar-picker"><span>CHOOSE PROFILE</span><div>{AVATAR_OPTIONS.map(option=><button type="button" aria-label={`Choose ${option.label} profile`} aria-pressed={p.avatar===option.id} className={p.avatar===option.id?"selected":""} onClick={()=>p.setAvatar(option.id)} key={option.id}><AvatarBadge avatar={option.id}/><small>{option.label}</small></button>)}</div></div>
        {p.screen==="create"&&<div className="timer-pick"><span>ROUND TIMER</span><div>{[[30,"30 SEC"],[60,"1 MIN"],[180,"3 MIN · SERIES"]].map(([v,l])=><button type="button" className={p.seconds===v?"active":""} key={v} onClick={()=>p.setSeconds(Number(v))}>{l}</button>)}</div></div>}
        {p.error&&<p className="form-error">{p.error}</p>}{p.screen==="create"?<button className="enter-btn" disabled={p.busy}>{p.busy?"CONNECTING…":"CREATE ROOM  →"}</button>:<div className="join-actions"><button className="enter-btn" value="join" disabled={p.busy}>{p.busy?"CONNECTING…":"JOIN TO PLAY  →"}</button><button className="spectator-enter" value="spectate" disabled={p.busy}>WATCH AS SPECTATOR ◉</button></div>}<p className="entry-legal">By entering, you agree to the <a href="/terms">Terms</a> and acknowledge the <a href="/privacy">Privacy Policy</a>. Use an alias—not your real name.</p>
      </form></section>}
  </Frame></main>;
}

function RulesDeck({play}:{play:()=>void}) {
  const cards=[
    {rank:"A",step:"01 / 04",kind:"select",title:"SELECT",copy:"Choose one whole number between 0 and 100."},
    {rank:"J",step:"02 / 04",kind:"calculate",title:"CALCULATE",copy:"Add every valid choice, then divide by the number of players."},
    {rank:"Q",step:"03 / 04",kind:"target",title:"TARGET",copy:"Multiply the average by 0.8 to set the target."},
    {rank:"K",step:"04 / 04",kind:"survive",title:"SURVIVE",copy:"The closest player gains 1 point. Every other player loses 1 point."},
  ];
  const diagram=(kind:string)=>{
    if(kind==="select")return <div className="rule-diagram select-diagram" aria-label="A number line from zero to one hundred with thirty-seven selected"><small>YOUR CHOICE</small><div><span>0</span><i><b/></i><span>100</span></div><strong>37</strong></div>;
    if(kind==="calculate")return <div className="rule-diagram calculate-diagram" aria-label="Eighteen plus thirty-seven plus fifty-two plus sixty-three, divided by four, equals forty-two point five"><div className="calculation-numerator"><span>18</span><i>+</i><span>37</span><i>+</i><span>52</span><i>+</i><span>63</span></div><div className="fraction-line"/><b>4</b><i className="calculation-arrow">↓</i><strong>42.5</strong></div>;
    if(kind==="target")return <div className="rule-diagram target-diagram" aria-label="Forty-two point five multiplied by zero point eight equals thirty-four"><span>42.5</span><b>× 0.8</b><i/><strong>34</strong></div>;
    return <div className="rule-diagram survive-diagram" aria-label="Choices twenty-nine, thirty-three, thirty-four, forty-one and fifty-eight, with thirty-four closest to the target"><small>↑ TARGET</small><div>{[29,33,34,41,58].map(value=><span className={value===34?"closest":""} key={value}>{value}</span>)}</div><strong>CLOSEST</strong></div>;
  };
  return <section className="rules-page classic-rules"><div className="rules-intro"><span className="section-index">K♦ / GAME PROTOCOL</span><h2>RULES OF<br/><em>THE TABLE</em></h2><p>Four diamond cards define the contest. Later rounds unlock harsher conditions as players are eliminated.</p></div><div className="classic-rules-deck">{cards.map((card,index)=><article className={`classic-rule-card ${card.kind}-card`} style={{"--card-index":index} as React.CSSProperties} key={card.rank}><span className="classic-corner top"><b>{card.rank}</b><i>♦</i></span><span className="rule-step">{card.step}</span>{diagram(card.kind)}<div className="classic-rule-copy"><h3>{card.title}</h3><p>{card.copy}</p></div><span className="classic-corner bottom"><b>{card.rank}</b><i>♦</i></span></article>)}</div><button className="rules-play" onClick={play}>ACCEPT RULES — CREATE ROOM <span>→</span></button></section>;
}

function Loading({error,retry,leave}:{error:string;retry:()=>void;leave:()=>void}) { return <main className="loading-screen"><div className="loader-orb">0.8</div><p>{error||"ESTABLISHING SECURE ROOM…"}</p>{error&&<div className="loading-actions"><button onClick={retry}>RECONNECT</button><button onClick={leave}>RETURN HOME</button></div>}</main>; }

function AvatarBadge({avatar}:{avatar:string}){const option=AVATAR_OPTIONS.find(item=>item.id===avatar)??AVATAR_OPTIONS[0];return <span className={`profile-avatar avatar-${option.id}`} aria-hidden="true"><b>{option.symbol}</b></span>}

function Lobby({state,copy,fillBots,kick,start,busy,copied}:{state:GameState;copy:()=>void;fillBots:()=>void;kick:(playerId:string)=>void;start:()=>void;busy:boolean;copied:boolean}) {
  const openSeats=Math.max(0,DEFAULT_ROOM_SIZE-state.players.length);
  return <section className="lobby"><div className="lobby-copy"><span className="section-index">01 / ASSEMBLY</span><h2>WAITING<br/>FOR PLAYERS</h2><p>Share the access code. The host begins when every mind is in the room.</p><button className="code-card" onClick={copy}><small>ROOM ACCESS CODE</small><strong>{state.room.code}</strong><span>{copied?"COPIED":"COPY INVITE LINK"} ↗</span></button></div>
    <div className="roster"><div className="roster-head"><span>CONNECTED PLAYERS</span><b>{state.players.length}<i>/{DEFAULT_ROOM_SIZE}</i></b></div>{state.players.map((p,i)=><div className={`roster-row ${p.isBot?"bot-player":""}`} key={p.id}><span className="seat">{String(i+1).padStart(2,"0")}</span><AvatarBadge avatar={p.avatar}/><strong>{p.name}{p.id===state.me.id&&<small> YOU</small>}{p.isBot&&<small> BOT</small>}</strong>{p.isHost?<em>HOST ♦</em>:<i className={p.online?"online":""}>{p.isBot?"SIMULATION":p.online?"READY":"AWAY"}</i>}{state.me.isHost&&p.id!==state.me.id&&<button className="kick-player-btn" disabled={busy} onClick={()=>kick(p.id)} aria-label={`Remove ${p.name} from the room`}>KICK</button>}</div>)}
      {Array.from({length:Math.max(0,Math.min(3,DEFAULT_ROOM_SIZE-state.players.length))}).map((_,i)=><div className="roster-row empty" key={i}><span className="seat">—</span><span className="avatar">+</span><strong>OPEN SEAT</strong></div>)}
      {state.spectators.length>0&&<div className="spectator-gallery"><span>OBSERVERS · {state.spectators.length}</span><div>{state.spectators.map(spectator=><span className={spectator.online?"online":""} key={spectator.id}><AvatarBadge avatar={spectator.avatar}/><b>{spectator.name}{spectator.id===state.me.id&&<small> YOU</small>}</b><i>◉</i></span>)}</div></div>}
      {state.me.isHost?<div className="lobby-actions">{openSeats>0&&<button className="fill-bots-btn" disabled={busy} onClick={fillBots}>FILL {openSeats} SEAT{openSeats===1?"":"S"} WITH BOTS <b>♟</b></button>}<button className="start-btn" disabled={busy||state.players.length<2} onClick={start}>{state.players.length<2?"WAITING FOR 1 MORE PLAYER":"BEGIN THE CONTEST  →"}</button></div>:<p className="host-wait"><i/> HOST WILL BEGIN THE CONTEST</p>}
    </div></section>;
}

function Arena({state,choice,setChoice,remaining,lock,kick,busy,tone}:{state:GameState;choice:number;setChoice:(v:number)=>void;remaining:number;lock:()=>void;kick:(playerId:string)=>void;busy:boolean;tone:(kind:SoundKind)=>void}) {
  const progress=state.room.roundSeconds?remaining/state.room.roundSeconds:0; const urgent=remaining<=10; const banned=state.room.bannedNumbers??[]; const sealed=banned.includes(choice);
  const lastSelectTone=useRef(0);
  const lastTick=useRef(-1);
  const soundSelect=()=>{const now=performance.now();if(now-lastSelectTone.current>80){lastSelectTone.current=now;tone("select");}};
  useEffect(()=>{tone("round");},[state.room.round,tone]);
  useEffect(()=>{if(remaining>0&&remaining<=5&&lastTick.current!==remaining){lastTick.current=remaining;tone("tick");}},[remaining,tone]);
  const step=(direction:-1|1)=>{if(busy)return;let next=choice+direction;while(next>=0&&next<=100&&banned.includes(next))next+=direction;soundSelect();setChoice(Math.max(0,Math.min(100,next)));};
  return <section className="arena"><div className={`timer ${urgent?"urgent":""}`} style={{"--progress":`${progress*360}deg`} as React.CSSProperties}><small>TIME</small><strong>{String(Math.floor(remaining/60)).padStart(2,"0")}:{String(remaining%60).padStart(2,"0")}</strong><span>REMAINING</span></div>
    <div className="choice-zone"><span className="section-index">ROUND {String(state.room.round).padStart(2,"0")} / SELECT</span><h2>{state.me.isSpectator?"OBSERVATION\nMODE":state.me.submitted?"CHOICE\nLOCKED":"CHOOSE YOUR\nNUMBER"}</h2>{banned.length>0&&!state.me.submitted&&!state.me.isSpectator&&<div className="deadlock-banner"><small>DEADLOCK PROTOCOL</small><strong>{banned.join(" · ")}</strong><span>SEALED THIS ROUND</span></div>}{state.me.isSpectator?<div className="spectator-card">LIVE OBSERVER<small>You can watch every round without affecting the contest.</small><span>◉ READ-ONLY SEAT</span></div>:!state.me.alive?<div className="eliminated-card">GAME OVER<small>You may observe the remaining contest.</small></div>:state.me.submitted?<div className="locked-choice"><small>YOUR SELECTION</small><strong>{String(state.me.pick).padStart(2,"0")}</strong><span>TRANSMITTED ✓</span></div>:<><div className={`number-control ${sealed?"sealed":""} ${busy?"committing":""}`}><button onClick={()=>step(-1)} disabled={busy} aria-label="Decrease choice">−</button><strong>{String(choice).padStart(2,"0")}</strong><button onClick={()=>step(1)} disabled={busy} aria-label="Increase choice">+</button></div><div className="range-wrap"><input className="range" aria-label="Choose a number" type="range" min="0" max="100" value={choice} disabled={busy} onChange={e=>{if(busy)return;soundSelect();setChoice(Number(e.target.value));}}/>{banned.map(number=><i className="sealed-notch" style={{left:`${number}%`}} key={number}/>)}</div><div className="range-labels"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>{sealed&&<p className="sealed-warning">NUMBER {choice} IS SEALED — MOVE OFF THE RED MARK</p>}<button className="lock-btn" onClick={lock} disabled={busy||sealed}>{busy?"LOCKING…":sealed?"NUMBER SEALED":"LOCK SELECTION"} <span>→</span></button></>}</div>
    <div className="player-feed"><span className="section-index">LIVE STATUS</span>{state.players.map(p=><div className={`feed-row ${!p.alive?"dead":""}`} key={p.id}><AvatarBadge avatar={p.avatar}/><strong>{p.name}{p.id===state.me.id&&<small> YOU</small>}{p.isBot&&<small> BOT</small>}</strong><i>{!p.alive?"ELIMINATED":p.submitted?"LOCKED ✓":"THINKING…"}</i><b>{p.score}</b>{state.me.isHost&&p.id!==state.me.id&&<button className="kick-player-btn compact" disabled={busy} onClick={()=>kick(p.id)} aria-label={`Remove ${p.name} from the game`}>×</button>}</div>)}</div>
  </section>;
}

function HostScorePanel({players,adjust,pending}:{players:Player[];adjust:(playerId:string,delta:-1|1)=>void;pending:Set<string>}) {
  const [open,setOpen]=useState(false);
  return <aside className={`test-score-panel ${open?"open":""}`} aria-label="Temporary host score controls">
    <button className="test-score-toggle" onClick={()=>setOpen(value=>!value)} aria-expanded={open}><span>±</span> TEST SCORES</button>
    <div className="test-score-drawer">
      <header><span><small>TEMPORARY HOST TOOL</small><strong>SCORE OVERRIDE</strong></span><button onClick={()=>setOpen(false)} aria-label="Close testing controls">×</button></header>
      <p>Adjustments sync instantly for every connected screen.</p>
      <div className="test-score-list">{players.map(player=><div className={!player.alive?"dead":""} key={player.id}><AvatarBadge avatar={player.avatar}/><span><b>{player.name}</b><small>{pending.has(player.id)?"SAVING":player.alive?"ACTIVE":"ELIMINATED"}</small></span><button disabled={pending.has(player.id)} onClick={()=>adjust(player.id,-1)} aria-label={`Remove one point from ${player.name}`}>−</button><strong aria-live="polite">{player.score}</strong><button disabled={pending.has(player.id)} onClick={()=>adjust(player.id,1)} aria-label={`Add one point to ${player.name}`}>+</button></div>)}</div>
    </div>
  </aside>;
}

function visibleShare(element:HTMLElement) {
  const rect=element.getBoundingClientRect();
  const visible=Math.max(0,Math.min(rect.bottom,window.innerHeight)-Math.max(rect.top,0));
  return visible/Math.max(1,Math.min(rect.height,window.innerHeight));
}

function Results({state,next,leave,busy,tone}:{state:GameState;next:()=>void;leave:()=>void;busy:boolean;tone:(kind:SoundKind)=>void}) {
  const participants=state.players.filter(player=>player.submitted&&player.pick!==null);
  const finalAverage=state.room.average??0;
  const finalTarget=state.room.target??0;
  const totalOfPicks=participants.reduce((sum,player)=>sum+(player.pick??0),0);
  const terminalRound=state.players.filter(player=>player.alive).length<=1;
  const eliminatedThisRound=state.players.filter(player=>!player.alive&&player.roundDelta<0&&player.score<=-10&&player.score-player.roundDelta>-10);
  const eliminatedIds=new Set(eliminatedThisRound.map(player=>player.id));
  const meEliminatedThisRound=eliminatedIds.has(state.me.id);
  const eligible=participants.filter(player=>!player.invalid);
  const closestDistance=eligible.length?Math.min(...eligible.map(player=>Math.abs((player.pick??0)-finalTarget))):Infinity;
  const tiedIds=new Set(state.room.winnerName==="TIE"?eligible.filter(player=>Math.abs(Math.abs((player.pick??0)-finalTarget)-closestDistance)<.000001).map(player=>player.id):[]);
  const defaultSelectedId=state.room.winnerId??eligible.find(player=>tiedIds.has(player.id))?.id??state.me.id;
  const transferStep=900;
  const transferDuration=760;
  const transferStart=500;
  const loadEnd=transferStart+Math.max(0,participants.length-1)*transferStep+transferDuration+650;
  const balanceEnd=loadEnd+2300;
  const factorEnd=balanceEnd+1900;
  const lineEnd=factorEnd+2200;
  const acidStart=lineEnd+700;
  const acidEnd=acidStart+(eliminatedThisRound.length?4300:0);
  const total=acidEnd+400;
  const [elapsed,setElapsed]=useState(0);
  const [skipped,setSkipped]=useState(false);
  const [selectedId,setSelectedId]=useState(defaultSelectedId);
  const [ledgerExpanded,setLedgerExpanded]=useState(false);
  const [personalVerdict,setPersonalVerdict]=useState(false);
  const stageRef=useRef<HTMLElement|null>(null);
  const machineRef=useRef<HTMLDivElement|null>(null);
  const ledgerRef=useRef<HTMLDivElement|null>(null);
  const previousBeat=useRef(-1);
  const skipRequested=useRef(false);
  const lastManualNavigation=useRef(0);
  const revealTarget=useCallback((target:HTMLElement|null,block:ScrollLogicalPosition)=>{
    if(!target||Date.now()-lastManualNavigation.current<1800||visibleShare(target)>=.72)return;
    const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({behavior:reduced?"auto":"smooth",block});
    if(document.activeElement===document.body)target.focus({preventScroll:true});
  },[]);

  useEffect(()=>{
    const mark=()=>{lastManualNavigation.current=Date.now();};
    window.addEventListener("wheel",mark,{passive:true});
    window.addEventListener("touchstart",mark,{passive:true});
    window.addEventListener("pointerdown",mark,{passive:true});
    window.addEventListener("keydown",mark);
    return()=>{window.removeEventListener("wheel",mark);window.removeEventListener("touchstart",mark);window.removeEventListener("pointerdown",mark);window.removeEventListener("keydown",mark);};
  },[]);

  useEffect(()=>{
    const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const presentationStartedAt=performance.now();
    skipRequested.current=false;
    let frame=0;
    const tick=()=>{
      if(skipRequested.current){setElapsed(total);return;}
      const value=reduced?total:Math.max(0,Math.min(total,performance.now()-presentationStartedAt));
      setElapsed(value);
      if(value<total)frame=requestAnimationFrame(tick);
    };
    tick();
    return()=>cancelAnimationFrame(frame);
  },[state.room.round,total]);

  useEffect(()=>{
    const timer=window.setTimeout(()=>revealTarget(stageRef.current,"start"),180);
    return()=>clearTimeout(timer);
  },[state.room.round,revealTarget]);
  useEffect(()=>{setLedgerExpanded(false);},[state.room.round]);

  const phase=elapsed<loadEnd?0:elapsed<balanceEnd?1:elapsed<factorEnd?2:elapsed<lineEnd?3:4;
  const arrivedCount=Math.min(participants.length,Math.max(0,Math.floor((elapsed-transferStart-transferDuration)/transferStep)+1));
  const transferIndex=elapsed<transferStart?-1:Math.min(participants.length-1,Math.floor((elapsed-transferStart)/transferStep));
  const activeTransfer=phase===0&&transferIndex>=0&&transferIndex<participants.length&&elapsed<transferStart+transferIndex*transferStep+transferDuration?transferIndex:-1;
  const arrived=participants.slice(0,arrivedCount);
  const runningSum=arrived.reduce((sum,player)=>sum+(player.pick??0),0);
  const balanceProgress=Math.max(0,Math.min(1,(elapsed-loadEnd)/(balanceEnd-loadEnd)));
  const factorProgress=Math.max(0,Math.min(1,(elapsed-balanceEnd)/(factorEnd-balanceEnd)));
  const lineProgress=Math.max(0,Math.min(1,(elapsed-factorEnd)/(lineEnd-factorEnd)));
  const lineIdentityVisible=phase===4||lineProgress>=.92;
  const final=phase===4;
  const acidActive=eliminatedThisRound.length>0&&elapsed>=acidStart;
  const acidComplete=eliminatedThisRound.length===0||elapsed>=acidEnd;
  const selected=participants.find(player=>player.id===selectedId)??participants.find(player=>player.id===state.me.id)??participants[0];
  const sorted=[...participants].sort((a,b)=>Math.abs((a.pick??0)-finalTarget)-Math.abs((b.pick??0)-finalTarget));
  const visibleScores=ledgerExpanded?sorted:[];
  const selectedIsWinner=selected&&!eliminatedIds.has(selected.id)&&!selected.invalid&&(selected.id===state.room.winnerId||tiedIds.has(selected.id));
  const status=phase===0
    ? activeTransfer>=0?`Adding ${participants[activeTransfer]?.name}'s choice`:"Preparing submitted choices"
    : phase===1?"Balancing the sum against equal average weights"
      : phase===2?"Removing one fifth to calculate the target"
        : phase===3?"Placing every choice around the target"
          : acidActive&&!acidComplete?"Elimination protocol active":"Round resolved";

  useEffect(()=>{
    if(skipped)return;
    const beat=phase===0?activeTransfer:phase+participants.length;
    if(previousBeat.current===beat)return;
    previousBeat.current=beat;
    if(phase===0&&activeTransfer>=0)tone("transfer");
    if(phase===1)tone("divide");
    if(phase===2)tone("multiply");
    if(phase===3)tone("target");
    if(phase===4)tone("resolve");
  },[phase,activeTransfer,participants.length,skipped,tone]);
  useEffect(()=>{
    const timer=window.setTimeout(()=>{
      const target=phase===4?ledgerRef.current:machineRef.current;
      revealTarget(target,phase===4?"start":"center");
    },220);
    return()=>window.clearTimeout(timer);
  },[phase,state.room.round,revealTarget]);
  useEffect(()=>{if(acidActive&&!acidComplete&&!skipped)tone("eliminate");},[acidActive,acidComplete,skipped,tone]);
  useEffect(()=>{
    if(!acidComplete||!meEliminatedThisRound)return;
    const timer=window.setTimeout(()=>setPersonalVerdict(true),450);
    return()=>clearTimeout(timer);
  },[acidComplete,meEliminatedThisRound,state.room.round]);
  const skipAnimation=()=>{skipRequested.current=true;setSkipped(true);setElapsed(total);};

  return <>
    <section ref={stageRef} tabIndex={-1} className={`results ceremony-stage phase-${phase} ${final?"resolved":""}`} aria-label="Round calculation">
      <div className="ceremony-topline">
        <div><span>ROUND {String(state.room.round).padStart(2,"0")}</span><strong>{status}</strong></div>
        {!final&&<button onClick={skipAnimation}>Skip to result <b>→</b></button>}
      </div>

      <nav className={`ceremony-progress ${final?"is-collapsed":""}`} aria-label="Calculation progress" aria-hidden={final}>
        {["Sum","Average","Target","Closest"].map((label,index)=><span className={phase===index?"active":phase>index?"done":""} key={label}><b>0{index+1}</b>{label}</span>)}
      </nav>

      <div ref={machineRef} tabIndex={-1} className="ceremony-machine">
        {phase===0&&<div className="choice-rail" data-count={participants.length} aria-label="Submitted choices">
          {participants.map((player,index)=><div className={`${index===activeTransfer?"active":""} ${index<arrivedCount?"loaded":""}`} key={player.id}><AvatarBadge avatar={player.avatar}/><span>{player.name}</span><b>{player.pick}</b></div>)}
        </div>}
        {phase===0&&activeTransfer>=0&&<div key={activeTransfer} className="traveling-choice" aria-hidden="true">{participants[activeTransfer]?.pick}</div>}

        {phase<3
          ? <ScaleInstrument
              phase={phase}
              participants={participants}
              arrived={arrived}
              runningSum={runningSum}
              total={totalOfPicks}
              average={finalAverage}
              target={finalTarget}
              balanceProgress={balanceProgress}
              factorProgress={factorProgress}
            />
          : <ResultNumberLine
              players={participants}
              meId={state.me.id}
              winnerId={state.room.winnerId}
              tiedIds={tiedIds}
              eliminatedIds={eliminatedIds}
              average={finalAverage}
              target={finalTarget}
              progress={lineProgress}
              selectedId={selected?.id??""}
              select={setSelectedId}
            />}
      </div>

      {phase>=3&&lineIdentityVisible&&<div className="marker-detail" aria-live="polite">
        {selected&&<><AvatarBadge avatar={selected.avatar}/><span><small>{selectedIsWinner?(tiedIds.has(selected.id)?"TIED CLOSEST":"ROUND WINNER"):selected.id===state.me.id?"YOUR POSITION":"SELECTED POSITION"}</small><strong>{selected.name}</strong></span><b>{selected.pick}</b><span><small>DISTANCE</small><strong>{Math.abs((selected.pick??0)-finalTarget).toFixed(2)}</strong></span></>}
      </div>}

      {final&&<div ref={ledgerRef} tabIndex={-1} className={`result-ledger-shell ${ledgerExpanded?"is-expanded":"is-collapsed"}`} aria-label="Round scores">
        <div id="round-player-leaderboard" className="result-ledger" data-count={visibleScores.length} hidden={!ledgerExpanded}>
        {visibleScores.map((player,index)=>{const outcomeWinner=!eliminatedIds.has(player.id)&&!player.invalid&&(player.id===state.room.winnerId||tiedIds.has(player.id));return <button onClick={()=>setSelectedId(player.id)} className={`${player.id===state.me.id?"self":""} ${outcomeWinner?"winner":""} ${eliminatedIds.has(player.id)?"eliminated":""}`} key={player.id}>
          <span>{String(index+1).padStart(2,"0")}</span><AvatarBadge avatar={player.avatar}/><strong>{player.name}{player.id===state.me.id&&<small>YOU</small>}</strong><b>{player.pick}</b><em>Δ {Math.abs((player.pick??0)-finalTarget).toFixed(2)}</em><i><small>ROUND</small><b>{player.roundDelta>0?"+":""}{player.roundDelta}</b><small>TOTAL</small><b>{player.score}</b></i>
        </button>})}
        </div>
        <button className="ledger-toggle" onClick={()=>{tone("reveal");setLedgerExpanded(value=>!value);}} aria-expanded={ledgerExpanded} aria-controls="round-player-leaderboard">{ledgerExpanded?"HIDE PLAYER LEADERBOARD":"SHOW PLAYER LEADERBOARD"}<b>{ledgerExpanded?"↑":"↓"}</b><span>{sorted.length} PLAYERS</span></button>
      </div>}

      {acidActive&&<AcidCeremony players={eliminatedThisRound} complete={acidComplete}/>}

      {final&&acidComplete&&<footer className="ceremony-verdict">
        <div><img src="/king-diamond.svg" alt=""/><p>{state.room.winnerName==="TIE"?<><strong>{participants.filter(player=>tiedIds.has(player.id)).map(player=>player.name).join(", ")}</strong> are tied closest</>:state.room.winnerName==="NO WINNER"?"No valid winner":<><strong>{state.room.winnerName}</strong> is closest</>}</p></div>
        <div className="verdict-notices">{state.room.exactHit&&<span>Exact match · double loss active</span>}{state.room.message&&<span>{state.room.message}</span>}</div>
        {terminalRound?<p className="coronation-pending"><i/> Champion reveal begins automatically</p>:state.me.isHost?<button className="next-btn" onClick={next} disabled={busy}>Next round <b>→</b></button>:<p className="host-wait"><i/> Waiting for host</p>}
      </footer>}
    </section>
    {personalVerdict&&<PersonalElimination player={state.me} spectate={()=>setPersonalVerdict(false)} leave={leave}/>}
  </>;
}

function ScaleInstrument({phase,participants,arrived,runningSum,total,average,target,balanceProgress,factorProgress}:{phase:number;participants:Player[];arrived:Player[];runningSum:number;total:number;average:number;target:number;balanceProgress:number;factorProgress:number}) {
  const tilt=phase===0?-7*Math.min(1,arrived.length/Math.max(1,participants.length)):-(1-balanceProgress)*7;
  const panTravel=Math.sin(tilt*Math.PI/180)*220;
  const displayedAverage=average*balanceProgress;
  const counterTotal=total*balanceProgress;
  return <div className={`scale-instrument mode-${phase}`} style={{"--beam-tilt":`${tilt}deg`,"--left-pan-shift":`${-panTravel}px`,"--right-pan-shift":`${panTravel}px`} as React.CSSProperties}>
    <div className="scale-equation">
      {phase===0?<><small>SUM OF CHOICES</small><strong>{runningSum}</strong><span>{arrived.length} of {participants.length} loaded</span></>
      :phase===1?<><small>SOLVE THE EQUAL WEIGHT</small><strong>{total} = {participants.length} × {displayedAverage.toFixed(2)}</strong><span>The beam levels when each weight equals the average</span></>
      :<><small>KEEP FOUR OF FIVE EQUAL PARTS</small><strong>{average.toFixed(2)} × 4/5 = {(target*factorProgress).toFixed(2)}</strong><span>One fifth is removed from the average</span></>}
    </div>
    <div className="traditional-scale" aria-label="Calculation balance">
      <div className="scale-pan-card left">
        <small>{phase===0?"LOADED CHOICES":"LEFT PAN"}</small>
        <strong>{phase===0?runningSum:total}</strong>
        <div className="scale-token-row">{phase===0?arrived.slice(-6).map(player=><b key={player.id}>{player.pick}</b>):<b>Σ</b>}</div>
      </div>
      <div className="scale-hardware" aria-hidden="true">
        <div className="scale-beam"><i/><i/></div>
        <div className="scale-pillar"><span>♦</span></div>
        <div className="scale-base"/>
      </div>
      <div className="scale-pan-card right">
        <small>{phase===0?"COUNTERWEIGHT":phase===1?"EQUAL WEIGHT":"FOUR OF FIVE"}</small>
        {phase===0?<strong>0</strong>:phase===1?<><strong>{counterTotal.toFixed(0)}</strong><span>{participants.length} × {displayedAverage.toFixed(2)}</span></>:<div className="fifths">{[0,1,2,3,4].map(index=><b className={index===4?"removed":""} style={{"--remove-progress":factorProgress} as React.CSSProperties} key={index}>⅕</b>)}</div>}
      </div>
    </div>
  </div>;
}

function ResultNumberLine({players,meId,winnerId,tiedIds,eliminatedIds,average,target,progress,selectedId,select}:{players:Player[];meId:string;winnerId:string|null;tiedIds:Set<string>;eliminatedIds:Set<string>;average:number;target:number;progress:number;selectedId:string;select:(id:string)=>void}) {
  const clusters=[...players.reduce((map,player)=>{const pick=player.pick??0;const cluster=map.get(pick)??[];cluster.push(player);map.set(pick,cluster);return map;},new Map<number,Player[]>())]
    .map(([pick,members])=>({pick,members})).sort((a,b)=>a.pick-b.pick);
  const lanes=new Map<number,number>();
  const last=[-100,-100,-100,-100];
  clusters.forEach(cluster=>{let lane=last.findIndex(value=>cluster.pick-value>=7);if(lane<0)lane=last.indexOf(Math.min(...last));last[lane]=cluster.pick;lanes.set(cluster.pick,lane);});
  const visibleTarget=average+(target-average)*progress;
  const revealIdentity=progress>=.92;
  const revealOutcome=progress>=.985;
  const referencesNear=Math.abs(average-visibleTarget)<8;
  return <div className="result-line">
    <div className="line-field">
      <div className="axis"/>
      {[0,25,50,75,100].map(value=><span className="axis-tick" style={{left:`${value}%`}} key={value}>{value}</span>)}
      <div className={`reference average ${referencesNear?"near":""}`} style={{left:`${average}%`}} aria-label={`Average ${average.toFixed(2)}`}><i/><b>AVG</b><strong>{average.toFixed(2)}</strong></div>
      <div className={`reference target ${referencesNear?"near":""}`} style={{left:`${visibleTarget}%`}} aria-label={`Target ${target.toFixed(2)}`}><i/><b>TARGET</b><strong>{visibleTarget.toFixed(2)}</strong></div>
      {clusters.map((cluster,index)=>{
        const self=cluster.members.some(player=>player.id===meId);
        const activeWinners=cluster.members.filter(player=>!eliminatedIds.has(player.id)&&!player.invalid&&(player.id===winnerId||tiedIds.has(player.id)));
        const winner=activeWinners.length>0;
        const eliminated=cluster.members.every(player=>eliminatedIds.has(player.id));
        const selected=cluster.members.some(player=>player.id===selectedId);
        const markerProgress=Math.max(0,Math.min(1,(progress-(.1+index*.045))/.34));
        const preferred=cluster.members.find(player=>player.id===meId)??activeWinners[0]??cluster.members[0];
        const names=cluster.members.map(player=>player.name).join(", ");
        return <button aria-pressed={revealIdentity&&selected} aria-label={`${names}, choice ${cluster.pick}`} onClick={()=>revealIdentity&&select(preferred.id)} className={`line-dot ${revealIdentity&&self?"self":""} ${revealOutcome&&winner?"winner":""} ${revealOutcome&&eliminated?"eliminated":""}`} style={{left:`${cluster.pick}%`,"--lane":lanes.get(cluster.pick)??0,opacity:markerProgress,marginTop:`${(1-markerProgress)*10}px`,pointerEvents:revealIdentity?"auto":"none"} as React.CSSProperties} key={cluster.pick}>{revealOutcome&&winner&&<span>♛</span>}<i/><b>{cluster.pick}</b>{cluster.members.length>1&&<small>×{cluster.members.length}</small>}</button>})}
    </div>
  </div>;
}

function AcidCeremony({players,complete}:{players:Player[];complete:boolean}) {
  const ref=useRef<HTMLElement|null>(null);
  useEffect(()=>{ref.current?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"center"});ref.current?.focus({preventScroll:true});},[]);
  return <section ref={ref} tabIndex={-1} className={`acid-ceremony ${complete?"complete":""}`} aria-live="assertive">
    <small>ELIMINATION PROTOCOL · CONC. H₂SO₄</small>
    <h3>GAME OVER FOR <strong>{players.map(player=>player.name).join(", ")}</strong></h3>
    <div className="acid-cards">{players.map((player,index)=><article style={{"--acid-index":index} as React.CSSProperties} key={player.id}><i>♦</i><strong>{player.name}</strong><b>{player.score}</b><small>CITIZEN FILE · TERMINATED</small></article>)}</div>
    <div className="acid-pool" aria-hidden="true">{Array.from({length:12}).map((_,index)=><i style={{"--bubble":index} as React.CSSProperties} key={index}/>)}</div>
    <p>{complete?"ELIMINATION COMPLETE · NEXT ROUND UNLOCKED":"CORROSION SEQUENCE ACTIVE"}</p>
  </section>;
}

function PersonalElimination({player,spectate,leave}:{player:GameState["me"];spectate:()=>void;leave:()=>void}) {
  const dialogRef=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{const previous=document.body.style.overflow;document.body.style.overflow="hidden";dialogRef.current?.focus();return()=>{document.body.style.overflow=previous;};},[]);
  return <div ref={dialogRef} className="personal-elimination" role="dialog" aria-modal="true" aria-labelledby="personal-elimination-title" tabIndex={-1}>
    <div className="personal-acid-glow" aria-hidden="true"/>
    <span className="personal-verdict-code">CITIZEN FILE / ACCESS REVOKED</span>
    <div className="personal-death-visual" aria-hidden="true">
      <div className="personal-card-drop"><article><i>♦</i><strong>{player.name}</strong><b>{player.score}</b><small>K♦ CONTESTANT</small></article></div>
      <div className="personal-acid-vat"><div>{Array.from({length:14}).map((_,index)=><i style={{"--death-bubble":index} as React.CSSProperties} key={index}/>)}</div></div>
      <div className="personal-skull"><span>☠</span><i>H₂SO₄</i></div>
    </div>
    <div className="personal-death-copy"><small>ELIMINATION CONFIRMED</small><h2 id="personal-elimination-title">GAME OVER,<br/><strong>{player.name}</strong></h2><p>Your score reached −10. Your seat has been terminated.</p></div>
    <div className="personal-death-actions"><button onClick={spectate}>SPECTATE THE REMAINING GAME <b>◉</b></button><button onClick={leave}>LEAVE TO LOBBY <b>→</b></button></div>
  </div>;
}

function Finished({state,champion,restart,busy,tone}:{state:GameState;champion:Player|undefined;restart:()=>void;busy:boolean;tone:(kind:SoundKind)=>void}) {
  useEffect(()=>{const timer=window.setTimeout(()=>tone("victory"),420);return()=>window.clearTimeout(timer);},[champion?.id,tone]);
  const defeated=state.players.filter(player=>player.id!==champion?.id);
  return <section className={`finished coronation ${state.room.exactHit?"perfect-coronation":""}`}>
    <div className="coronation-glow" aria-hidden="true"/>
    <div className="fallen-cards" aria-hidden="true">{defeated.slice(0,8).map((player,index)=><span style={{"--fall-left":`${8+index*11}%`,"--fall-delay":`${index*.12}s`,"--fall-rotate":`${-20+index*7}deg`,"--fall-drift":`${(index-4)*18}px`,"--fall-end-rotate":`${80+index*45}deg`} as React.CSSProperties} key={player.id}><b>{player.name}</b><i>{player.score}</i></span>)}</div>
    <div className="coronation-copy"><span className="coronation-kicker">GAME CLEAR / TITLE TRANSFER</span><h2><strong>{champion?.name??"NO ONE"}</strong><small>{champion?"HAS CLAIMED THE":"THE TABLE CLAIMED"}</small><em>KING OF DIAMONDS</em></h2><p>{state.room.exactHit?"PERFECT EQUILIBRIUM":"LAST MIND STANDING"}</p></div>
    <div className="crowning-scale" aria-hidden="true"><i/><span><b>♦</b></span><i/></div>
    <div className="victory-card-scene">
      <div className="victory-card">
        <div className="victory-card-face victory-card-back"><span>K</span><img src="/king-diamond.svg" alt=""/><span>♦</span></div>
        <article className="victory-card-face victory-card-front">
          <span className="victory-corner top"><b>K</b><i>♦</i></span>
          <span className="victory-corner bottom"><b>K</b><i>♦</i></span>
          <small>CITIZEN / K♦</small>
          <AvatarBadge avatar={champion?.avatar??"diamond"}/>
          <h3>{champion?.name??"NO CROWN"}</h3>
          <p>NEW KING OF DIAMONDS</p>
          <div><span><small>FINAL SCORE</small><b>{champion?.score??"—"}</b></span><span><small>ROUNDS</small><b>{state.room.round}</b></span><span><small>FINAL PICK</small><b>{champion?.pick??"—"}</b></span></div>
        </article>
      </div>
    </div>
    <div className="coronation-actions">{state.me.isHost?<button className="restart-btn" onClick={restart} disabled={busy}>RETURN TO LOBBY <b>→</b></button>:<p className="host-wait"><i/> WAITING FOR HOST</p>}</div>
  </section>;
}
