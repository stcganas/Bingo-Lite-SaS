async function run() {
  const fetch = (await import('node-fetch')).default;
  try {
    const res = await fetch('http://localhost:3000/api/game/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: 24, ai_chat_enabled: true }) // Adjust gameId as needed, although it should fallback to active game
    });
    console.log(res.status);
    console.log(await res.text());
  } catch(e) {
    console.error(e);
  }
}
run();
