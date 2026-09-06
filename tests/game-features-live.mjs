import assert from 'node:assert/strict';

const base = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');
const origin = new URL(base);
if (!['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('This full feature test creates disposable games. Run it against a local server.');
const sessions = new Set();
const sockets = new Set();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(path, body, token, expected=200) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {'content-type':'application/json', ...(token ? {authorization:`Bearer ${token}`} : {})},
    ...(body === undefined ? {} : {body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(15000),
  });
  const text = await response.text();
  assert.equal(response.status, expected, `${path}: HTTP ${response.status}: ${text.slice(0,300)}`);
  try { return JSON.parse(text); } catch { throw new Error(`${path}: expected JSON, received ${text.slice(0,100) || 'an empty body'}`); }
}
const action = (s, action, extra={}, status=200) => request('/api/game',{action,code:s.code,...extra},s.token,status);
const get = s => request(`/api/game?code=${s.code}`,undefined,s.token);
async function create(name) {
  const s = await request('/api/game',{action:'create',name,roundSeconds:30});
  sessions.add(s); return s;
}
async function join(s,name,spectator=false) {
  const next = await request('/api/game',{action:spectator?'spectate':'join',code:s.code,name});
  sessions.add(next); return next;
}
async function leave(s) { await action(s,'leave'); sessions.delete(s); }
async function connect(s) {
  const ws = new WebSocket(`${base.replace(/^http/,'ws')}/api/live?code=${s.code}`,['median.v1',`median.auth.${s.token}`]);
  sockets.add(ws);
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('WebSocket connection timed out')),10000);
    ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
    ws.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('WebSocket connection failed'));},{once:true});
  });
  return ws;
}
async function playing(s) {
  for (let attempt=0;attempt<90;attempt++) {
    const state=await get(s);
    if(state.room.status==='playing')return state;
    assert.equal(state.room.status,'briefing');
    await sleep(1000);
  }
  throw new Error('Rule briefing did not finish');
}
function passed(message) { console.log(`PASS ${message}`); }

try {
  // This room deliberately never connects, exercising the real expiry alarm.
  const abandoned=await create('EXPIRY-CHECK');
  const expiresAfter=Date.now()+123000;
  const host=await create('LIVE-HOST');
  let hostSocket=await connect(host);
  let invalidations=0;
  hostSocket.addEventListener('message',e=>{if(String(e.data).includes('invalidate'))invalidations++;});
  const guest=await join(host,'LIVE-GUEST');
  const guestSocket=await connect(guest);
  const third=await join(host,'LIVE-THIRD');
  const thirdSocket=await connect(third);
  const spectator=await join(host,'LIVE-VIEWER',true);
  assert.equal((await get(spectator)).me.isSpectator,true);
  await request('/api/game',{action:'join',code:host.code,name:'LIVE-GUEST'},undefined,409);
  await action(guest,'start',{},403);
  await action(host,'fillBots');
  let state=await get(host);
  assert.equal(state.players.length,5);
  await request('/api/game',{action:'join',code:host.code,name:'EXTRA'},undefined,409);
  for (const bot of state.players.filter(p=>p.isBot)) await action(host,'kick',{playerId:bot.id});
  assert.equal((await get(host)).players.length,3);
  assert.ok(invalidations>0);
  passed('create, join, spectator, duplicate/full-room validation, bots, kick, host permissions, WebSocket updates');

  hostSocket.close();
  hostSocket=await connect(host);
  assert.equal((await get(host)).me.name,'LIVE-HOST');
  passed('reconnect retains the same seat');
  await action(host,'start');
  await action(spectator,'pick',{pick:25},409);
  await action(host,'pick',{pick:101},400);
  await action(host,'pick',{pick:20});
  assert.equal((await get(guest)).players.find(p=>p.name==='LIVE-HOST').pick,null);
  await action(host,'pick',{pick:21},409);
  await action(guest,'pick',{pick:40});
  state=await action(third,'pick',{pick:60});
  assert.equal(state.room.status,'results');
  assert.equal(state.room.average,40);
  assert.equal(state.room.target,32);
  assert.equal(state.room.winnerName,'LIVE-GUEST');
  assert.equal(state.players.find(p=>p.name==='LIVE-GUEST').score,1);
  passed('start, hidden choices, input validation, locked picks, scoring, results');

  await action(host,'next');
  for(const s of [host,guest,third])state=await action(s,'pick',{pick:37});
  assert.equal(state.room.winnerName,'TIE');
  state=await action(host,'next');
  assert.equal(state.room.status,'briefing');
  assert.ok(state.room.bannedNumbers.includes(37));
  await playing(host);
  await action(host,'pick',{pick:37},409);
  passed('next round, tie, rule briefing, sealed-number rejection');
  state=await get(host);
  await sleep(Math.max(0,state.room.deadline-Date.now()+100));
  await action(host,'pick',{pick:12},409);
  state=await get(host);
  assert.equal(state.room.status,'results');
  passed('deadline rejection and automatic timeout resolution');
  await leave(host); hostSocket.close();
  assert.equal((await get(guest)).me.isHost,true);
  passed('leaving and human host transfer');
  await leave(spectator); await leave(third); await leave(guest);
  thirdSocket.close(); guestSocket.close();

  const zero=await create('ZERO-SEAT');
  const zeroSocket=await connect(zero);
  const hundred=await join(zero,'HUNDRED-SEAT');
  const hundredSocket=await connect(hundred);
  state=await action(zero,'start');
  assert.deepEqual(state.room.amendmentIds,['hundred_zero']);
  await playing(zero);
  await action(zero,'pick',{pick:0});
  state=await action(hundred,'pick',{pick:100});
  assert.equal(state.room.winnerName,'HUNDRED-SEAT');
  assert.equal(state.players.find(p=>p.name==='ZERO-SEAT').alive,false);
  await sleep(Math.max(0,state.room.autoFinishAt-Date.now()+100));
  assert.equal((await get(zero)).room.status,'finished');
  state=await action(zero,'restart');
  assert.equal(state.room.status,'lobby');
  assert.ok(state.players.every(p=>p.alive&&p.score===0));
  passed('two-player amendment, 100 defeats 0, elimination, automatic coronation, restart');
  await leave(hundred);await leave(zero);hundredSocket.close();zeroSocket.close();

  await request('/api/admin',undefined,undefined,401);
  await action(abandoned,'adjustScore',{delta:1,playerId:'unused'},404);
  await request('/api/game',null,undefined,400);
  passed('admin protection, disabled test controls, malformed request handling');
  while(Date.now()<expiresAfter)await sleep(Math.min(1000,expiresAfter-Date.now()));
  await request(`/api/game?code=${abandoned.code}`,undefined,abandoned.token,404);
  sessions.delete(abandoned);
  passed('two-minute abandoned-room cleanup');
  console.log('All live feature checks passed.');
} finally {
  for (const ws of sockets)ws.close();
  for (const s of sessions) {
    try { await action(s,'leave'); } catch { /* Already removed or expired. */ }
  }
}
