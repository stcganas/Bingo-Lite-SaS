
import { supabase } from './supabaseClient.ts';

function parseLetterArray(val: any): any[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      if (val.startsWith('{') && val.endsWith('}')) {
        return val.slice(1, -1).split(',').map(x => isNaN(Number(x)) ? x : Number(x));
      }
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      return val.replace(/[\[\]{}]/g, '').split(',').map(x => isNaN(Number(x)) ? x : Number(x));
    }
  }
  return [];
};

async function test() {
  const { data, error } = await supabase.from('cards').select('b').limit(1);
  if (data) {
    console.log("Card b raw:", data[0].b);
    console.log("Parsed:", parseLetterArray(data[0].b));
  }
}
test();
