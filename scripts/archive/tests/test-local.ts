console.log("Fetching /api/games...");
fetch("http://127.0.0.1:3000/api/games")
  .then(res => res.json().then(j => ({ status: res.status, body: j })))
  .then(res => console.log(res))
  .catch(err => console.error(err.message));
