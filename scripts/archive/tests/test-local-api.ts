async function fetchTest() {
  try {
    const res = await fetch('http://localhost:3000/api/games');
    console.log("DEV: ", res.status, res.statusText);
  } catch (err) {
    console.error('Fetch error:', err);
  }
}
fetchTest();
