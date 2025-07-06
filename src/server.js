// src/server.js – Final
// -------------------------------------------
// Node 18+   : package.json に "type": "module"
// 必要パッケージ:  npm i express socket.io
// -------------------------------------------
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

/* ===== コンフィグ ===== */
const PORT           = process.env.PORT || 3000;
const FIELD          = 600;
const SPEED          = 4;
const TAG_DIST       = 20;
const TAG_COOLDOWN   = 1000;   // 連続タッチ抑制
const ROUND_MS       = 30_000; // ラウンド長
const RESTART_DELAY  = 3000;   // 勝敗表示後の再開
const SCORE_INT      = 1000;   // 逃げ側 +1 点/秒
const BOT_TICK       = 200;    // ボット 5 fps
const BOT_ID         = 'bot';

/* ===== 障害物 (x,y,w,h) ===== */
const OBSTACLES = [
  {x:200,y:150,w:200,h:20},
  {x:100,y:350,w:400,h:20},
  {x:50 ,y:50 ,w:20 ,h:200},
  {x:530,y:350,w:20 ,h:200}
];

/* ===== HTTP / Socket.IO ===== */
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);
app.use(express.static(new URL('../public', import.meta.url).pathname));

/* ===== ゲーム状態 ===== */
let players = {};
let hunterId = null;
let lastTag  = 0;
let roundEnd = 0;
let scoreTimer = null, roundTimer = null;

/* ===== ヘルパ ===== */
const dist = (a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const hitObstacle = (x,y)=>
  OBSTACLES.some(o=> x>o.x-TAG_DIST && x<o.x+o.w+TAG_DIST &&
                     y>o.y-TAG_DIST && y<o.y+o.h+TAG_DIST );

/* ===== 初期ボット ===== */
spawnBot();
startScore();
startRound();

/* ===== ソケット接続 ===== */
io.on('connection', sock=>{
  console.log('CONNECT', sock.id, sock.handshake.address);

  /* ランダム座標（障害物上は避ける） */
  let x,y;
  do{ x=Math.random()*FIELD; y=Math.random()*FIELD; }while(hitObstacle(x,y));
  players[sock.id]={x,y,isHunter:false,score:0,bot:false};

  sock.emit('map', OBSTACLES);        // 障害物送信
  io.emit('state', players);

  /* --- 移動入力 --- */
  sock.on('move', dir=>{
    const p=players[sock.id]; if(!p) return;
    const ox=p.x, oy=p.y;
    let nx=ox+dir.x*SPEED, ny=oy+dir.y*SPEED;
    nx=Math.max(0,Math.min(FIELD,nx));
    ny=Math.max(0,Math.min(FIELD,ny));
    if(!hitObstacle(nx,ny)){ p.x=nx; p.y=ny; }
    if(p.x!==ox||p.y!==oy){
      tagCheck();
      io.emit('state', players);
    }
  });

  /* --- 切断 --- */
  sock.on('disconnect', ()=>{
    console.log('DISCONNECT', sock.id);
    const wasHunter = players[sock.id]?.isHunter;
    delete players[sock.id];
    if(wasHunter) selectNewHunter();
    io.emit('state', players);
  });
});

/* ===== 関数 ===== */

/* ボット生成 */
function spawnBot(){
  let x,y;
  do{ x=Math.random()*FIELD; y=Math.random()*FIELD; }while(hitObstacle(x,y));
  players[BOT_ID]={x,y,isHunter:true,score:0,bot:true};
  hunterId = BOT_ID;
}

/* ハンター交代判定 */
function tagCheck(){
  const now=Date.now();
  if(now-lastTag < TAG_COOLDOWN) return;
  const hunter=players[hunterId];
  for(const [id,p] of Object.entries(players)){
    if(id===hunterId) continue;
    if(dist(hunter,p) < TAG_DIST){
      p.isHunter=true; hunter.isHunter=false; hunterId=id; lastTag=now;
      io.emit('message', `${p.bot?'ボット':'プレイヤー'}が鬼になった！`);
      startScore(); startRound();
      break;
    }
  }
}

/* ハンターが抜けたときのフォールバック */
function selectNewHunter(){
  const humans = Object.keys(players).filter(id=>!players[id].bot);
  hunterId = humans[0] || BOT_ID;
  Object.values(players).forEach(p=>p.isHunter=false);
  players[hunterId].isHunter=true;
  startScore(); startRound();
}

/* スコアタイマー */
function startScore(){
  clearInterval(scoreTimer);
  scoreTimer=setInterval(()=>{
    for(const id in players) if(!players[id].isHunter) players[id].score++;
    io.emit('state', players);
  }, SCORE_INT);
}

/* ラウンド管理 */
function startRound(){
  clearTimeout(roundTimer);
  roundEnd = Date.now()+ROUND_MS;
  io.emit('round', roundEnd);
  roundTimer = setTimeout(()=>{
    io.emit('message','🎉 逃げチームの勝ち！(30 秒逃げ切った)');
    setTimeout(resetField, RESTART_DELAY);
  }, ROUND_MS);
}

/* 再配置して新ラウンド */
function resetField(){
  for(const p of Object.values(players)){
    let x,y;
    do{ x=Math.random()*FIELD; y=Math.random()*FIELD; }while(hitObstacle(x,y));
    p.x=x; p.y=y;
  }
  io.emit('state', players);
  startRound();
}

/* ===== ボット AI ===== */
setInterval(()=>{
  const bot=players[BOT_ID], hun=players[hunterId];
  if(!bot||!hun) return;

  let tgt=null;
  if(bot.isHunter){
    let dMin=Infinity;
    for(const [id,p] of Object.entries(players)){ if(id===BOT_ID) continue;
      const d=dist(bot,p); if(d<dMin){dMin=d; tgt=p;}
    }
  }else tgt=hun;
  if(!tgt) return;

  const dx=tgt.x-bot.x, dy=tgt.y-bot.y, len=Math.hypot(dx,dy)||1;
  const sgn=bot.isHunter?1:-1;
  const nx=Math.max(0,Math.min(FIELD, bot.x+sgn*SPEED*dx/len));
  const ny=Math.max(0,Math.min(FIELD, bot.y+sgn*SPEED*dy/len));
  if(!hitObstacle(nx,ny)){ bot.x=nx; bot.y=ny; }

  tagCheck();
  io.emit('state', players);
}, BOT_TICK);

/* ===== 起動 ===== */
httpServer.listen(PORT, ()=>console.log(`Server running on :${PORT}`));
