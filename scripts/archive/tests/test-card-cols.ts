
import { supabase } from './supabaseClient.ts';
async function test() {
  const { data, error } = await supabase.from('cards').select('*').limit(1);
  console.log(data?.[0] ? Object.keys(data[0]) : "No data", error);
}
test();
