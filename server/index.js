import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openDb } from './db.js';
import { createApp } from './app.js';

const dbPath = process.env.DB_PATH ?? 'data/trashtalk.db';
const port = Number(process.env.PORT ?? 3000);

mkdirSync(dirname(dbPath), { recursive: true });
const db = openDb(dbPath);

createApp(db).listen(port, () => {
  console.log(`Trash Talk running at http://localhost:${port}`);
});
