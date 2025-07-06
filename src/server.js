// src/server.js  – Final Multi-Player Safe Spawn
//------------------------------------------------
import express from 'express';
import http    from 'http';
import { Server } from 'socket.io';

/* === CONFIG === */
const PORT            = process.env.PORT || 3000;
const FIELD           = 600;
const SPEED           = 4;
const TAG_DIST        = 20;
const TAG_CD          = 1000;
const ROUND_MS        = 30_000;  // 30 秒
const RESTART_DELAY   = 3000;
const SCORE_INT       = 1000;
const BOT_TICK        = 200;
const BOT_ID          = 'bot';

/* === OBSTACLES === */
const OBSTACLES = [
  {x:200,y:150,w:200,h:20},
  {x:100,y:350,w:400,h:20},
  {x:50 ,y:50 ,w:20 ,h:200},
  {x:530,y:350,w:20 ,h:200}
];

/* === SERVER SETUP === */
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);
app.use(express.static(new URL('../public', import.meta.url).pathname));

/* === STATE === */
let players={}, hunterId=null, lastTag=0, roundEnd=0;
let roundTimer=null, scoreTimer=null;

/* === HELPERS === */
const dist = (a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const hitObs = (x,y)=>OBSTACLES.some(o=> x>o.x-TAG_DIST && x<o.x+o.w+TAG_DIST &&
                                        y>o.y-TAG_DIST && y<o.y+o.h+TAG_DIST );
const isFree = (x,y)=>!hitObs(x,y) &&
  Object.values(players).every(p=>dist({x,y},p) > 2*TAG_DIST);

/* === INIT BOT === */
spawnBot(); startScore(); startRound();

/* === SOCKETS === */
io.on('connection',sock=>{
  console.log('CONNECT',sock.id);
  let x,y; do{ x=Math.random()*FIELD; y=Math.random()*FIELD; }while(!isFree(x,y));
  players[sock.id]={x,y,isHunter:false,score:0,bot:false};

  sock.emit('map',OBSTACLES);
  io.emit('state',players);

  sock.on('move',dir=>{
    const p=players[sock.id]; if(!p) return;
    const ox=p.x, oy=p.y;
    let nx=Math.max(0,Math.min(FIELD, ox+dir.x*SPEED));
    let ny=Math.max(0,Math.min(FIELD, oy+dir.y*SPEED));
    if(!hitObs(nx,ny)){ p.x=nx; p.y=ny; }
    if(p.x!==ox||p.y!==oy){ tagCheck(); io.emit('state',players); }
  });

  sock.on('disconnect',()=>{
    console.log('DISCON',sock.id);
    const was=players[sock.id]?.isHunter;
    delete players[sock.id];
    if(was) selectNewHunter();
    io.emit('state',players);
  });
});

/* === GAME LOGIC === */
function spawnBot(){
  let x,y; do{ x=Math.random()*FIELD; y=Math.random()*FIELD; }while(!isFree(x,y));
  players[BOT_ID]={x,y,isHunter:true,score:0,bot:true};
  hunterId=BOT_ID;
}
function tagCheck(){
  const now=Date.now();
  if(now-lastTag<TAG_CD) return;
  const h=players[hunterId];
  for(const [id,p] of Object.entries(players)){
    if(id===hunterId) continue;
    if(dist(h,p)<TAG_DIST){
      p.isHunter=true; h.isHunter=false; hunterId=id; lastTag=now;
      io.emit('message',`${p.bot?'ボット':'プレイヤー'}が鬼になった！`);
      startScore(); startRound();
      break;
    }
  }
}
function selectNewHunter(){
  const list=Object.keys(players).filter(id=>!players[id].bot);
  hunterId = list[0] || BOT_ID;
  Object.values(players).forEach(p=>p.isHunter=false);
  players[hunterId].isHunter=true;
  startScore(); startRound();
}
function startScore(){
  clearInterval(scoreTimer);
  scoreTimer=setInterval(()=>{
    for(const id in players) if(!players[id].isHunter) players[id].score++;
    io.emit('state',players);
  },SCORE_INT);
}
function startRound(){
  clearTimeout(roundTimer);
  roundEnd=Date.now()+ROUND_MS;
  io.emit('round',roundEnd);
  roundTimer=setTimeout(()=>{
    io.emit('message','🎉 逃げチームの勝ち！(30 秒逃げ切った)');
    setTimeout(resetField,RESTART_DELAY);
  },ROUND_MS);
}
function resetField(){
  for(const p of Object.values(players)){
    let x,y; do{ x=Math.random()*FIELD; y=Math.random()*FIELD; }while(!isFree(x,y));
    p.x=x; p.y=y;
  }
  io.emit('state',players);
  startRound();
}

/* === BOT AI === */
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
  const dx=tgt.x-b.x, dy=tgt.y-b.y, len=Math.hypot(dx,dy)||1;
  const sgn=b.isHunter?1:-1;
  const nx=Math.max(0,Math.min(FIELD, b.x+sgn*SPEED*dx/len));
  const ny=Math.max(0,Math.min(FIELD, b.y+sgn*SPEED*dy/len));
  if(!hitObs(nx,ny)){ b.x=nx; b.y=ny; }

  tagCheck();
  io.emit('state',players);
},BOT_TICK);

/* === START === */
httpServer.listen(PORT,()=>console.log(`Server running on :${PORT}`));
