async function run() {
  const res = await fetch('http://localhost:3000/api/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: "Hello World Game",
      start_time: new Date().toISOString(),
      prize: "",
      card_value: "",
      patterns: [],
      rematchPatterns: [],
      type: "free",
      prize_type: "wallet",
      winning_pattern: "full"
    })
  });
  console.log(res.status, await res.text());
}
run();
