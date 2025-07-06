// 完全版サーバ  (Node 18+ / npm i express socket.io)
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

/* ====== 定数 ====== */
const PORT           = process.env.PORT || 3000;
const FIELD          = 600;
const SPEED          = 4;
const TAG_DIST       = 20;
const TAG_CD         = 1000;
const ROUND_MS       = 30_000;  // ←★ 30 秒ラウンド
const RESTART_DELAY  = 3000;
const SCORE_INT      = 1000;
const BOT_TICK       = 200;
const BOT_ID         = 'bot';

/* ====== 障害物 (長方形) ====== */
const OBSTACLES = [
  {x:200,y:150,w:200,h:20},
  {x:100,y:350,w:400,h:20},
  {x:50 ,y:50 ,w:20 ,h:200},
  {x:530,y:350,w:20 ,h:200}
];

/* ====== HTTP / Socket.IO ====== */
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);
app.use(express.static(new URL('../public', import.meta.url).pathname));

/* ====== 状態 ====== */
let players={}, hunterId=null, lastTag=0, roundEnd=0;
let scoreTm=null, roundTm=null;

/* ====== ユーティリティ ====== */
const dist = (a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const ipOf = s=>(s.handshake.headers['x-forwarded-for']||s.conn.remoteAddress||'').split(',')[0].trim().split(':').pop();
const collides = (x,y)=>OBSTACLES.some(o=> x>o.x-TAG_DIST && x<o.x+o.w+TAG_DIST &&
                                           y>o.y-TAG_DIST && y<o.y+o.h+TAG_DIST );

/* ====== 初期ボット ====== */
spawnBot(); startScore(); startRound();

/* ====== ソケット ====== */
io.on('connection',sock=>{
  /* ゴースト掃除 */
  const ip = ipOf(sock);
  for(const [id,s] of io.sockets.sockets){
    if(id!==sock.id && ipOf(s)===ip){ s.disconnect(true); delete players[id]; }
  }
  /* プレイヤー生成 (衝突しないランダム地点) */
  let px,py;
  do{ px=Math.random()*FIELD; py=Math.random()*FIELD; }while(collides(px,py));
  players[sock.id]={x:px,y:py,isHunter:false,score:0,bot:false};
  sock.emit('map',OBSTACLES);       // ←★ 障害物情報送信
  io.emit('state',players);

  sock.on('move',dir=>{
    const p=players[sock.id]; if(!p) return;
    const ox=p.x, oy=p.y;
    let nx=ox+dir.x*SPEED, ny=oy+dir.y*SPEED;
    nx=Math.max(0,Math.min(FIELD,nx));
    ny=Math.max(0,Math.min(FIELD,ny));
    if(!collides(nx,ny)){ p.x=nx; p.y=ny; }
    if(p.x!==ox||p.y!==oy){ tagCheck(); io.emit('state',players); }
  });

  sock.on('disconnect',()=>{
    const was=players[sock.id]?.isHunter;
    delete players[sock.id];
    if(was) pickNewHunter();
    io.emit('state',players);
  });
});

/* ====== ロジック ====== */
function tagCheck(){
  const now=Date.now(); if(now-lastTag<TAG_CD) return;
  const h=players[hunterId];
  for(const [id,p] of Object.entries(players)){
    if(id===hunterId) continue;
    if(dist(h,p)<TAG_DIST){
      p.isHunter=true; h.isHunter=false; hunterId=id; lastTag=now;
      io.emit('message',`${p.bot?'ボット':'プレイヤー'}が鬼になった！`);
      startScore(); startRound(); break;
    }
  }
}
function pickNewHunter(){
  const list=Object.keys(players).filter(id=>!players[id].bot);
  hunterId=list[0]||BOT_ID;
  Object.values(players).forEach(p=>p.isHunter=false);
  players[hunterId].isHunter=true;
  startScore(); startRound();
}
function startScore(){
  clearInterval(scoreTm);
  scoreTm=setInterval(()=>{
    for(const id in players) if(!players[id].isHunter) players[id].score++;
    io.emit('state',players);
  },SCORE_INT);
}
function startRound(){
  clearTimeout(roundTm);
  roundEnd=Date.now()+ROUND_MS;
  io.emit('round',roundEnd);
  roundTm=setTimeout(()=>{
    io.emit('message','🎉 逃げチームの勝ち！(30 秒逃げ切った)');
    setTimeout(resetGame,RESTART_DELAY);
  },ROUND_MS);
}
function resetGame(){
  for(const p of Object.values(players)){
    let nx,ny;
    do{ nx=Math.random()*FIELD; ny=Math.random()*FIELD; }while(collides(nx,ny));
    p.x=nx; p.y=ny;
  }
  io.emit('state',players); startRound();
}
function spawnBot(){
  let bx,by;
  do{ bx=Math.random()*FIELD; by=Math.random()*FIELD; }while(collides(bx,by));
  players[BOT_ID]={x:bx,y:by,isHunter:true,score:0,bot:true};
  hunterId=BOT_ID;
}

/* ====== ボット AI ====== */
setInterval(()=>{
  const b=players[BOT_ID], h=players[hunterId]; if(!b||!h) return;
  let tgt=null;
  if(b.isHunter){
    let m=Infinity;
    for(const [id,p] of Object.entries(players)){ if(id===BOT_ID) continue;
      const d=dist(b,p); if(d<m){m=d;tgt=p;}
    }
  }else tgt=h;
  if(!tgt) return;

  const dx=tgt.x-b.x, dy=tgt.y-b.y, len=Math.hypot(dx,dy)||1, sgn=b.isHunter?1:-1;
  const nx=Math.max(0,Math.min(FIELD,b.x+sgn*SPEED*dx/len));
  const ny=Math.max(0,Math.min(FIELD,b.y+sgn*SPEED*dy/len));
  if(!collides(nx,ny)){ b.x=nx; b.y=ny; }
  tagCheck(); io.emit('state',players);
},BOT_TICK);

/* ====== 起動 ====== */
httpServer.listen(PORT,()=>console.log('Server on :' + PORT));
