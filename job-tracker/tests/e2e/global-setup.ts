import { MongoClient } from "mongodb";

// Runs once before the whole e2e suite. By the time this runs, scripts/run-e2e.mjs
// has already started the test MongoDB and confirmed it's accepting connections
// (Playwright's own globalSetup/webServer ordering isn't reliable enough to do
// that here -- see scripts/run-e2e.mjs for why). This just clears out data left
// over from earlier spec files/runs so assertions like dense-list.spec.ts's
// baseline count start from a known state.
export default async function globalSetup() {
  const uri =
    process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27117/jobtracker_e2e";

  const client = new MongoClient(uri);
  try {
    await client.connect();
    await client.db().collection("jobapplications").deleteMany({});
  } finally {
    await client.close();
  }
}
