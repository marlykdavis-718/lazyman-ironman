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

/* =========================
   Helpers
========================= */

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

function completionPercent(member) {
  const swim = Math.min(member.swim / GOALS.swim, 1);
  const bike = Math.min(member.bike / GOALS.bike, 1);
  const run = Math.min(member.run / GOALS.run, 1);
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

function sortedParticipants() {
  return [...PARTICIPANTS].sort((a, b) => {
    return completionPercent(state.members[b.name]) - completionPercent(state.members[a.name]);
  });
}

function timeLabel(timestamp) {
  if (!timestamp) return "just now";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
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

/* =========================
   Firebase Sync
========================= */

async function initializeDocumentIfNeeded() {
  const snap = await GROUP_DOC.get();

  if (!snap.exists) {
    const members = {};
    PARTICIPANTS.forEach(p => {
      members[p.name] = { swim: 0, bike: 0, run: 0 };
    });

    await GROUP_DOC.set({
      members,
      feed: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
}

GROUP_DOC.onSnapshot(snapshot => {
  if (!snapshot.exists) return;

  const cloud = snapshot.data();
  state.members = cloud.members || {};
  state.feed = Array.isArray(cloud.feed) ? cloud.feed : [];

  ensureAllUsers();
  render();
});

initializeDocumentIfNeeded();

/* =========================
   Rendering
========================= */

function render() {
  renderHero();
  renderPodium();
  renderJourney();
  renderAthletes();
  renderMilestones();
  renderFeed();
}

function renderHero() {
  const sorted = sortedParticipants();
  const leader = sorted[0];
  const leaderMember = state.members[leader.name];
  const totalMiles = totalMilesEquivalent();

  document.getElementById("leaderAvatar").textContent = leader.name[0];
  document.getElementById("leaderAvatar").style.background = leader.hex;
  document.getElementById("leaderName").textContent = leader.name;
  document.getElementById("leaderPct").textContent = `${formatNumber(completionPercent(leaderMember), 1)}% complete`;
  document.getElementById("groupMiles").textContent = formatNumber(totalMiles, 1);
  document.getElementById("activityCount").textContent = (state.feed || []).length;
}

function renderPodium() {
  const sorted = sortedParticipants().slice(0, 3);
  const medals = ["🥇", "🥈", "🥉"];

  document.getElementById("podium").innerHTML = sorted.map((p, index) => {
    const m = state.members[p.name];
    return `
      <article class="card-hover rounded-3xl bg-white p-5 shadow border-t-4" style="border-color:${p.hex}">
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

function renderAthletes() {
  document.getElementById("athleteGrid").innerHTML = PARTICIPANTS.map(p => {
    const m = state.members[p.name];
    const total = completionPercent(m);

    return `
      <article class="card-hover rounded-3xl bg-slate-50 p-5 border border-slate-200">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="h-12 w-12 rounded-2xl grid place-items-center text-white font-black text-xl" style="background:${p.hex}">
              ${p.name[0]}
            </div>
            <div>
              <h3 class="text-lg font-black">${p.name}</h3>
              <p class="text-sm text-slate-500">${formatNumber(total, 1)}% complete</p>
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

  return `
    <div class="mt-4">
      <div class="mb-1 flex justify-between text-sm">
        <span class="font-bold text-slate-700">${iconFor(type)} ${label}</span>
        <span class="text-slate-500">${formatDistance(type, value)} / ${formatDistance(type, goal)}</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width:${pct}%; background:${accent}"></div>
      </div>
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

  const latest = hits.slice(-8).reverse();

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
      if (typeof item === "string") {
        return `<div class="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">${item}</div>`;
      }

      const p = participant(item.member);
      return `
        <div class="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
          <div class="h-10 w-10 rounded-xl grid place-items-center text-white font-black" style="background:${p.hex}">
            ${p.name[0]}
          </div>
          <div class="flex-1">
            <p class="font-bold">${iconFor(item.type)} ${item.member} logged ${formatDistance(item.type, item.distance)} ${item.type}</p>
            <p class="text-xs text-slate-500">${timeLabel(item.createdAt)}</p>
          </div>
        </div>
      `;
    }).join("")
    : `<p class="text-sm text-slate-500">No activities yet. Log the first one!</p>`;
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

  const fieldPath = `members.${member}.${selectedType}`;

  try {
    await GROUP_DOC.set({
      [fieldPath]: firebase.firestore.FieldValue.increment(distance),
      feed: firebase.firestore.FieldValue.arrayUnion(entry),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    distanceInput.value = "";
    message.textContent = `${member}'s ${selectedType} was added.`;
    message.className = "mt-3 text-sm font-semibold text-emerald-600";
    showToast(`${iconFor(selectedType)} ${member} logged ${formatDistance(selectedType, distance)} ${selectedType}`);
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
