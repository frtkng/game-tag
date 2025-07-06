// src/server.js
// 依存: npm i express socket.io
import express from 'express';
import http    from 'http';
import { Server } from 'socket.io';

const app  = express();
const httpServer = http.createServer(app);
const io   = new Server(httpServer);

const PORT         = process.env.PORT || 3000;
const FIELD_SIZE   = 600;
const PLAYER_SIZE  = 20;
const SPEED        = 4;
const TAG_DISTANCE = PLAYER_SIZE;
const ROUND_LIMIT  = 10_000;

let players = {};
let hunterId = null;
let roundTimer = null;

// ここを変更（../public 配信）
app.use(express.static(new URL('../public', import.meta.url).pathname));

io.on('connection', socket => {
  players[socket.id] = {
    x: Math.random()*FIELD_SIZE,
    y: Math.random()*FIELD_SIZE,
    isHunter: hunterId === null,
    lastMove: Date.now()
  };
  if (hunterId === null) hunterId = socket.id;

  io.emit('state', players);

  socket.on('move', dir => {
    const p = players[socket.id];
    if (!p) return;
    p.x = Math.max(0, Math.min(FIELD_SIZE, p.x + dir.x * SPEED));
    p.y = Math.max(0, Math.min(FIELD_SIZE, p.y + dir.y * SPEED));
    p.lastMove = Date.now();
    checkTag();
    io.emit('state', players);
  });

  socket.on('disconnect', () => {
    const wasHunter = players[socket.id]?.isHunter;
    delete players[socket.id];
    if (wasHunter) assignNewHunter();
    io.emit('state', players);
  });
});

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function checkTag() {
  const hunter = players[hunterId];
  if (!hunter) return;
  for (const [id, p] of Object.entries(players)) {
    if (id === hunterId) continue;
    if (dist(hunter, p) < TAG_DISTANCE) {
      p.isHunter = true;
      hunter.isHunter = false;
      hunterId = id;
      resetRoundTimer();
      break;
    }
  }
}
function assignNewHunter() {
  const first = Object.keys(players)[0] || null;
  hunterId = first;
  if (first) players[first].isHunter = true;
  resetRoundTimer();
}
function resetRoundTimer() {
  clearTimeout(roundTimer);
  roundTimer = setTimeout(() => {
    io.emit('message', 'ハンター勝利！（10 秒逃げ切れず）');
    resetRoundTimer();
  }, ROUND_LIMIT);
}

httpServer.listen(PORT, () => console.log(`Server running :${PORT}`));
