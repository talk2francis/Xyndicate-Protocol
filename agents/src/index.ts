import 'dotenv/config';
import axios from 'axios';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function main() {
  console.log('[Sergeant] Pipeline bootstrap placeholder.');
  // TODO: wire Oracle -> Strategist -> Executor
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
