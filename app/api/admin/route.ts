import { env } from "cloudflare:workers";
import { getD1 } from "../../../db";

export const dynamic="force-dynamic";
type AdminEnv={ADMIN_KEY?:string};
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});

async function secureEqual(left:string,right:string) {
  const encoder=new TextEncoder();
  const [leftHash,rightHash]=await Promise.all([
    crypto.subtle.digest("SHA-256",encoder.encode(left)),
    crypto.subtle.digest("SHA-256",encoder.encode(right)),
  ]);
  const leftBytes=new Uint8Array(leftHash),rightBytes=new Uint8Array(rightHash);
  let difference=0;
  for(let index=0;index<leftBytes.length;index++)difference|=leftBytes[index]^rightBytes[index];
  return difference===0;
}

export async function GET(request:Request){
  const runtime=env as unknown as AdminEnv;
  const supplied=request.headers.get("x-admin-key")??"";
  if(!runtime.ADMIN_KEY||supplied.length<16||!await secureEqual(supplied,runtime.ADMIN_KEY))return json({error:"Invalid administrator access key."},401);
  const db=getD1();
  const [roomStats,playerStats,roundStats,recentRooms,recentRounds,topPlayers]=await Promise.all([
    db.prepare("SELECT COUNT(*) total, SUM(CASE WHEN status IN ('lobby','playing','results','resolving') THEN 1 ELSE 0 END) active, SUM(CASE WHEN status='finished' THEN 1 ELSE 0 END) finished FROM rooms").first(),
    db.prepare("SELECT COUNT(*) total, COUNT(DISTINCT name) aliases FROM players").first(),
    db.prepare("SELECT COUNT(*) total, COALESCE(AVG(player_count),0) avg_players, COALESCE(AVG(target),0) avg_target, SUM(exact_hit) exact_hits FROM round_results").first(),
    db.prepare("SELECT r.code,r.status,r.round,r.round_seconds,r.winner_name,r.created_at,COUNT(DISTINCT p.id) player_count,COUNT(DISTINCT rr.id) rounds_played FROM rooms r LEFT JOIN players p ON p.room_code=r.code LEFT JOIN round_results rr ON rr.room_code=r.code GROUP BY r.code ORDER BY r.created_at DESC LIMIT 30").all(),
    db.prepare("SELECT id,room_code,round,player_count,average,target,winner_name,exact_hit,created_at FROM round_results ORDER BY created_at DESC LIMIT 20").all(),
    db.prepare("SELECT re.player_name,re.avatar,COUNT(*) rounds,SUM(re.won) wins,ROUND(AVG(re.distance),2) avg_distance FROM round_entries re GROUP BY re.player_id,re.player_name,re.avatar ORDER BY wins DESC,avg_distance ASC LIMIT 10").all(),
  ]);
  return json({generatedAt:Date.now(),summary:{rooms:roomStats,players:playerStats,rounds:roundStats},recentRooms:recentRooms.results,recentRounds:recentRounds.results,topPlayers:topPlayers.results});
}
