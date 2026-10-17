import { supabase } from './supabaseClient.ts';

async function testConnection() {
  console.log("Testing Supabase connection...");
  if (!supabase) {
    console.error("Error: Supabase client is null. Environment variables might be missing.");
    return;
  }
  try {
    const { data, error, status } = await supabase.from('settings').select('*').limit(1);
    
    if (error) {
      console.error("Connection failed with Supabase error:");
      console.error(error);
    } else {
      console.log(`Connection successful! Status: ${status}`);
    }
  } catch (err) {
    console.error("Unexpected error:");
    console.error(err);
  }
}

testConnection();
