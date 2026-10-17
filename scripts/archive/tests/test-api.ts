async function test() {
  const res = await fetch('http://localhost:3000/api/test-db');
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
}
test();
