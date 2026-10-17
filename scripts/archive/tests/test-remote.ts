async function fetchTest() {
  try {
    const res = await fetch('https://ais-dev-d6lud4cxwhjhiki7qfhdvi-60070118951.us-east1.run.app/api/game');
    console.log("DEV: ", res.status, res.statusText);
    const res2 = await fetch('https://ais-pre-d6lud4cxwhjhiki7qfhdvi-60070118951.us-east1.run.app/api/game');
    console.log("PRE: ", res2.status, res2.statusText);
  } catch (err) {
    console.error('Fetch error:', err);
  }
}
fetchTest();
