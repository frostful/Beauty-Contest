import { env } from "cloudflare:workers";
import { getD1 } from "../../../db";
import { calculateRound } from "../../../lib/round-engine";
import { JOIN_PLAYER_SQL, LOCK_PICK_SQL, RESET_START_PLAYERS_SQL, START_ROOM_SQL } from "../../../lib/game-writes";
import { getOnlineTokens, notifyRoom } from "../../../lib/realtime";
import {
  briefingPlaybackDuration,
  briefingWindowDuration,
  parseBriefingIds,
  tieBriefingIds,
  type RuleAmendmentId,
} from "../../../lib/rule-amendments";

export const dynamic = "force-dynamic";

type RoomRow = { code:string; host_token:string; status:string; round:number; initial_players:number; round_seconds:number; deadline:number|null; resolving_at:number|null; result_started_at:number|null; average:number|null; target:number|null; winner_id:string|null; winner_name:string|null; exact_hit:number; message:string|null; created_at:number };
type PlayerRow = { id:string; room_code:string; name:string; token:string; is_host:number; score:number; alive:number; pick:number|null; submitted:number; invalid:number; round_delta:number; joined_at:number; last_seen:number; avatar:string };

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const cleanName = (value: unknown) => String(value ?? "").trim().replace(/[^\p{L}\p{N} _.-]/gu, "").slice(0, 18);
const cleanCode = (value: unknown) => {
  const code=String(value??"").trim().toUpperCase();
  return /^[A-Z]{4}$/.test(code)?code:"";
};
const authorizationToken = (request:Request) => {
  const header=request.headers.get("authorization")??"";
  return header.startsWith("Bearer ")?header.slice(7):"";
};
const cleanSessionToken = (value:unknown) => {
  const sessionToken=String(value??"");
  return /^[A-Za-z0-9_]{20,96}$/.test(sessionToken)?sessionToken:"";
};
const testingControlsEnabled = () => {
  const value=(env as unknown as {ENABLE_TEST_SCORE_CONTROLS?:unknown}).ENABLE_TEST_SCORE_CONTROLS;
  return value===true||String(value??"").toLowerCase()==="true";
};
const avatars = new Set(["diamond","crown","laser","visa","rabbit","spade","heart","club"]);
const cleanAvatar = (value:unknown) => avatars.has(String(value)) ? String(value) : "diamond";
const DEFAULT_ROOM_SIZE = 5;
const HOST_OFFLINE_MS = 15_000;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const roomCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, b => chars[b % chars.length]).join("");
};
const token = () => crypto.randomUUID().replaceAll("-", "");
const databaseError = (error:unknown) => error instanceof Error?error.message:String(error);
const BOT_PROFILES = [
  {name:"ARIS",avatar:"diamond"},{name:"MIKA",avatar:"rabbit"},{name:"ZERO",avatar:"laser"},{name:"NERO",avatar:"spade"},
  {name:"KIRA",avatar:"heart"},{name:"SORA",avatar:"club"},{name:"REN",avatar:"visa"},{name:"AYA",avatar:"crown"},
  {name:"DAICHI",avatar:"diamond"},{name:"YUNA",avatar:"rabbit"},{name:"AKI",avatar:"laser"},
];
const botNumber=(key:string)=>{let value=2166136261;for(const char of key){value^=char.charCodeAt(0);value=Math.imul(value,16777619);}return (value>>>0)/4294967295;};
const legalBotPick=(value:number,banned:number[],direction=1)=>{let pick=Math.max(0,Math.min(100,Math.round(value)));while(banned.includes(pick)&&pick>=0&&pick<=100)pick+=direction;if(pick<0||pick>100){pick=Math.max(0,Math.min(100,Math.round(value)));while(banned.includes(pick)&&pick>=0&&pick<=100)pick-=direction;}return Math.max(0,Math.min(100,pick));};

async function submitReadyBots(db:D1Database,room:RoomRow){
  if(room.status!=="playing"||!room.deadline)return;
  const bots=(await db.prepare("SELECT * FROM players WHERE room_code = ? AND alive = 1 AND submitted = 0 AND token LIKE 'bot_%'").bind(room.code).all()).results as unknown as PlayerRow[];
  if(!bots.length)return;
  const previous=room.round>1?await db.prepare("SELECT average, target FROM round_results WHERE room_code = ? AND round = ?").bind(room.code,room.round-1).first<{average:number;target:number}>():null;
  const banned=await getBurnedNumbers(db,room.code,room.round-1);
  const baseTarget=previous?.target??40,baseAverage=previous?.average??50;
  const aliveCount=(await db.prepare("SELECT COUNT(*) AS count FROM players WHERE room_code=? AND alive=1 AND token NOT LIKE 'spectator_%'").bind(room.code).first<{count:number}>())?.count??bots.length;
  const statements=bots.flatMap(bot=>{
    const personality=Number(bot.token.split("_")[1]??0)%BOT_PROFILES.length;
    const noise=botNumber(`${bot.id}:${room.round}`);
    const candidates=[
      baseTarget*.72+(noise-.5)*3, // ARIS: recursive analyst
      baseAverage*.58+baseTarget*.42+(noise-.5)*5, // MIKA: average anchor
      baseTarget+(noise<.5?-1:1)*(8+noise*10), // ZERO: contrarian
      noise*100, // NERO: chaotic gambler
      Math.max(0,baseTarget-4-noise*8), // KIRA: undercutter
      baseTarget+5+noise*16, // SORA: optimistic anchor
      room.round===1?18+noise*42:baseTarget+(baseTarget-baseAverage)*.45+(noise-.5)*4, // REN: trend follower
      [0,25,50,75,100][Math.floor(noise*5)], // AYA: round-number loyalist
      baseTarget*.9+(noise-.5)*2, // DAICHI: conservative estimator
      baseAverage*.8+(noise-.5)*9, // YUNA: literal calculator
      room.round%2?Math.min(100,baseTarget+14):Math.max(0,baseTarget-14), // AKI: alternating bluff
    ];
    const duelCandidates=[
      room.round%3===0?0:Math.max(1,baseTarget*.58),
      room.round%2?Math.max(1,baseTarget*.86):Math.min(100,baseTarget+12),
      room.round%2?100:0,
      noise<.34?0:noise>.72?100:25+noise*50,
      Math.max(0,baseTarget-1-noise*3),
      Math.min(100,baseTarget+18+noise*15),
      room.round%2?Math.max(0,baseTarget*.7):Math.min(100,baseAverage+18),
      [0,25,50,75,100][(room.round+personality)%5],
      Math.max(1,baseTarget*.78),
      Math.max(0,Math.min(100,baseAverage*.8)),
      room.round%2?0:100,
    ];
    const pick=legalBotPick((aliveCount<=2?duelCandidates:candidates)[personality],banned,noise<.5?-1:1);
    return [db.prepare("UPDATE players SET pick=?, submitted=1, last_seen=? WHERE id=? AND submitted=0").bind(pick,Date.now(),bot.id)];
  });
  if(statements.length)await db.batch(statements);
}

async function removeExpiredRooms(db: D1Database) {
  await db.prepare("DELETE FROM rooms WHERE created_at < ?").bind(Date.now()-RETENTION_MS).run();
}

async function getRoom(db: D1Database, code: string) {
  return (await db.prepare("SELECT * FROM rooms WHERE code = ?").bind(code).first()) as RoomRow | null;
}

async function ensureConnectedHumanHost(db:D1Database,room:RoomRow,onlineTokens:Set<string>|null,forceTransfer=false) {
  const current=await db.prepare("SELECT * FROM players WHERE room_code=? AND is_host=1 LIMIT 1").bind(room.code).first<PlayerRow>();
  const currentIsConnectedHuman=!!current
    &&!current.token.startsWith("bot_")
    &&!current.token.startsWith("spectator_")
    &&(onlineTokens?.has(current.token)||Date.now()-current.last_seen<HOST_OFFLINE_MS);
  if(!forceTransfer&&currentIsConnectedHuman)return room;

  const connectedTokens=onlineTokens ? [...onlineTokens] : [];
  const humans=(await db.prepare(
    "SELECT * FROM players WHERE room_code=? AND token NOT LIKE 'bot_%' AND token NOT LIKE 'spectator_%' ORDER BY score DESC, alive DESC, joined_at ASC",
  ).bind(room.code).all()).results as unknown as PlayerRow[];
  const candidate=humans.find(player=>connectedTokens.includes(player.token)||Date.now()-player.last_seen<HOST_OFFLINE_MS)??null;
  if(!candidate){
    if(forceTransfer)await db.batch([
      db.prepare("UPDATE players SET is_host=0 WHERE room_code=?").bind(room.code),
      db.prepare("UPDATE rooms SET host_token='' WHERE code=?").bind(room.code),
    ]);
    return (await getRoom(db,room.code))??room;
  }
  await db.batch([
    db.prepare("UPDATE players SET is_host=0 WHERE room_code=?").bind(room.code),
    db.prepare("UPDATE players SET is_host=1 WHERE id=?").bind(candidate.id),
    db.prepare("UPDATE rooms SET host_token=? WHERE code=?").bind(candidate.token,room.code),
  ]);
  return (await getRoom(db,room.code))??room;
}

async function getBurnedNumbers(db: D1Database, code: string, round: number) {
  if (round < 1) return [] as number[];
  const result = await db.prepare("SELECT id FROM round_results WHERE room_code = ? AND round = ? AND winner_name = 'TIE'").bind(code, round).first<{id:string}>();
  if (!result) return [] as number[];
  const entries = (await db.prepare("SELECT DISTINCT pick FROM round_entries WHERE round_result_id = ? AND won = 1 ORDER BY pick").bind(result.id).all()).results as {pick:number}[];
  return entries.map(entry => Number(entry.pick));
}

async function amendmentsForCompletedRound(db:D1Database,room:RoomRow,aliveAfter:number) {
  const amendments:RuleAmendmentId[]=[];
  if(room.winner_name==="TIE"){
    const previous=room.round>1
      ? await db.prepare("SELECT winner_name FROM round_results WHERE room_code=? AND round=?").bind(room.code,room.round-1).first<{winner_name:string}>()
      : null;
    const earlierDeadlock=room.round>2
      ? await db.prepare(
        "SELECT 1 AS found FROM round_results current_result JOIN round_results previous_result ON previous_result.room_code=current_result.room_code AND previous_result.round=current_result.round-1 WHERE current_result.room_code=? AND current_result.round<? AND current_result.winner_name='TIE' AND previous_result.winner_name='TIE' LIMIT 1",
      ).bind(room.code,room.round).first<{found:number}>()
      : null;
    amendments.push(...tieBriefingIds({
      currentWasTie:true,
      previousWasTie:previous?.winner_name==="TIE",
      deadlockPreviouslyAnnounced:!!earlierDeadlock,
    }));
  }

  const newlyEliminated=(await db.prepare(
    "SELECT COUNT(*) AS count FROM players WHERE room_code=? AND token NOT LIKE 'spectator_%' AND alive=0 AND round_delta<0 AND score<=-10 AND score-round_delta>-10",
  ).bind(room.code).first<{count:number}>())?.count??0;
  const eliminatedAfter=Math.max(0,room.initial_players-aliveAfter);
  const eliminatedBefore=Math.max(0,eliminatedAfter-newlyEliminated);
  const thresholds:[number,RuleAmendmentId][]=[[1,"duplicates_void"],[2,"exact_double"]];
  for(const [threshold,id] of thresholds){
    if(eliminatedBefore<threshold&&eliminatedAfter>=threshold)amendments.push(id);
  }
  const aliveBefore=aliveAfter+newlyEliminated;
  if(aliveAfter===2&&aliveBefore>2)amendments.push("hundred_zero");
  return amendments;
}

async function resolveRound(db: D1Database, room: RoomRow) {
  const resolutionStartedAt=Date.now();
  const staleBefore=resolutionStartedAt-15_000;
  const claim = await db.prepare(
    "UPDATE rooms SET status='resolving', resolving_at=? WHERE code=? AND round=? AND (status='playing' OR (status='resolving' AND COALESCE(resolving_at,0)<?))",
  ).bind(resolutionStartedAt,room.code,room.round,staleBefore).run();
  if (!claim.meta.changes) return;
  const rows = (await db.prepare("SELECT p.*, COALESCE(pp.avatar, 'diamond') AS avatar FROM players p LEFT JOIN player_profiles pp ON pp.player_id=p.id WHERE p.room_code = ? AND p.alive = 1 ORDER BY p.joined_at").bind(room.code).all()).results as unknown as PlayerRow[];
  if (!rows.length) {
    await db.prepare("UPDATE rooms SET status='finished', resolving_at=NULL, deadline=NULL WHERE code=?").bind(room.code).run();
    return;
  }
  const previousResult = room.round > 1 ? await db.prepare("SELECT winner_name FROM round_results WHERE room_code = ? AND round = ?").bind(room.code, room.round - 1).first<{winner_name:string}>() : null;
  const eliminatedBefore = Math.max(0, room.initial_players - rows.length);
  const calculation=calculateRound(
    rows.map(player=>({id:player.id,name:player.name,score:player.score,pick:player.pick,submitted:!!player.submitted})),
    {eliminatedBefore,previousWasTie:previousResult?.winner_name==="TIE"},
  );
  const winner=calculation.winnerIds.length===1?rows.find(player=>player.id===calculation.winnerIds[0])??null:null;
  const roundResultId=`${room.code}:${room.round}`;
  const outcomeById=new Map(calculation.outcomes.map(outcome=>[outcome.id,outcome]));
  const submittedRows=rows.filter(player=>player.submitted&&player.pick!==null);
  const resultStartedAt=Date.now();
  // Commit the score, elimination, round record, and visible room state in one
  // transaction. Polling clients must never see a dead player in an open round.
  await db.batch([
    ...rows.map(player=>{const outcome=outcomeById.get(player.id)!;return db.prepare("UPDATE players SET pick=?, submitted=?, invalid=?, round_delta=?, score=?, alive=? WHERE id=?")
      .bind(outcome.pick,player.submitted?1:0,outcome.invalid?1:0,outcome.delta,outcome.score,outcome.alive?1:0,player.id);}),
    db.prepare("INSERT OR REPLACE INTO round_results (id, room_code, round, player_count, average, target, winner_id, winner_name, exact_hit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(roundResultId,room.code,room.round,calculation.submitted.length,calculation.average,calculation.target,winner?.id??null,calculation.winnerName,calculation.exact?1:0,resultStartedAt),
    ...submittedRows.map(player=>{const outcome=outcomeById.get(player.id)!;return db.prepare("INSERT OR REPLACE INTO round_entries (round_result_id, player_id, player_name, avatar, pick, distance, round_delta, score_after, won, invalid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(roundResultId,player.id,player.name,player.avatar,player.pick,outcome.distance,outcome.delta,outcome.score,outcome.won?1:0,outcome.invalid?1:0);}),
    // A terminal round still enters the calculation/results screen. The host
    // advances to the coronation only after the result has been presented.
    db.prepare("UPDATE rooms SET status='results', resolving_at=NULL, result_started_at=?, average=?, target=?, winner_id=?, winner_name=?, exact_hit=?, message=? WHERE code=?")
      .bind(resultStartedAt,calculation.average,calculation.target,winner?.id??null,calculation.winnerName,calculation.exact?1:0,calculation.notice||null,room.code),
  ]);
}

async function snapshot(db: D1Database, code: string, callerToken: string, retry=0) {
  let room = await getRoom(db, code);
  if (!room) return null;
  // Keep the heartbeat as a compatibility fallback for Sites previews. Direct
  // Cloudflare deployments use the room WebSocket as their primary presence.
  await db.prepare("UPDATE players SET last_seen = ? WHERE room_code = ? AND token = ? AND last_seen < ?")
    .bind(Date.now(), code, callerToken, Date.now()-10_000).run();
  const onlineTokens=await getOnlineTokens(code);
  room=await ensureConnectedHumanHost(db,room,onlineTokens);
  if(room.status==="resolving"&&(room.resolving_at??0)<Date.now()-15_000){
    await resolveRound(db,room);
    room=await getRoom(db,code);
    if(!room)return null;
  }
  if(room.status==="briefing"&&(room.deadline??0)<=Date.now()){
    const openedAt=Date.now();
    await db.prepare("UPDATE rooms SET status='playing', deadline=?, message=NULL WHERE code=? AND round=? AND status='briefing'")
      .bind(openedAt+room.round_seconds*1000,code,room.round).run();
    room=await getRoom(db,code);
    if(!room)return null;
  }
  if (room.status === "playing") {
    await submitReadyBots(db,room);
    const remaining = (await db.prepare("SELECT COUNT(*) AS count FROM players WHERE room_code = ? AND alive = 1 AND submitted = 0").bind(code).first<{count:number}>())?.count ?? 1;
    if ((room.deadline ?? 0) <= Date.now() || remaining === 0) {
      await resolveRound(db, room);
      room = await getRoom(db, code);
      if (!room) return null;
    }
  }
  if(room.status==="results"){
    const aliveCount=(await db.prepare("SELECT COUNT(*) AS count FROM players WHERE room_code=? AND alive=1 AND token NOT LIKE 'spectator_%'").bind(code).first<{count:number}>())?.count??0;
    if(aliveCount<=1&&room.result_started_at){
      const entryCount=(await db.prepare("SELECT COUNT(*) AS count FROM round_entries WHERE round_result_id=?").bind(`${code}:${room.round}`).first<{count:number}>())?.count??2;
      const eliminatedCount=(await db.prepare("SELECT COUNT(*) AS count FROM players WHERE room_code=? AND token NOT LIKE 'spectator_%' AND alive=0 AND round_delta<0 AND score<=-10 AND score-round_delta>-10").bind(code).first<{count:number}>())?.count??0;
      const presentationMs=9410+Math.max(0,entryCount-1)*900+(eliminatedCount?4300:0)+2000;
      if(Date.now()>=room.result_started_at+presentationMs){
        await db.prepare("UPDATE rooms SET status='finished', deadline=NULL WHERE code=? AND status='results'").bind(code).run();
        room=await getRoom(db,code);
        if(!room)return null;
      }
    }
  }
  const players = (await db.prepare("SELECT p.*, COALESCE(pp.avatar, 'diamond') AS avatar FROM players p LEFT JOIN player_profiles pp ON pp.player_id=p.id WHERE p.room_code = ? ORDER BY p.alive DESC, p.score DESC, p.joined_at ASC").bind(code).all()).results as unknown as PlayerRow[];
  // A Next-round mutation updates the room and clears picks together, but a
  // concurrent reader can otherwise combine its old room read with the new
  // player rows. Retry the snapshot whenever that boundary moved underneath
  // us instead of returning an impossible "results / zero choices" frame.
  const latestRoom=await getRoom(db,code);
  if(!latestRoom)return null;
  if(retry<2&&(latestRoom.status!==room.status||latestRoom.round!==room.round||latestRoom.result_started_at!==room.result_started_at)){
    return snapshot(db,code,callerToken,retry+1);
  }
  room=latestRoom;
  const me = players.find(p => p.token === callerToken);
  if (!me) return null;
  const spectators=players.filter(player=>player.token.startsWith("spectator_"));
  const contestants=players.filter(player=>!player.token.startsWith("spectator_"));
  const amendments=parseBriefingIds(room.message);
  const burnedRound = room.status === "playing" || room.status === "resolving" || room.status === "briefing" ? room.round - 1 : room.round;
  const bannedNumbers = await getBurnedNumbers(db, code, burnedRound);
  const roundChoicesHidden=room.status === "playing" || room.status === "resolving" || room.status === "briefing";
  let autoFinishAt:number|null=null;
  if(room.status==="results"&&room.result_started_at){
    const aliveCount=contestants.filter(player=>player.alive).length;
    if(aliveCount<=1){
      const entryCount=(await db.prepare("SELECT COUNT(*) AS count FROM round_entries WHERE round_result_id=?").bind(`${code}:${room.round}`).first<{count:number}>())?.count??2;
      const eliminatedCount=contestants.filter(player=>!player.alive&&player.round_delta<0&&player.score<=-10&&player.score-player.round_delta>-10).length;
      autoFinishAt=room.result_started_at+9410+Math.max(0,entryCount-1)*900+(eliminatedCount?4300:0)+2000;
    }
  }
  const isOnline=(player:PlayerRow)=>player.token.startsWith("bot_")||(onlineTokens?onlineTokens.has(player.token)||Date.now()-player.last_seen<HOST_OFFLINE_MS:Date.now()-player.last_seen<HOST_OFFLINE_MS);
  return {
    room: { code:room.code, status:room.status === "resolving" ? "playing" : room.status, round:room.round, roundSeconds:room.round_seconds, deadline:room.deadline, resultStartedAt:room.result_started_at, autoFinishAt, average:room.average, target:room.target, winnerId:room.winner_id, winnerName:room.winner_name, exactHit:!!room.exact_hit, message:room.status==="briefing"?null:room.message, initialPlayers:room.initial_players, bannedNumbers, amendmentIds:amendments, briefingStartedAt:room.status==="briefing"&&room.deadline?room.deadline-briefingPlaybackDuration(amendments):null, briefingEndsAt:room.status==="briefing"?room.deadline:null },
    me: { id:me.id, name:me.name, avatar:me.avatar, isHost:!!me.is_host, isSpectator:me.token.startsWith("spectator_"), alive:!!me.alive, submitted:!!me.submitted, pick:me.pick, score:me.score },
    players: contestants.map(p => ({ id:p.id, name:p.name, avatar:p.avatar, isHost:!!p.is_host, isBot:p.token.startsWith("bot_"), score:p.score, alive:!!p.alive, submitted:!!p.submitted, pick:roundChoicesHidden ? null : p.pick, invalid:!!p.invalid, roundDelta:p.round_delta, online:isOnline(p) })),
    spectators: spectators.map(p=>({id:p.id,name:p.name,avatar:p.avatar,online:isOnline(p)})),
    testControlsEnabled:testingControlsEnabled(),
    serverNow: Date.now(),
  };
}

export async function GET(request: Request) {
  const db = getD1();
  const url = new URL(request.url);
  const code = cleanCode(url.searchParams.get("code"));
  const caller = cleanSessionToken(authorizationToken(request));
  if(!code||!caller)return json({error:"Invalid room or session."},400);
  const state = await snapshot(db, code, caller);
  return state ? json(state) : json({ error:"Room or player session not found." }, 404);
}

export async function POST(request: Request) {
  const db = getD1();
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return json({ error:"Invalid request." }, 400); }
  const action = String(body.action ?? "");
  const name = cleanName(body.name);
  const avatar = cleanAvatar(body.avatar);
  const now = Date.now();

  if (action === "create") {
    if (name.length < 2) return json({ error:"Enter a name with at least 2 characters." }, 400);
    await removeExpiredRooms(db);
    let code="",hostToken="",created=false;
    const seconds = [30,60,180].includes(Number(body.roundSeconds)) ? Number(body.roundSeconds) : 180;
    for(let attempt=0;attempt<12;attempt++){
      code=roomCode();hostToken=token();const playerId=crypto.randomUUID();
      try{
        await db.batch([
          db.prepare("INSERT INTO rooms (code, host_token, round_seconds, created_at) VALUES (?, ?, ?, ?)").bind(code, hostToken, seconds, now),
          db.prepare("INSERT INTO players (id, room_code, name, token, is_host, joined_at, last_seen) VALUES (?, ?, ?, ?, 1, ?, ?)").bind(playerId, code, name, hostToken, now, now),
          db.prepare("INSERT INTO player_profiles (player_id, avatar) VALUES (?, ?)").bind(playerId,avatar),
        ]);
        created=true;
        break;
      }catch(error){
        if(databaseError(error).includes("rooms.code")&&attempt<11)continue;
        throw error;
      }
    }
    if(!created)return json({error:"Could not allocate a room code. Try again."},503);
    // Instantiate the room coordinator immediately. If the creator closes the
    // page before the first WebSocket opens, its alarm still removes the room.
    await notifyRoom(code);
    return json({ code, token:hostToken });
  }

  const code = cleanCode(body.code);
  const caller = cleanSessionToken(authorizationToken(request));
  if(!code)return json({error:"Enter a valid four-letter room code."},400);
  const room = await getRoom(db, code);
  if (!room) return json({ error:"That room does not exist." }, 404);

  if (action === "join" || action === "spectate") {
    const spectating=action==="spectate";
    if (!spectating&&room.status !== "lobby") return json({ error:"This match has already started. You can still join as a spectator." }, 409);
    if (spectating&&room.status==="finished") return json({error:"This match has already ended."},409);
    if (name.length < 2) return json({ error:"Enter a name with at least 2 characters." }, 400);
    const count = (await db.prepare("SELECT COUNT(*) AS count FROM players WHERE room_code = ? AND token NOT LIKE 'spectator_%'").bind(code).first<{count:number}>())?.count ?? 0;
    const spectatorCount=(await db.prepare("SELECT COUNT(*) AS count FROM players WHERE room_code = ? AND token LIKE 'spectator_%'").bind(code).first<{count:number}>())?.count??0;
    if (!spectating&&count >= DEFAULT_ROOM_SIZE) return json({ error:"This five-seat room is full. Join as a spectator instead." }, 409);
    if(spectating&&spectatorCount>=24)return json({error:"The spectator gallery is full."},409);
    const duplicate = await db.prepare("SELECT 1 FROM players WHERE room_code = ? AND name = ? COLLATE NOCASE").bind(code, name).first();
    if (duplicate) return json({ error:"That name is already taken in this room." }, 409);
    const playerToken = spectating?`spectator_${token()}`:token();
    const playerId=crypto.randomUUID();
    try {
      const inserted=await db.batch([
        db.prepare(JOIN_PLAYER_SQL).bind(playerId,code,name,playerToken,spectating?0:1,now,now,code,spectating?1:0),
        db.prepare("INSERT INTO player_profiles (player_id, avatar) SELECT id, ? FROM players WHERE id=?").bind(avatar,playerId),
      ]);
      if(!inserted[0].meta.changes)return json({error:"The match changed while you were joining. Please try again."},409);
    }
    catch(error) {
      const message=databaseError(error);
      if(message.includes("room_full"))return json({error:"This five-seat room is full. Join as a spectator instead."},409);
      if(message.includes("gallery_full"))return json({error:"The spectator gallery is full."},409);
      return json({ error:"That name is already taken in this room." }, 409);
    }
    await notifyRoom(code);
    return json({ code, token:playerToken });
  }

  if(!caller)return json({error:"Your player session has expired."},401);
  const me = await db.prepare("SELECT * FROM players WHERE room_code = ? AND token = ?").bind(code, caller).first<PlayerRow>();
  if (!me) return json({ error:"Your player session has expired." }, 401);

  if(action==="leave"){
    const leavingHost=!!me.is_host;
    const leavingActiveContestant=!me.token.startsWith("spectator_")&&!!me.alive&&room.status!=="lobby";
    await db.batch([
      db.prepare("DELETE FROM players WHERE id=? AND room_code=?").bind(me.id,code),
      ...(leavingActiveContestant
        ? [db.prepare("UPDATE rooms SET initial_players=MAX(0,initial_players-1) WHERE code=?").bind(code)]
        : []),
    ]);
    if(leavingHost)await ensureConnectedHumanHost(db,room,await getOnlineTokens(code),true);
    await notifyRoom(code);
    return json({left:true});
  } else if(action==="kick"){
    if(!me.is_host)return json({error:"Only the host can remove a player."},403);
    if(!["lobby","playing","briefing"].includes(room.status))return json({error:"Players cannot be removed during the result ceremony."},409);
    const playerId=String(body.playerId??"");
    if(playerId===me.id)return json({error:"Use Leave room to vacate your own seat."},409);
    const targetPlayer=await db.prepare("SELECT * FROM players WHERE id=? AND room_code=? AND token NOT LIKE 'spectator_%'").bind(playerId,code).first<PlayerRow>();
    if(!targetPlayer)return json({error:"Player not found."},404);
    const removingActiveContestant=!!targetPlayer.alive&&room.status!=="lobby";
    await db.batch([
      db.prepare("DELETE FROM players WHERE id=? AND room_code=?").bind(playerId,code),
      ...(removingActiveContestant
        ? [db.prepare("UPDATE rooms SET initial_players=MAX(0,initial_players-1) WHERE code=?").bind(code)]
        : []),
    ]);
  } else if(action==="adjustScore"){
    if(!testingControlsEnabled())return json({error:"Testing controls are disabled."},404);
    if(!me.is_host)return json({error:"Only the host can use testing controls."},403);
    if(room.status==="resolving")return json({error:"Scores cannot be adjusted while a round is being committed."},409);
    const playerId=String(body.playerId??""),delta=Number(body.delta);
    if(![-1,1].includes(delta))return json({error:"Testing adjustments must be +1 or −1."},400);
    const targetPlayer=await db.prepare("SELECT * FROM players WHERE id=? AND room_code=? AND token NOT LIKE 'spectator_%'").bind(playerId,code).first<PlayerRow>();
    if(!targetPlayer)return json({error:"Player not found."},404);
    // A positive test adjustment can explicitly restore an eliminated seat.
    // Negative adjustments still leave elimination to resolveRound, preventing
    // a verdict from appearing before the calculation ceremony.
    if(delta===1)await db.prepare("UPDATE players SET score=score+1, alive=CASE WHEN score+1>-10 THEN 1 ELSE alive END WHERE id=?").bind(playerId).run();
    else await db.prepare("UPDATE players SET score=score-1 WHERE id=?").bind(playerId).run();
  } else if (action === "fillBots") {
    if (!me.is_host || room.status !== "lobby") return json({ error:"Only the host can add bots before the match." }, 403);
    const existing=(await db.prepare("SELECT COUNT(*) AS count FROM players WHERE room_code = ? AND token NOT LIKE 'spectator_%'").bind(code).first<{count:number}>())?.count??0;
    const needed=Math.max(0,DEFAULT_ROOM_SIZE-existing);
    if(needed){
      const used=(await db.prepare("SELECT name FROM players WHERE room_code = ?").bind(code).all()).results.map(row=>String((row as {name:string}).name).toUpperCase());
      const available=BOT_PROFILES.slice(0,needed).map((profile,index)=>{let botName=profile.name,suffix=2;while(used.includes(botName.toUpperCase()))botName=`${profile.name}-${suffix++}`;used.push(botName.toUpperCase());return {...profile,name:botName,personality:index};});
      try {
        const inserted=await db.batch(available.flatMap(profile=>{
          const playerId=crypto.randomUUID(),botToken=`bot_${profile.personality}_${token()}`;
          return [
            db.prepare(JOIN_PLAYER_SQL).bind(playerId,code,profile.name,botToken,1,now+profile.personality,now,code,0),
            db.prepare("INSERT INTO player_profiles (player_id, avatar) SELECT id, ? FROM players WHERE id=?").bind(profile.avatar,playerId),
          ];
        }));
        if(!inserted[0].meta.changes)return json({error:"The match started while adding bots."},409);
      } catch(error) {
        if(databaseError(error).includes("room_full"))return json({error:"A player joined while the bot seats were being filled. Try again."},409);
        throw error;
      }
    }
  } else if (action === "start") {
    if (!me.is_host || room.status !== "lobby") return json({ error:"Only the host can start this match." }, 403);
    const count = (await db.prepare("SELECT COUNT(*) AS count FROM players WHERE room_code = ? AND token NOT LIKE 'spectator_%'").bind(code).first<{count:number}>())?.count ?? 0;
    if (count < 2) return json({ error:"At least 2 players are required." }, 409);
    const openingAmendments:RuleAmendmentId[]=count===2?["hundred_zero"]:[];
    const openingBriefing=openingAmendments.length>0;
    const started=await db.batch([
      db.prepare(RESET_START_PLAYERS_SQL).bind(code,code,caller,code,count),
      db.prepare(START_ROOM_SQL)
        .bind(openingBriefing?"briefing":"playing",count,now+(openingBriefing?briefingWindowDuration(openingAmendments):room.round_seconds*1000),openingBriefing?`briefing:${openingAmendments.join(",")}`:null,code,caller,code,count),
    ]);
    if(!started[1].meta.changes)return json({error:"The lobby changed while starting. Please try again."},409);
  } else if (action === "pick") {
    const pick = Number(body.pick);
    if (room.status !== "playing" || !me.alive) return json({ error:"You cannot submit right now." }, 409);
    if ((room.deadline??0)<=now) return json({error:"The selection time has ended."},409);
    if (!Number.isInteger(pick) || pick < 0 || pick > 100) return json({ error:"Choose a whole number from 0 to 100." }, 400);
    const bannedNumbers = await getBurnedNumbers(db, code, room.round - 1);
    if (bannedNumbers.includes(pick)) return json({ error:`${pick} was sealed by the previous tie. Choose another number.` }, 409);
    if (me.submitted) return json({ error:"Your choice is already locked." }, 409);
    const locked=await db.prepare(LOCK_PICK_SQL).bind(pick,now,me.id,room.round,Date.now()).run();
    if(!locked.meta.changes)return json({error:"Your choice is already locked or the round has ended."},409);
  } else if (action === "next") {
    if (!me.is_host || room.status !== "results") return json({ error:"Only the host can advance the match." }, 403);
    const aliveCount=(await db.prepare("SELECT COUNT(*) AS count FROM players WHERE room_code=? AND alive=1 AND token NOT LIKE 'spectator_%'").bind(code).first<{count:number}>())?.count??0;
    if(aliveCount<=1){
      await db.prepare("UPDATE rooms SET status='finished', deadline=NULL WHERE code=? AND round=? AND status='results'").bind(code,room.round).run();
    }else{
      const amendments=await amendmentsForCompletedRound(db,room,aliveCount);
      const hasBriefing=amendments.length>0;
      await db.batch([
        db.prepare("UPDATE players SET pick=NULL, submitted=0, invalid=0, round_delta=0 WHERE room_code=? AND EXISTS (SELECT 1 FROM rooms WHERE code=? AND round=? AND status='results')").bind(code,code,room.round),
        db.prepare("UPDATE rooms SET status=?, round=round+1, deadline=?, resolving_at=NULL, result_started_at=NULL, average=NULL, target=NULL, winner_id=NULL, winner_name=NULL, exact_hit=0, message=? WHERE code=? AND round=? AND status='results'")
          .bind(hasBriefing?"briefing":"playing",now+(hasBriefing?briefingWindowDuration(amendments):room.round_seconds*1000),hasBriefing?`briefing:${amendments.join(",")}`:null,code,room.round),
      ]);
    }
  } else if (action === "restart") {
    if (!me.is_host) return json({ error:"Only the host can restart." }, 403);
    if (room.status !== "finished") return json({ error:"The match can only return to the lobby after it has finished." }, 409);
    await db.batch([
      db.prepare("UPDATE rooms SET status='lobby', round=0, initial_players=0, deadline=NULL, resolving_at=NULL, result_started_at=NULL, average=NULL, target=NULL, winner_id=NULL, winner_name=NULL, exact_hit=0, message=NULL WHERE code=?").bind(code),
      db.prepare("UPDATE players SET score=0, alive=1, pick=NULL, submitted=0, invalid=0, round_delta=0 WHERE room_code=? AND token NOT LIKE 'spectator_%'").bind(code),
      db.prepare("UPDATE players SET score=0, alive=0, pick=NULL, submitted=0, invalid=0, round_delta=0 WHERE room_code=? AND token LIKE 'spectator_%'").bind(code),
    ]);
  } else return json({ error:"Unknown action." }, 400);

  const state=await snapshot(db, code, caller);
  await notifyRoom(code);
  return json(state);
}
