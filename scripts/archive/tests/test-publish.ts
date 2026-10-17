import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sbUrl = process.env.VITE_SUPABASE_URL;
const sbKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(sbUrl, sbKey);

async function check() {
  const channel = supabase.channel('global');
  (channel as any).send({
    type: 'broadcast',
    event: 'game_finished',
    payload: {
      game_id: 1,
      winners: [{ player_name: 'Test Player', prize: '1000' }],
      final_note: "Gracias por jugar!"
    }
  }).then(() => {
    console.log('Published');
    process.exit(0);
  });
}
check();
