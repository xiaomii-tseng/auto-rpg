import express    from 'express';
import cors       from 'cors';
import { Server } from 'colyseus';
import { createServer } from 'http';
import { GameRoom }     from './rooms/GameRoom';
import { codeMap }      from './codeRegistry';

const PORT = Number(process.env.PORT) || 3001;
const app  = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// 4-digit code → real Colyseus roomId lookup
app.get('/room/:code', (req, res) => {
const roomId = codeMap.get(req.params.code);
  if (!roomId) { res.status(404).json({ error: 'not found' }); return; }
  res.json({ roomId });
});

const httpServer  = createServer(app);
const gameServer  = new Server({ server: httpServer });

gameServer.define('game', GameRoom);

httpServer.listen(PORT, () => {
  console.log(`[auto-rpg] server running on http://localhost:${PORT}`);
});
