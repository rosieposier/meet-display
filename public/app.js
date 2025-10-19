// Application State
const state = {
  ws: null,
  lifters: {},
  platforms: {},
  referees: {},
  attempts: {},
  meetInfo: {},
  federation: null,
  filters: {
    male: true,
    female: true,
    search: "",
  },
  currentPlatformId: null, // To toggle between platforms later
  layout: "table", // 'table', 'compact', 'timer', 'plates', 'overlay'
  columnOrder: [], // For drag-and-drop reordering
};

// DOM Elements
const elements = {
  configPanel: document.getElementById("config-panel"),
  mainDisplay: document.getElementById("main-display"),
  displayModeSelect: document.getElementById("display-mode"),
  meetIdInput: document.getElementById("meet-id"),
  federationSelect: document.getElementById("federation"),
  connectBtn: document.getElementById("connect-btn"),
  disconnectBtn: document.getElementById("disconnect-btn"),
  toggleLayoutBtn: document.getElementById("toggle-layout"),
  fullscreenBtn: document.getElementById("fullscreen-btn"),
  searchInput: document.getElementById("search-lifter"),
  resultsBody: document.getElementById("results-body"),
  resultsContainer: document.getElementById("results-container"),
  compactContainer: document.getElementById("compact-container"),
  compactGrid: document.getElementById("compact-grid"),
  statusIndicator: document.getElementById("status-indicator"),
  statusText: document.getElementById("status-text"),
  meetTitle: document.getElementById("meet-title"),
  federationName: document.getElementById("federation-name"),
  lastUpdate: document.getElementById("last-update"),
};

/**
 * Initialise WebSocket connection
 */
function connectWebSocket() {
  const meetId = elements.meetIdInput.value.trim();
  const federation = elements.federationSelect.value;

  if (!meetId) {
    alert("Please enter a Meet ID");
    return;
  }

  updateStatus("connecting", "Connecting...");

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  state.ws = new WebSocket(wsUrl);

  state.ws.onopen = () => {
    console.log("WebSocket connected");
    updateStatus("connected", "Connected");

    // Send configuration
    state.ws.send(
      JSON.stringify({
        type: "configure",
        meetId: meetId,
        federation: federation,
      })
    );

    // Show main display
    elements.configPanel.classList.add("hidden");
    elements.mainDisplay.classList.remove("hidden");
  };

  state.ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    handleWebSocketMessage(message);
  };

  state.ws.onerror = (error) => {
    console.error("WebSocket error:", error);
    updateStatus("disconnected", "Connection Error");
  };

  state.ws.onclose = () => {
    console.log("WebSocket disconnected");
    updateStatus("disconnected", "Disconnected");
  };
}

/**
 * Handle incoming WebSocket messages
 */
function handleWebSocketMessage(message) {
  if (message.type === "initial" || message.type === "update") {
    const data = message.data;
    state.lifters = data.lifters || {};
    state.platforms = data.platforms || {};
    state.attempts = data.attempts || {};
    state.referees = data.referees || {};
    state.meetInfo = data.meetInfo || {};
    state.federation = data.federation;

    // Update header with meet information
    elements.meetTitle.innerHTML = state.meetInfo.name || "Live Results";
    elements.federationName.innerHTML = `Federation: ${state.federation}`;

    if (data.lastUpdate) {
      const updateTime = new Date(data.lastUpdate);
      elements.lastUpdate.innerHTML = `Last updated: ${updateTime.toLocaleString()}`;
    }

    // Render results with the new data
    renderResults();
  }
}

/**
 * Update connection status indicator
 */
function updateStatus(status, text) {
  elements.statusIndicator.className = `status-indicator ${status}`;
  elements.statusText.innerHTML = text;
}

/**
 * Filter lifters based on current filters
 */
function getFilteredLifters() {
  return Object.values(state.lifters).filter((lifter) => {
    if (state.filters.search) {
      const searchTerm = state.filters.search.toLowerCase();
      if (!lifter.name.toLowerCase().includes(searchTerm)) return false;
    }

    return true;
  });
}
/**
 * Format attempt weight for display
 */
function formatAttempt(weight) {
  if (weight === 0) return "-";
  if (weight > 0) return weight.toFixed(1);
  return `(${Math.abs(weight).toFixed(1)})`;
}

/**
 * Get CSS class for attempt cell
 */
function getAttemptClass(weight) {
  if (weight === 0) return "attempt-pending";
  if (weight > 0) return "attempt-good";
  return "attempt-bad";
}

/**
 * Get CSS class for place
 */
function getPlaceClass(place) {
  if (place === 1) return "place-1";
  if (place === 2) return "place-2";
  if (place === 3) return "place-3";
  return "";
}

/**
 * Render results in table view
 */
function renderTableView(lifters) {
  elements.resultsBody.innerHTML = "";

  if (lifters.length === 0) {
    elements.resultsBody.innerHTML = `<tr><td colspan="22" style="text-align: center; padding: 40px;">No lifters found</td></tr>`;
    return;
  }

  // Sort lifters by place for table view consistency
  const sortedLifters = [...lifters].sort((a, b) => {
    if (a.place === null) return 1;
    if (b.place === null) return -1;
    return a.place - b.place;
  });

  sortedLifters.forEach((lifter) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="${getPlaceClass(lifter.place)}">${lifter.place || "-"}</td>
      <td style="font-weight: 600; text-align: left;">${lifter.name}</td>
      <td>${lifter.sex === "MALE" ? "M" : "F"}</td>
      <td>${lifter.division || "-"}</td>
      <td>${lifter.weightClass || "-"}</td>
      <td>${lifter.bodyweight > 0 ? lifter.bodyweight.toFixed(1) : "-"}</td>
      <td class="${getAttemptClass(lifter.squat[1])}">${formatAttempt(
      lifter.squat[1]
    )}</td>
      <td class="${getAttemptClass(lifter.squat[2])}">${formatAttempt(
      lifter.squat[2]
    )}</td>
      <td class="${getAttemptClass(lifter.squat[3])}">${formatAttempt(
      lifter.squat[3]
    )}</td>
      <td class="best-lift">${
        lifter.squat.best > 0 ? lifter.squat.best.toFixed(1) : "-"
      }</td>
      <td class="${getAttemptClass(lifter.bench[1])}">${formatAttempt(
      lifter.bench[1]
    )}</td>
      <td class="${getAttemptClass(lifter.bench[2])}">${formatAttempt(
      lifter.bench[2]
    )}</td>
      <td class="${getAttemptClass(lifter.bench[3])}">${formatAttempt(
      lifter.bench[3]
    )}</td>
      <td class="best-lift">${
        lifter.bench.best > 0 ? lifter.bench.best.toFixed(1) : "-"
      }</td>
      <td class="${getAttemptClass(lifter.deadlift[1])}">${formatAttempt(
      lifter.deadlift[1]
    )}</td>
      <td class="${getAttemptClass(lifter.deadlift[2])}">${formatAttempt(
      lifter.deadlift[2]
    )}</td>
      <td class="${getAttemptClass(lifter.deadlift[3])}">${formatAttempt(
      lifter.deadlift[3]
    )}</td>
      <td class="best-lift">${
        lifter.deadlift.best > 0 ? lifter.deadlift.best.toFixed(1) : "-"
      }</td>
      <td style="font-weight: 700; font-size: 16px;">${
        lifter.total > 0 ? lifter.total.toFixed(1) : "-"
      }</td>
    `;
    elements.resultsBody.appendChild(row);
  });
}

/**
 * Render results in compact card view
 */
function renderCompactView(lifters) {
  elements.compactGrid.innerHTML = "";

  if (lifters.length === 0) {
    elements.compactGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #7f8c8d;">No lifters found</div>`;
    return;
  }

  const sortedLifters = [...lifters].sort((a, b) => {
    if (a.place === null) return 1;
    if (b.place === null) return -1;
    return a.place - b.place;
  });

  sortedLifters.forEach((lifter) => {
    const card = document.createElement("div");
    card.className = "lifter-card";
    card.innerHTML = `
      <div class="card-header">
        <div class="card-name">${lifter.name}</div>
        ${lifter.place ? `<div class="card-place">#${lifter.place}</div>` : ""}
      </div>
      <div class="card-info">
        <span><strong>SEX:</strong> ${
          lifter.sex === "MALE" ? "Male" : "Female"
        }</span>
        <span><strong>DIV:</strong> ${lifter.division || "-"}</span>
        <span><strong>CLASS:</strong> ${lifter.weightClass || "-"}</span>
        <span><strong>BW:</strong> ${
          lifter.bodyweight > 0 ? lifter.bodyweight.toFixed(1) : "-"
        } kg</span>
      </div>
      <div class="card-lifts">
        <div class="lift-row">
          <span class="lift-name">Squat</span>
          <div class="lift-attempts">
            <span class="lift-attempt ${getAttemptClass(
              lifter.squat[1]
            )}">${formatAttempt(lifter.squat[1])}</span>
            <span class="lift-attempt ${getAttemptClass(
              lifter.squat[2]
            )}">${formatAttempt(lifter.squat[2])}</span>
            <span class="lift-attempt ${getAttemptClass(
              lifter.squat[3]
            )}">${formatAttempt(lifter.squat[3])}</span>
          </div>
          <span class="lift-best">${
            lifter.squat.best > 0 ? lifter.squat.best.toFixed(1) : "-"
          }</span>
        </div>
        <div class="lift-row">
          <span class="lift-name">Bench</span>
          <div class="lift-attempts">
            <span class="lift-attempt ${getAttemptClass(
              lifter.bench[1]
            )}">${formatAttempt(lifter.bench[1])}</span>
            <span class="lift-attempt ${getAttemptClass(
              lifter.bench[2]
            )}">${formatAttempt(lifter.bench[2])}</span>
            <span class="lift-attempt ${getAttemptClass(
              lifter.bench[3]
            )}">${formatAttempt(lifter.bench[3])}</span>
          </div>
          <span class="lift-best">${
            lifter.bench.best > 0 ? lifter.bench.best.toFixed(1) : "-"
          }</span>
        </div>
        <div class="lift-row">
          <span class="lift-name">Deadlift</span>
          <div class="lift-attempts">
            <span class="lift-attempt ${getAttemptClass(
              lifter.deadlift[1]
            )}">${formatAttempt(lifter.deadlift[1])}</span>
            <span class="lift-attempt ${getAttemptClass(
              lifter.deadlift[2]
            )}">${formatAttempt(lifter.deadlift[2])}</span>
            <span class="lift-attempt ${getAttemptClass(
              lifter.deadlift[3]
            )}">${formatAttempt(lifter.deadlift[3])}</span>
          </div>
          <span class="lift-best">${
            lifter.deadlift.best > 0 ? lifter.deadlift.best.toFixed(1) : "-"
          }</span>
        </div>
      </div>
      <div class="card-total">
        <div class="total-label">TOTAL</div>
        <div class="total-value">${
          lifter.total > 0 ? lifter.total.toFixed(1) : "-"
        } kg</div>
      </div>
    `;
    elements.compactGrid.appendChild(card);
  });
}

/**
 * Render live timer + lights display
 */
function renderTimerLightsView() {
  // Ensure a default platform is selected if none is set
  if (!state.currentPlatformId && Object.keys(state.platforms).length > 0) {
    state.currentPlatformId = Object.keys(state.platforms)[0];
  }

  const platform = state.platforms[state.currentPlatformId];
  if (!platform) {
    elements.resultsContainer.innerHTML = `<div class="timer-lights-display"><div class="timer-box"><h2>No Active Platform</h2></div></div>`;
    return;
  }

  const currentAttempt = platform.currentAttemptId
    ? state.attempts[platform.currentAttemptId]
    : null;
  const currentLifter = currentAttempt
    ? state.lifters[currentAttempt.lifterId]
    : null;

  // Use data provided by the backend, with sensible defaults
  const timeRemaining = platform.timerRemaining ?? 60.0;
  const lights = platform.lights ?? [false, false, false];
  const goodLights = lights.filter((l) => l === true).length;
  const resultClass = goodLights >= 2 ? "good" : "bad";

  elements.resultsContainer.innerHTML = `
      <div class="timer-lights-display">
        <div class="timer-box">
          <h2>${currentLifter ? currentLifter.name : "No Active Lifter"}</h2>
          <div id="live-timer" class="timer-value">${timeRemaining.toFixed(
            1
          )}s</div>
          <div class="attempt-info">
            ${
              currentAttempt
                ? `${currentAttempt.liftName} Attempt ${currentAttempt.attemptNumber} - ${currentAttempt.weight} kg`
                : ""
            }
          </div>
        </div>
        <div class="lights-box">
          <h2>Referee Lights</h2>
          <div class="lights ${resultClass}">
            ${lights
              .map(
                (isGood) =>
                  `<div class="light ${isGood ? "white" : "red"}"></div>`
              )
              .join("")}
          </div>
        </div>
      </div>
    `;
}

/**
 * Render live plate-loading display
 */
function renderPlateLoadingView() {
  if (!state.currentPlatformId && Object.keys(state.platforms).length > 0) {
    state.currentPlatformId = Object.keys(state.platforms)[0];
  }

  const platform = state.platforms[state.currentPlatformId];
  if (!platform) {
    elements.resultsContainer.innerHTML = `<div class="plates-display"><div class="plates-weight"><div class="value">No Active Platform</div></div></div>`;
    return;
  }

  const currentAttempt = platform.currentAttemptId
    ? state.attempts[platform.currentAttemptId]
    : null;
  const currentLifter = currentAttempt
    ? state.lifters[currentAttempt.lifterId]
    : null;
  const lights = platform.lights ?? [false, false, false];
  const timeRemaining = platform.timerRemaining ?? 0.0;
  const currentLoad = currentAttempt ? currentAttempt.weight : 0.0;

  elements.resultsContainer.innerHTML = `
    <div class="plates-display">
      <div class="plates-weight">
        <div class="label">Current Load</div>
        <div id="current-load" class="value">${currentLoad.toFixed(1)} kg</div>
      </div>
      <div class="rack-info">
        ${
          currentLifter
            ? `<div>Rack Heights: <strong>SQ ${
                currentLifter.squatRackHeight || "N/A"
              } / BP ${currentLifter.benchRackHeight || "N/A"}</strong></div>`
            : ""
        }
      </div>
      <div class="next-attempt">
        <div>Lifter: <strong>${
          currentLifter ? currentLifter.name : "N/A"
        }</strong></div>
      </div>
      <div class="lights-timer-inline">
        ${lights
          .map(
            (isGood) => `<div class="light ${isGood ? "white" : "red"}"></div>`
          )
          .join("")}
        <div id="plate-timer">${timeRemaining.toFixed(1)}s</div>
      </div>
    </div>
  `;
}

/**
 * Render livestream overlay display
 */
function renderOverlayView() {
  if (!state.currentPlatformId && Object.keys(state.platforms).length > 0) {
    state.currentPlatformId = Object.keys(state.platforms)[0];
  }

  const platform = state.platforms[state.currentPlatformId];
  const currentAttempt = platform?.currentAttemptId
    ? state.attempts[platform.currentAttemptId]
    : null;
  const currentLifter = currentAttempt
    ? state.lifters[currentAttempt.lifterId]
    : null;

  if (!currentLifter) {
    elements.resultsContainer.innerHTML = `
      <div class="overlay-display">
        <div class="overlay-lifter"><div class="lifter-name">No Active Lifter</div></div>
      </div>`;
    return;
  }

  const timeRemaining = platform.timerRemaining ?? 60.0;
  const lights = platform.lights ?? [false, false, false];

  elements.resultsContainer.innerHTML = `
    <div class="overlay-display">
      <div class="overlay-lifter">
        <div class="lifter-name">${currentLifter.name}</div>
        <div class="lifter-meta">
          ${currentLifter.sex} ${currentLifter.division || ""} | ${
    currentLifter.weightClass || ""
  } kg Class
        </div>
      </div>
      <div class="overlay-attempts">
        <div>Squat: <strong>${
          currentLifter.squat.best > 0 ? currentLifter.squat.best : "-"
        }</strong></div>
        <div>Bench: <strong>${
          currentLifter.bench.best > 0 ? currentLifter.bench.best : "-"
        }</strong></div>
        <div>Deadlift: <strong>${
          currentLifter.deadlift.best > 0 ? currentLifter.deadlift.best : "-"
        }</strong></div>
        <div>Total: <strong>${
          currentLifter.total > 0 ? currentLifter.total : "-"
        }</strong></div>
      </div>
      <div class="overlay-lights">
        ${lights
          .map((l) => `<div class="light ${l ? "white" : "red"}"></div>`)
          .join("")}
        <div class="overlay-timer">${timeRemaining.toFixed(1)}s</div>
      </div>
    </div>`;
}

/**
 * Render results based on current layout
 */
function renderResults() {
  const filteredLifters = getFilteredLifters();

  // Hide all containers first
  elements.resultsContainer.classList.add("hidden");
  elements.compactContainer.classList.add("hidden");

  if (state.layout === "table") {
    elements.resultsContainer.classList.remove("hidden");
    renderTableView(filteredLifters);
  } else if (state.layout === "compact") {
    elements.compactContainer.classList.remove("hidden");
    renderCompactView(filteredLifters);
  } else if (state.layout === "timer") {
    elements.resultsContainer.classList.remove("hidden");
    renderTimerLightsView();
  } else if (state.layout === "plates") {
    elements.resultsContainer.classList.remove("hidden");
    renderPlateLoadingView();
  } else if (state.layout === "overlay") {
    elements.resultsContainer.classList.remove("hidden");
    renderOverlayView();
  }
}

/**
 * Toggle fullscreen mode
 */
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
}

/**
 * Disconnect and return to config
 */
function disconnect() {
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }

  elements.mainDisplay.classList.add("hidden");
  elements.configPanel.classList.remove("hidden");

  // Reset state
  state.lifters = {};
  state.platforms = {};
  state.attempts = {};
  state.meetInfo = {};
  state.federation = null;
}

/**
 * Event Listeners
 */
elements.connectBtn.addEventListener("click", connectWebSocket);
elements.disconnectBtn.addEventListener("click", disconnect);
elements.fullscreenBtn.addEventListener("click", toggleFullscreen);
elements.displayModeSelect.addEventListener("change", (e) => {
  state.layout = e.target.value;
  renderResults();
});

elements.searchInput.addEventListener("input", (e) => {
  state.filters.search = e.target.value;
  renderResults();
});

// Allow Enter key to connect
elements.meetIdInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    connectWebSocket();
  }
});

/**
 * Initialise application
 */
console.log("Live Meet Display initialised");
