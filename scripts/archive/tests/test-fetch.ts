const supabaseUrl = "https://csxlomxeikuxozasdaot.supabase.co/rest/v1/";
fetch(supabaseUrl).then(res => console.log(res.status)).catch(err => console.error("FETCH ERROR:", err));
