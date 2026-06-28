/* =========================
   Firebase
========================= */

const firebaseConfig = {
  apiKey: "AIzaSyA10ckmEikayA_RYHXGYlux46Vs_Vnnc2s",
  authDomain: "lazy-ironman.firebaseapp.com",
  projectId: "lazy-ironman",
  storageBucket: "lazy-ironman.firebasestorage.app",
  messagingSenderId: "771658035326",
  appId: "1:771658035326:web:9b5d7e67a60e2c536fa82f"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const GROUP_DOC = db.collection("ironman").doc("group");

/* =========================
   Challenge Setup
========================= */

const PARTICIPANTS = [
  { name: "Marly", color: "emerald", hex: "#10b981" },
  { name: "Laura", color: "amber", hex: "#f59e0b" },
  { name: "Nick", color: "orange", hex: "#f97316" },
  { name: "Katie", color: "violet", hex: "#8b5cf6" },
  { name: "Gunnar", color: "red", hex: "#ef4444" },
  { name: "Taylor", color: "teal", hex: "#14b8a6" },
  { name: "Dwayne", color: "blue", hex: "#3b82f6" }
];

const GOALS = {
  swim: 3860, // meters
  bike: 112,  // miles
  run: 26.2   // miles
};

const M_PER_MILE = 1609.344;

const JOURNEY = [
  { from: "San Diego", to: "Phoenix", miles: 355 },
  { from: "Phoenix", to: "Flagstaff", miles: 145 },
  { from: "Flagstaff", to: "Grand Canyon", miles: 80 },
  { from: "Grand Canyon", to: "Las Vegas", miles: 275 },
  { from: "Las Vegas", to: "Salt Lake City", miles: 421 },
  { from: "Salt Lake City", to: "Yellowstone", miles: 321 }
];

const MILESTONES = {
  swim: [
    { distance: 500, label: "500m swim" },
    { distance: 1000, label: "1,000m swim" },
    { distance: 1900, label: "Half Ironman swim distance" },
    { distance: 3860, label: "Ironman swim distance" }
  ],
  bike: [
    { distance: 10, label: "10 mile ride" },
    { distance: 25, label: "25 mile ride" },
    { distance: 50, label: "50 mile ride" },
    { distance: 100, label: "Century ride" },
    { distance: 112, label: "Ironman bike distance" }
  ],
  run: [
    { distance: 1, label: "First mile run" },
    { distance: 3.1, label: "5K run" },
    { distance: 6.2, label: "10K run" },
    { distance: 13.1, label: "Half marathon" },
    { distance: 26.2, label: "Marathon / Ironman run" }
  ]
};

let state = {
  members: {},
  feed: []
};

let selectedType = "swim";
let activeProfile = null;

/* =========================
   Helpers
========================= */

function blankMembers() {
  const members = {};
  PARTICIPANTS.forEach(p => {
    members[p.name] = { swim: 0, bike: 0, run: 0 };
  });
  return members;
}

function participant(name) {
  return PARTICIPANTS.find(p => p.name === name) || PARTICIPANTS[0];
}

function ensureUser(name) {
  if (!state.members[name]) {
    state.members[name] = { swim: 0, bike: 0, run: 0 };
  }

  ["swim", "bike", "run"].forEach(type => {
    if (typeof state.members[name][type] !== "number") {
      state.members[name][type] = 0;
    }
  });
}

function ensureAllUsers() {
  PARTICIPANTS.forEach(p => ensureUser(p.name));
}

function normalizeFeedItem(item) {
  if (!item) return null;

  if (typeof item === "object") {
    const member = item.member;
    const type = item.type;
    const distance = Number(item.distance);

    if (PARTICIPANTS.some(p => p.name === member) && ["swim", "bike", "run"].includes(type) && distance > 0) {
      return {
        member,
        type,
        distance,
        createdAt: item.createdAt || null
      };
    }

    return null;
  }

  // Supports older text logs like:
  // "Katie +15 bike"
  // "6/28/2026 — Katie logged 15 mi bike"
  if (typeof item === "string") {
    const member = PARTICIPANTS.find(p => item.includes(p.name))?.name;
    const type = ["swim", "bike", "run"].find(t => item.toLowerCase().includes(t));
    const match = item.match(/(\d+(\.\d+)?)/);
    const distance = match ? Number(match[1]) : 0;

    if (member && type && distance > 0) {
      return { member, type, distance, createdAt: null, originalText: item };
    }
  }

  return null;
}

function deriveMembersFromFeed(feed) {
  const members = blankMembers();

  (feed || []).forEach(item => {
    const entry = normalizeFeedItem(item);
    if (!entry) return;

    members[entry.member][entry.type] += entry.distance;
  });

  return members;
}

function completionPercent(member) {
  const swim = Math.min((member.swim || 0) / GOALS.swim, 1);
  const bike = Math.min((member.bike || 0) / GOALS.bike, 1);
  const run = Math.min((member.run || 0) / GOALS.run, 1);
  return ((swim + bike + run) / 3) * 100;
}

function formatNumber(num, decimals = 1) {
  return Number(num || 0).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatDistance(type, value) {
  if (type === "swim") return `${Math.round(value || 0).toLocaleString()} m`;
  return `${formatNumber(value || 0, 1)} mi`;
}

function totalMilesEquivalent() {
  return Object.values(state.members).reduce((sum, m) => {
    return sum + ((m.swim || 0) / M_PER_MILE) + (m.bike || 0) + (m.run || 0);
  }, 0);
}

function activityMilesEquivalent(entry) {
  const normalized = normalizeFeedItem(entry);
  if (!normalized) return 0;
  if (normalized.type === "swim") return (normalized.distance || 0) / M_PER_MILE;
  return normalized.distance || 0;
}

function sortedParticipants() {
  return [...PARTICIPANTS].sort((a, b) => {
    return completionPercent(state.members[b.name]) - completionPercent(state.members[a.name]);
  });
}

function entryDate(entry) {
  const normalized = normalizeFeedItem(entry);
  if (!normalized || !normalized.createdAt) return null;
  if (normalized.createdAt.toDate) return normalized.createdAt.toDate();
  return new Date(normalized.createdAt);
}

function isThisWeek(date) {
  if (!date || Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const start = new Date(now);
  const day = start.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday start
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return date >= start;
}

function weeklyTotalsByPerson() {
  const totals = {};
  PARTICIPANTS.forEach(p => totals[p.name] = { miles: 0, activities: 0 });

  (state.feed || []).forEach(item => {
    const entry = normalizeFeedItem(item);
    if (!entry) return;
    const date = entryDate(item);
    if (!isThisWeek(date) && entry.createdAt) return;
    totals[entry.member].miles += activityMilesEquivalent(entry);
    totals[entry.member].activities += 1;
  });

  return totals;
}

function timeLabel(timestamp) {
  if (!timestamp) return "recently";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "recently";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function iconFor(type) {
  return type === "swim" ? "🏊" : type === "bike" ? "🚴" : "🏃";
}

function actionWord(type) {
  return type === "swim" ? "swam" : type === "bike" ? "rode" : "ran";
}

function completedMilestonesForMember(member) {
  const hits = [];
  Object.keys(MILESTONES).forEach(type => {
    MILESTONES[type].forEach(ms => {
      if ((member[type] || 0) >= ms.distance) {
        hits.push({ type, label: ms.label, distance: ms.distance });
      }
    });
  });
  return hits;
}

function nextMilestonesForMember(member) {
  const next = [];
  Object.keys(MILESTONES).forEach(type => {
    const found = MILESTONES[type].find(ms => (member[type] || 0) < ms.distance);
    if (found) {
      next.push({
        type,
        label: found.label,
        remaining: found.distance - (member[type] || 0)
      });
    }
  });
  return next;
}

/* =========================
   Firebase Sync
========================= */

async function initializeDocumentIfNeeded() {
  const snap = await GROUP_DOC.get();

  if (!snap.exists) {
    await GROUP_DOC.set({
      members: blankMembers(),
      feed: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
}

GROUP_DOC.onSnapshot(snapshot => {
  if (!snapshot.exists) return;

  const cloud = snapshot.data();
  state.feed = Array.isArray(cloud.feed) ? cloud.feed : [];

  // IMPORTANT FIX:
  // Athlete cards are now calculated from saved activities.
  // This prevents feed/card mismatch and repairs old broken totals.
  state.members = deriveMembersFromFeed(state.feed);
  ensureAllUsers();

  render();
  if (activeProfile) renderProfile(activeProfile);
});

initializeDocumentIfNeeded();

/* =========================
   Rendering
========================= */

function render() {
  renderHero();
  renderPodium();
  renderJourney();
  renderWeeklyStats();
  renderAthletes();
  renderMilestones();
  renderFeed();
}

function renderHero() {
  const sorted = sortedParticipants();
  const leader = sorted[0];
  const leaderMember = state.members[leader.name];
  const totalMiles = totalMilesEquivalent();
  const weekly = weeklyTotalsByPerson();
  const weeklySorted = [...PARTICIPANTS].sort((a,b) => weekly[b.name].miles - weekly[a.name].miles);
  const weeklyLeader = weeklySorted[0];

  document.getElementById("leaderAvatar").textContent = leader.name[0];
  document.getElementById("leaderAvatar").style.background = leader.hex;
  document.getElementById("leaderName").textContent = leader.name;
  document.getElementById("leaderPct").textContent = `${formatNumber(completionPercent(leaderMember), 1)}% complete`;
  document.getElementById("groupMiles").textContent = formatNumber(totalMiles, 1);
  document.getElementById("weeklyLeader").textContent = weekly[weeklyLeader.name].miles > 0 ? weeklyLeader.name : "—";
}

function renderPodium() {
  const sorted = sortedParticipants().slice(0, 3);
  const medals = ["🥇", "🥈", "🥉"];

  document.getElementById("podium").innerHTML = sorted.map((p, index) => {
    const m = state.members[p.name];
    return `
      <article class="card-hover rounded-3xl bg-white p-5 shadow border-t-4 cursor-pointer" style="border-color:${p.hex}" onclick="openProfile('${p.name}')">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="h-12 w-12 rounded-2xl grid place-items-center text-white text-xl font-black" style="background:${p.hex}">
              ${p.name[0]}
            </div>
            <div>
              <p class="text-xs uppercase tracking-widest text-slate-400">${medals[index]} Place</p>
              <h3 class="text-xl font-black">${p.name}</h3>
            </div>
          </div>
          <p class="text-2xl font-black" style="color:${p.hex}">${formatNumber(completionPercent(m), 1)}%</p>
        </div>

        <p class="mt-4 text-sm text-slate-500">
          ${formatDistance("swim", m.swim)} swim • ${formatDistance("bike", m.bike)} bike • ${formatDistance("run", m.run)} run
        </p>
      </article>
    `;
  }).join("");
}

function renderJourney() {
  const miles = totalMilesEquivalent();
  let covered = miles;
  let leg = JOURNEY[JOURNEY.length - 1];

  for (const item of JOURNEY) {
    if (covered <= item.miles) {
      leg = item;
      break;
    }
    covered -= item.miles;
  }

  const pct = Math.min((covered / leg.miles) * 100, 100);
  const remaining = Math.max(leg.miles - covered, 0);

  document.getElementById("journeyText").textContent =
    `${formatNumber(covered, 1)} / ${leg.miles} miles from ${leg.from} to ${leg.to} • ${formatNumber(remaining, 1)} miles to next stop`;

  document.getElementById("journeyBadge").textContent = `${formatNumber(pct, 0)}%`;
  document.getElementById("journeyStart").textContent = leg.from;
  document.getElementById("journeyEnd").textContent = leg.to;
  document.getElementById("journeyBar").style.width = `${pct}%`;
}

function renderWeeklyStats() {
  const weekly = weeklyTotalsByPerson();
  const sorted = [...PARTICIPANTS].sort((a,b) => weekly[b.name].miles - weekly[a.name].miles);
  const leader = sorted[0];
  const groupMiles = Object.values(weekly).reduce((sum, v) => sum + v.miles, 0);
  const activities = Object.values(weekly).reduce((sum, v) => sum + v.activities, 0);

  document.getElementById("weeklyStats").innerHTML = `
    <div class="rounded-2xl bg-slate-50 p-4">
      <p class="text-xs uppercase tracking-widest text-slate-400">Weekly Leader</p>
      <p class="mt-1 text-2xl font-black">${weekly[leader.name].miles > 0 ? leader.name : "No leader yet"}</p>
      <p class="text-sm text-slate-500">${formatNumber(weekly[leader.name].miles, 1)} miles equivalent this week</p>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div class="rounded-2xl bg-slate-50 p-4">
        <p class="text-xs uppercase tracking-widest text-slate-400">Group Miles</p>
        <p class="mt-1 text-xl font-black">${formatNumber(groupMiles, 1)}</p>
      </div>
      <div class="rounded-2xl bg-slate-50 p-4">
        <p class="text-xs uppercase tracking-widest text-slate-400">Activities</p>
        <p class="mt-1 text-xl font-black">${activities}</p>
      </div>
    </div>
  `;
}

function renderAthletes() {
  document.getElementById("athleteGrid").innerHTML = PARTICIPANTS.map(p => {
    const m = state.members[p.name];
    const total = completionPercent(m);
    const weekly = weeklyTotalsByPerson()[p.name];

    return `
      <article class="card-hover rounded-3xl bg-slate-50 p-5 border border-slate-200 cursor-pointer" onclick="openProfile('${p.name}')">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="h-12 w-12 rounded-2xl grid place-items-center text-white font-black text-xl" style="background:${p.hex}">
              ${p.name[0]}
            </div>
            <div>
              <h3 class="text-lg font-black">${p.name}</h3>
              <p class="text-sm text-slate-500">${formatNumber(total, 1)}% complete • ${formatNumber(weekly.miles, 1)} mi this week</p>
            </div>
          </div>

          <div class="rounded-full px-3 py-1 text-sm font-black" style="background:${p.hex}18;color:${p.hex}">
            ${formatNumber(total, 0)}%
          </div>
        </div>

        ${progressRow("swim", "Swim", m.swim, GOALS.swim, p.hex)}
        ${progressRow("bike", "Bike", m.bike, GOALS.bike, p.hex)}
        ${progressRow("run", "Run", m.run, GOALS.run, p.hex)}
      </article>
    `;
  }).join("");
}

function progressRow(type, label, value, goal, accent) {
  const pct = Math.min((value / goal) * 100, 100);
  const remaining = Math.max(goal - value, 0);

  return `
    <div class="mt-4">
      <div class="mb-1 flex justify-between text-sm">
        <span class="font-bold text-slate-700">${iconFor(type)} ${label}</span>
        <span class="text-slate-500">${formatDistance(type, value)} / ${formatDistance(type, goal)}</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width:${pct}%; background:${accent}"></div>
      </div>
      <p class="mt-1 text-xs text-slate-400">${formatDistance(type, remaining)} remaining</p>
    </div>
  `;
}

function renderMilestones() {
  const hits = [];

  PARTICIPANTS.forEach(p => {
    const m = state.members[p.name];

    Object.keys(MILESTONES).forEach(type => {
      MILESTONES[type].forEach(ms => {
        if ((m[type] || 0) >= ms.distance) {
          hits.push({ person: p, type, label: ms.label });
        }
      });
    });
  });

  const latest = hits.slice(-10).reverse();

  document.getElementById("milestones").innerHTML = latest.length
    ? latest.map(hit => `
      <div class="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
        <div class="h-9 w-9 rounded-xl grid place-items-center text-white font-black" style="background:${hit.person.hex}">
          ${hit.person.name[0]}
        </div>
        <div>
          <p class="font-bold">${hit.person.name} reached ${hit.label}</p>
          <p class="text-xs text-slate-500">${iconFor(hit.type)} ${hit.type}</p>
        </div>
      </div>
    `).join("")
    : `<p class="text-sm text-slate-500">Milestones will appear here as people log activities.</p>`;
}

function renderFeed() {
  const feed = (state.feed || []).slice(-12).reverse();

  document.getElementById("feed").innerHTML = feed.length
    ? feed.map(item => {
      const entry = normalizeFeedItem(item);

      if (!entry) {
        return `<div class="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">${item}</div>`;
      }

      const p = participant(entry.member);
      return `
        <div class="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
          <div class="h-10 w-10 rounded-xl grid place-items-center text-white font-black" style="background:${p.hex}">
            ${p.name[0]}
          </div>
          <div class="flex-1">
            <p class="font-bold">${iconFor(entry.type)} ${entry.member} ${actionWord(entry.type)} ${formatDistance(entry.type, entry.distance)}</p>
            <p class="text-xs text-slate-500">${timeLabel(entry.createdAt)}</p>
          </div>
        </div>
      `;
    }).join("")
    : `<p class="text-sm text-slate-500">No activities yet. Log the first one!</p>`;
}

/* =========================
   Profile Modal
========================= */

function openProfile(name) {
  activeProfile = name;
  renderProfile(name);
  document.getElementById("profileModal").classList.remove("hidden");
  document.body.classList.add("no-scroll");
}

function closeProfile() {
  activeProfile = null;
  document.getElementById("profileModal").classList.add("hidden");
  document.body.classList.remove("no-scroll");
}

function renderProfile(name) {
  const p = participant(name);
  const m = state.members[name];
  const pct = completionPercent(m);
  const recent = (state.feed || [])
    .map(normalizeFeedItem)
    .filter(item => item && item.member === name)
    .slice(-8)
    .reverse();
  const milestones = completedMilestonesForMember(m);
  const next = nextMilestonesForMember(m);

  document.getElementById("profileContent").innerHTML = `
    <div class="flex items-start justify-between gap-4">
      <div class="flex items-center gap-3">
        <div class="h-14 w-14 rounded-2xl grid place-items-center text-white text-2xl font-black" style="background:${p.hex}">
          ${p.name[0]}
        </div>
        <div>
          <h2 class="text-3xl font-black">${p.name}</h2>
          <p class="text-slate-500">${formatNumber(pct, 1)}% complete</p>
        </div>
      </div>

      <button onclick="closeProfile()" class="rounded-full bg-slate-100 px-4 py-2 font-black text-slate-600">×</button>
    </div>

    <div class="mt-6 grid grid-cols-3 gap-3">
      <div class="rounded-2xl bg-slate-50 p-4">
        <p class="text-xs uppercase tracking-widest text-slate-400">Swim</p>
        <p class="mt-1 font-black">${formatDistance("swim", m.swim)}</p>
      </div>
      <div class="rounded-2xl bg-slate-50 p-4">
        <p class="text-xs uppercase tracking-widest text-slate-400">Bike</p>
        <p class="mt-1 font-black">${formatDistance("bike", m.bike)}</p>
      </div>
      <div class="rounded-2xl bg-slate-50 p-4">
        <p class="text-xs uppercase tracking-widest text-slate-400">Run</p>
        <p class="mt-1 font-black">${formatDistance("run", m.run)}</p>
      </div>
    </div>

    <div class="mt-6 rounded-3xl bg-slate-50 p-4">
      <h3 class="font-black">Progress</h3>
      ${progressRow("swim", "Swim", m.swim, GOALS.swim, p.hex)}
      ${progressRow("bike", "Bike", m.bike, GOALS.bike, p.hex)}
      ${progressRow("run", "Run", m.run, GOALS.run, p.hex)}
    </div>

    <div class="mt-6 rounded-3xl bg-slate-50 p-4">
      <h3 class="font-black">Next Milestones</h3>
      <div class="mt-3 space-y-2">
        ${next.length ? next.map(item => `
          <div class="rounded-2xl bg-white p-3">
            <p class="font-bold">${iconFor(item.type)} ${item.label}</p>
            <p class="text-sm text-slate-500">${formatDistance(item.type, item.remaining)} remaining</p>
          </div>
        `).join("") : `<p class="text-sm text-slate-500">All listed milestones complete.</p>`}
      </div>
    </div>

    <div class="mt-6 rounded-3xl bg-slate-50 p-4">
      <h3 class="font-black">Completed Milestones</h3>
      <div class="mt-3 flex flex-wrap gap-2">
        ${milestones.length ? milestones.map(item => `
          <span class="rounded-full bg-white px-3 py-2 text-sm font-bold">${iconFor(item.type)} ${item.label}</span>
        `).join("") : `<p class="text-sm text-slate-500">No milestones yet.</p>`}
      </div>
    </div>

    <div class="mt-6 rounded-3xl bg-slate-50 p-4">
      <h3 class="font-black">Recent Workouts</h3>
      <div class="mt-3 space-y-2">
        ${recent.length ? recent.map(item => `
          <div class="rounded-2xl bg-white p-3">
            <p class="font-bold">${iconFor(item.type)} ${actionWord(item.type)} ${formatDistance(item.type, item.distance)}</p>
            <p class="text-xs text-slate-500">${timeLabel(item.createdAt)}</p>
          </div>
        `).join("") : `<p class="text-sm text-slate-500">No workouts logged yet.</p>`}
      </div>
    </div>
  `;
}

/* =========================
   Form
========================= */

function setupForm() {
  const memberSelect = document.getElementById("member");
  memberSelect.innerHTML = PARTICIPANTS.map(p => `<option value="${p.name}">${p.name}</option>`).join("");

  document.querySelectorAll(".activity-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedType = btn.dataset.type;

      document.querySelectorAll(".activity-btn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");

      document.getElementById("distance").placeholder = selectedType === "swim" ? "Meters" : "Miles";
      document.getElementById("unitHelp").textContent =
        selectedType === "swim"
          ? "Enter swim distance in meters."
          : "Enter bike and run distance in miles.";
    });
  });

  document.getElementById("addBtn").addEventListener("click", addActivity);
  document.getElementById("modalBackdrop").addEventListener("click", closeProfile);
}

async function addActivity() {
  const member = document.getElementById("member").value;
  const distanceInput = document.getElementById("distance");
  const distance = parseFloat(distanceInput.value);
  const message = document.getElementById("formMessage");

  if (!distance || distance <= 0) {
    message.textContent = "Enter a distance greater than 0.";
    message.className = "mt-3 text-sm font-semibold text-red-600";
    return;
  }

  const entry = {
    member,
    type: selectedType,
    distance,
    createdAt: new Date().toISOString()
  };

  try {
    await GROUP_DOC.set({
      feed: firebase.firestore.FieldValue.arrayUnion(entry),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    distanceInput.value = "";
    message.textContent = `${member}'s ${selectedType} was added.`;
    message.className = "mt-3 text-sm font-semibold text-emerald-600";
    showToast(`${iconFor(selectedType)} ${member} ${actionWord(selectedType)} ${formatDistance(selectedType, distance)}`);
  } catch (error) {
    console.error(error);
    message.textContent = "Something went wrong saving this activity.";
    message.className = "mt-3 text-sm font-semibold text-red-600";
  }
}

function showToast(text) {
  const toast = document.getElementById("toast");
  toast.textContent = text;
  toast.classList.remove("hidden");

  setTimeout(() => {
    toast.classList.add("hidden");
  }, 2800);
}

setupForm();

console.log("LazyMan Ironman loaded: V7 cachefix feed-truth");
window.LAZYMAN_VERSION = "V7 cachefix feed-truth";
