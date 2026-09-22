// Acero Founders — daily reminder sender
// Run by GitHub Actions on a schedule. Reads today's check-in rotation directly
// from Firestore (whatever is currently there — always live, never a fixed list),
// sends a push notification to the right owner's registered device(s), AND creates
// the matching Task Log entry (status: pending) so the in-app bell reflects it too —
// even if the push notification itself doesn't land (dismissed, permission issue, etc).

const admin = require("firebase-admin");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const COMPANY_NAMES = { AD: "Acero Digital", AH: "Acero Healthcare", KAI: "Kai Learning School" };

async function main() {
  // Pakistan is UTC+5, no daylight saving — compute "today" in that timezone.
  const now = new Date();
  const pkt = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  const today = DAYS[pkt.getUTCDay()];
  const dateStr = pkt.toISOString().slice(0, 10); // YYYY-MM-DD, used for the log's dedupe key
  const dateLabel = pkt.toISOString().slice(5, 10); // MM-DD, matches the app's own log date format
  console.log(`Running for ${today} (Pakistan time: ${pkt.toISOString()})`);

  const [scheduleSnap, teamSnap, devicesSnap] = await Promise.all([
    db.collection("schedule").where("day", "==", today).get(),
    db.collection("team").get(),
    db.collection("devices").get(),
  ]);

  if (scheduleSnap.empty) {
    console.log("No check-ins scheduled for today. Nothing to send.");
    return;
  }

  const teamById = {};
  teamSnap.forEach((doc) => { teamById[doc.id] = doc.data(); });

  const tokensByOwner = { kabir: [], uzair: [] };
  devicesSnap.forEach((doc) => {
    const d = doc.data();
    if (tokensByOwner[d.owner]) tokensByOwner[d.owner].push(d.token);
  });

  let sent = 0, failed = 0, logged = 0, alreadyLogged = 0;

  for (const doc of scheduleSnap.docs) {
    const item = doc.data();
    const person = teamById[item.person];
    if (!person) continue; // person was deleted since this check-in was scheduled

    // Create the Task Log entry (once per day per schedule item), regardless of
    // whether a push actually goes out — this is what the in-app bell reads from.
    const logId = `sched-${doc.id}-${dateStr}`;
    const logRef = db.collection("log").doc(logId);
    const existing = await logRef.get();
    if (!existing.exists) {
      await logRef.set({
        date: dateLabel,
        person: item.person,
        company: item.company,
        focus: item.focus,
        note: "",
        status: "pending",
      });
      logged++;
    } else {
      alreadyLogged++; // already created earlier today (e.g. a manual re-run) — don't touch its status
    }

    const tokens = tokensByOwner[person.owner] || [];
    if (tokens.length === 0) continue;

    const companyName = COMPANY_NAMES[item.company] || item.company;
    const message = {
      notification: {
        title: `Ask ${person.name} for an update`,
        body: `${companyName} — ${item.focus}`,
      },
      tokens,
    };

    try {
      const res = await admin.messaging().sendEachForMulticast(message);
      sent += res.successCount;
      failed += res.failureCount;
      res.responses.forEach((r, i) => {
        if (!r.success) console.warn(`Failed for token ${tokens[i].slice(0, 12)}...:`, r.error && r.error.message);
      });
    } catch (e) {
      console.error("Send failed for", item.focus, e.message);
      failed += tokens.length;
    }
  }

  console.log(`Done. Push sent: ${sent}, Push failed: ${failed}. Log entries created: ${logged}, already existed: ${alreadyLogged}.`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
