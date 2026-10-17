
import { supabase } from './supabaseClient.ts';

async function testBingoDetection() {
  console.log("Testing Bingo Detection Logic...");
  
  // Need to get a sample card, a pattern, and drawn balls from DB
  const { data: game } = await supabase.from('game').select('*').eq('status', 'playing').limit(1).maybeSingle();
  if (!game) {
    console.log("No active game found.");
    return;
  }
  
  const { data: card } = await supabase.from('cards').select('*').eq('game_id', game.id).limit(1).maybeSingle();
  const { data: pattern } = await supabase.from('patterns').select('*').limit(1).maybeSingle();
  
  console.log("Game ID:", game.id);
  console.log("Card Number:", card?.card_number);
  console.log("Pattern:", pattern?.name);
  
  // Use server's logic (I need to copy it here or just call the function if I could import it, but it's in server.ts not exported)
  // For now I'll just check if the pattern grid is being parsed correctly
  
  console.log("Pattern Grid:", pattern?.grid);
}

testBingoDetection().catch(console.error);
