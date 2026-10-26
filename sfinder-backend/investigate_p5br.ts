const PROD_URL = "https://sfinder-backend.kunalbhai137.workers.dev/api/v1/discover";

const queries = [
  "mujhe ek romantic movie chahiye jisme unexpected twist ho",
  "I want a movie where enemies fall in love",
  "A hero falls in love with his enemy's daughter",
  "time loopp reliving past"
];

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  for (const q of queries) {
    console.log("================================================================================");
    console.log("QUERY:", q);
    const resp = await fetch(PROD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, contentType: "ALL", page: 1, limit: 5 })
    });
    const data: any = await resp.json();
    console.log(`Total Count: ${data.totalCount}, Items returned: ${data.items?.length}`);
    (data.items || []).forEach((item: any, idx: number) => {
      console.log(`\n#${idx + 1}: [${item.mediaType}] ${item.title} (${item.releaseYear || "N/A"}) - ID: ${item.id}`);
      console.log(`    Genres: ${item.genres?.join(", ") || "None"}`);
      console.log(`    Country: ${item.countryOfOrigin || "None"}`);
      console.log(`    Rating: ${item.rating || "N/A"}`);
      console.log(`    Synopsis: ${item.synopsis}`);
      console.log(`    Explanation: ${item.matchExplanation}`);
    });
    await sleep(4200);
  }
}

run();
