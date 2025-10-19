import { App } from "uWebSockets.js";
import fetch from "node-fetch";
import { readFileSync, readFile } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";

// ES6 module support
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load federation configurations
const federationConfigs = JSON.parse(
  readFileSync(join(__dirname, "federations.json"), "utf8")
);

// Configuration
const PORT = 9001;
const UPDATE_INTERVAL = 15000; // Pull data from the server every N seconds

// State management
let meetData = {
  lifters: {},
  attempts: {},
  divisions: {},
  platforms: {},
  referees: {},
  meetInfo: null,
  federation: null,
  meetId: null,
  lastUpdate: null,
};

let connectedClients = [];

async function fetchData(meetId) {
  let data = null;
  const baseUrl = `https://couchdb.liftingcast.com/${meetId}_readonly`;

  try {
    console.log(`Fetching from: ${baseUrl}`);
    const response = await fetch(
      `${baseUrl}/_all_docs?conflicts=true&include_docs=true`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Origin: "https://liftingcast.com",
          Referer: "https://liftingcast.com/",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    data = await response.json();
    console.log(`Received ${data.rows?.length || 0} documents`);

    // // Uncomment if required to print all JSON data, to be used for parsing data format.
    // console.log(`Data: ${JSON.stringify(data, null, 2)}`);
    // // NB: This is not a public API. Data format may vary.
    // // You should always request a public API key.

    const lifterCount = data.rows?.filter(
      (row) => row.doc?._id?.startsWith("l") && row.doc?.name && row.doc?.gender
    ).length;
    console.log(`Found lifter docs: ${lifterCount}`);

    const attemptCount = data.rows?.filter(
      (row) =>
        row.doc?._id?.startsWith("a") &&
        row.doc?.liftName &&
        row.doc?.attemptNumber &&
        row.doc?.lifterId
    ).length;
    console.log(`Found attempt docs: ${attemptCount}`);

    return data;
  } catch (error) {
    console.error("Error fetching data:", error);
    return null;
  }
}

function mapWeightClasses(federation) {
  const config = federationConfigs[federation] || federationConfigs["IPF"];
  const classConfig = config.weightClasses;

  // Convert federation configuration file weightclasses to numeric thresholds
  const thresholds = {};

  ["MALE", "FEMALE"].forEach((sex) => {
    const classes = classConfig[sex] || {};
    const parsed = Object.values(classes)
      .map((v) => v.replace("+", "")) // remove + for parsing
      .map((v) => parseFloat(v))
      .filter((v) => !isNaN(v))
      .sort((a, b) => a - b);

    thresholds[sex] = parsed;
  });

  return function getWeightClass(sex, bodyweight) {
    if (!bodyweight || !sex) return "0";
    const upper = thresholds[sex.toUpperCase()] || thresholds["MALE"];
    if (!upper.length) return "0";

    // Find the smallest class that is >= bodyweight
    for (const w of upper) {
      if (bodyweight <= w) return w.toString();
    }

    // If heavier than all classes, return the top class with "+"
    return `${upper[upper.length - 1]}+`;
  };
}

function processMeetInfo(rows) {
  let meetInfo = {};
  // Check for the meet ID doc (e.g., "m745m8gkgmfv")
  const meetInfoDoc = rows.find((row) => row.doc?._id?.startsWith("m"))?.doc;

  if (meetInfoDoc) {
    meetInfo = {
      name: meetInfoDoc.name,
      date: meetInfoDoc.date,
      federation: meetInfoDoc.federation,
      units: meetInfoDoc.units || "KG",
      plates: meetInfoDoc.plates,
      dateFormat: meetInfoDoc.dateFormat,
      type: meetInfoDoc.type,
    };
  }

  const extraDocs = rows
    .filter((row) => row.doc && row.doc._id?.startsWith("e"))
    .map((row) => ({ id: row.doc._id, ...row.doc }));

  if (extraDocs.length > 0) {
    meetInfo.extraStuff = extraDocs;
  }

  return meetInfo;
}

function processPlatforms(rows) {
  let platforms = {};
  rows.forEach((row) => {
    const doc = row.doc;
    // Platforms usually start with "p" (e.g., "p6kby8k1v0nn")
    if (doc?._id?.startsWith("p") && doc.name && doc.clockState !== undefined) {
      platforms[doc._id] = {
        id: doc._id,
        name: doc.name,
        timerRemaining:
          typeof doc.clockState === "object" && doc.clockState?.remaining
            ? doc.clockState.remaining / 1000 // Convert ms to seconds
            : doc.clockTimerLength
            ? doc.clockTimerLength / 1000
            : 60, // Default to timer length
        clockTimerLength: doc.clockTimerLength, // Capture default timer length
        barAndCollarsWeight: doc.barAndCollarsWeight,
        currentAttemptId: doc.currentAttemptId,
        lights: [], // To be populated by processRefereeLights
      };
    }
  });

  return platforms;
}

function processReferees(rows) {
  let referees = {};
  rows.forEach((row) => {
    const doc = row.doc;
    // Referee docs usually start with "r" (e.g., "rhead-p6kby8k1v0nn")
    if (doc?._id?.startsWith("r") && doc.platformId && doc.position) {
      referees[doc._id] = {
        id: doc._id,
        platformId: doc.platformId,
        position: doc.position,
        decision: doc.decision,
        cards: doc.cards,
      };
    }
  });

  return referees;
}

function processRefereeLights(platforms, referees) {
  Object.values(platforms).forEach((platform) => {
    const platformReferees = Object.values(referees)
      .filter((r) => r.platformId === platform.id)
      .sort((a, b) => a.position.localeCompare(b.position));

    // Decision is "good" or "bad" (string), or null
    platform.lights = platformReferees.map((r) => r.decision === "good");
  });
}

function processDivisions(rows) {
  let divisions = {};

  rows.forEach((row) => {
    const doc = row.doc;

    // Identify division documents (they have _id starting with "d" and name)
    // The doc is the entire division object including equipment type and lifts keys
    if (doc?._id?.startsWith("d") && doc.name) {
      divisions[doc._id] = doc; // Store the entire division doc
    }
  });

  return divisions;
}

function processLifters(rows, federation, divisions) {
  let lifters = {};
  const getWeightClass = mapWeightClasses(federation);

  rows.forEach((row) => {
    const doc = row.doc;

    // Identify lifter data (lifter docs usually start with "l")
    if (doc?._id?.startsWith("l") && doc.name && doc.birthDate && doc.gender) {
      // Get division information
      const divisionInfo = doc.divisions?.length > 0 ? doc.divisions[0] : null;
      const divisionId = divisionInfo?.divisionId || null;
      const divisionName =
        divisionId && divisions[divisionId] ? divisions[divisionId].name : "";
      // Map weight class to division
      const sex = doc.gender;
      // Ensure bodyWeight is treated as a number, defaulting to 0 if null/missing
      const bodyweight = doc.bodyWeight > 0 ? parseFloat(doc.bodyWeight) : 0;
      const weightClass = getWeightClass(sex, bodyweight);

      lifters[doc._id] = {
        id: doc._id,
        name: doc.name,
        sex: sex,
        weightClass: weightClass,
        bodyweight: bodyweight,
        division: divisionName,
        divisionId: divisionId,
        squat: { 1: 0, 2: 0, 3: 0, best: 0 },
        bench: { 1: 0, 2: 0, 3: 0, best: 0 },
        deadlift: { 1: 0, 2: 0, 3: 0, best: 0 },
        total: 0,
        place: null,
        records: {},
        squatRackHeight: doc.squatRackHeight || "",
        benchRackHeight: doc.benchRackHeight || "",
        team: doc.team || "",
        lot: doc.lot || null,
        platformId: doc.platformId || null,
        session: doc.session || null,
        flight: doc.flight || "",
      };
    }
  });

  return lifters;
}

function processAttempts(rows, lifters) {
  let attempts = {};

  rows.forEach((row) => {
    const doc = row.doc;

    // Attempt docs usually start with "a" (e.g., "a1b-l0svoxjzi9ch")
    if (
      doc._id &&
      doc._id.startsWith("a") &&
      doc.lifterId &&
      doc.liftName &&
      doc.attemptNumber
    ) {
      attempts[doc._id] = {
        id: doc._id,
        lifterId: doc.lifterId,
        liftName: doc.liftName,
        attemptNumber: doc.attemptNumber,
        weight: doc.weight,
        result: doc.result,
        decisions: doc.decisions,
        createDate: doc.createDate,
      };

      const lifter = lifters[doc.lifterId];

      if (lifter) {
        const attemptNum = parseInt(doc.attemptNumber);
        let liftType = doc.liftName.toLowerCase();

        // Handle inconsistent naming: "dead" vs "deadlift"
        if (liftType === "dead") {
          liftType = "deadlift";
        }

        if (lifter[liftType] && attemptNum >= 1 && attemptNum <= 3) {
          // Ensure weight is treated as a number, defaulting to 0
          const weight = parseFloat(doc.weight) || 0;
          const isSuccess = doc.result?.toLowerCase() === "good";

          // Lift logic: positive for good, negative for bad, 0 for pending (null result)
          // The weight should be abs() for a failed lift, not just in the calculation
          // It should be negative only if "result" is "bad", and 0 if "result" is "null" (pending)
          lifter[liftType][attemptNum] = isSuccess
            ? weight
            : doc.result === null || doc.result === undefined
            ? 0
            : -Math.abs(weight);
        }
      }
    }
  });

  return attempts;
}

function calculateBestLifts(lifters) {
  Object.values(lifters).forEach((lifter) => {
    ["squat", "bench", "deadlift"].forEach((lift) => {
      // Filter out pending (0) and failed (negative) attempts
      const attempts = [
        lifter[lift][1],
        lifter[lift][2],
        lifter[lift][3],
      ].filter((w) => w > 0);

      lifter[lift].best = attempts.length > 0 ? Math.max(...attempts) : 0;
    });

    // Calculate total
    lifter.total =
      (lifter.squat.best || 0) +
      (lifter.bench.best || 0) +
      (lifter.deadlift.best || 0);
  });
}

function calculatePlacings(lifters) {
  const lifterArray = Object.values(lifters);

  // Group lifters by division, sex, and weight class
  const groups = {};

  lifterArray.forEach((lifter) => {
    const key = `${lifter.divisionId}_${lifter.sex}_${lifter.weightClass}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(lifter);
  });

  // Sort within each group by total (descending)
  Object.values(groups).forEach((group) => {
    const sortedGroup = group.sort((a, b) => {
      if (b.total !== a.total) {
        return b.total - a.total;
      }
      // Sort by bodyweight (ascending) for ties (lighter bodyweight wins)
      return a.bodyweight - b.bodyweight;
    });

    // Assign placings
    sortedGroup.forEach((lifter, index) => {
      // Only assign place if they have a non-zero total (i.e., completed at least one successful lift)
      lifter.place = lifter.total > 0 ? index + 1 : null;
    });
  });
}

async function updateMeetData() {
  if (!meetData.meetId) {
    console.log("No meet ID configured");
    return;
  }

  const data = await fetchData(meetData.meetId);

  if (!data || !data.rows) {
    console.log("No data received");
    return;
  }

  // Process data
  meetData.divisions = processDivisions(data.rows);
  meetData.meetInfo = processMeetInfo(data.rows);
  meetData.platforms = processPlatforms(data.rows);
  meetData.referees = processReferees(data.rows);
  meetData.lifters = processLifters(
    data.rows,
    meetData.federation,
    meetData.divisions
  );
  meetData.attempts = processAttempts(data.rows, meetData.lifters);

  // Calculate results
  calculateBestLifts(meetData.lifters);
  calculatePlacings(meetData.lifters);

  // Update live display
  processRefereeLights(meetData.platforms, meetData.referees);

  meetData.lastUpdate = new Date().toISOString();

  console.log(
    `Updated data for ${Object.keys(meetData.lifters).length} lifters`
  );

  // Broadcast to all connected clients
  broadcastUpdate();
}

/**
 * Broadcast updated data to all connected WebSocket clients
 */
function broadcastUpdate() {
  const message = JSON.stringify({
    type: "update",
    data: {
      lifters: meetData.lifters,
      attempts: meetData.attempts,
      divisions: meetData.divisions,
      platforms: meetData.platforms,
      referees: meetData.referees,
      meetInfo: meetData.meetInfo,
      federation: meetData.federation,
      lastUpdate: meetData.lastUpdate,
    },
  });

  connectedClients.forEach((ws) => {
    try {
      ws.send(message);
    } catch (err) {
      console.warn("Failed to send update to client:", err.message);
    }
  });
}

/**
 * Start the uWS server
 */
function startServer() {
  const app = App();

  // Serve static files
  app.get("/*", (res, req) => {
    let isAborted = false;

    res.onAborted(() => {
      isAborted = true;
    });

    const url = req.getUrl();
    let filePath;

    if (url === "/" || url === "") {
      filePath = join(__dirname, "public", "index.html");
    } else {
      filePath = join(__dirname, "public", url);
    }

    // Attempt to prevent directory traversal
    if (!filePath.startsWith(join(__dirname, "public"))) {
      res.cork(() => {
        res.writeStatus("403 Forbidden").end("Access denied");
      });
      return;
    }

    readFile(filePath, (err, data) => {
      if (isAborted) return;

      // Cork all writes
      res.cork(() => {
        if (err) {
          res.writeStatus("404 Not Found").end("File not found");
          return;
        }

        // Set content type based on file extension
        const ext = extname(filePath);
        const contentTypes = {
          ".html": "text/html",
          ".css": "text/css",
          ".js": "application/javascript",
          ".json": "application/json",
        };

        const contentType = contentTypes[ext] || "application/octet-stream";
        res.writeHeader("Content-Type", contentType);
        res.end(data);
      });
    });
  });

  // WebSocket endpoint
  app.ws("/ws", {
    open: (ws) => {
      console.log("Client connected");
      connectedClients.push(ws);

      // Send current data immediately
      try {
        ws.send(
          JSON.stringify({
            type: "initial",
            data: {
              lifters: meetData.lifters,
              lastUpdate: meetData.lastUpdate,
              federation: meetData.federation,
              federations: Object.keys(federationConfigs),
            },
          })
        );
      } catch (err) {
        console.warn("Failed to send initial data to client:", err.message);
      }
    },

    message: (ws, message, isBinary) => {
      try {
        const msg = JSON.parse(Buffer.from(message).toString());
        if (msg.type === "configure") {
          meetData.meetId = msg.meetId;
          meetData.federation = msg.federation || "IPF";
          console.log(
            `Configured: Meet ID=${meetData.meetId}, Federation=${meetData.federation}`
          );
          // Immediately fetch data
          updateMeetData();
        }
      } catch (err) {
        console.error("Error handling client message:", err.message);
      }
    },

    close: (ws, code, message) => {
      console.log("Client disconnected");
      connectedClients = connectedClients.filter((client) => client !== ws);
    },
  });

  app.listen(PORT, (token) => {
    if (token) {
      console.log(`Server listening on port ${PORT}`);
      console.log(`Open http://localhost:${PORT} in your browser`);
    } else {
      console.log("Failed to listen on port " + PORT);
    }
  });

  // Set up periodic updates
  setInterval(() => {
    if (meetData.meetId) {
      updateMeetData();
    }
  }, UPDATE_INTERVAL);
}

// Start the server
startServer();
