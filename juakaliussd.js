import express from "express";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ─── In-memory session ─────────────────────────────
const sessions = {};
const getSession = (phone) => (sessions[phone] ??= {});
const clearSession = (phone) => delete sessions[phone];

// ─── Trades ─────────────────────────────────────────
const TRADES = ["Welder", "Carpenter", "Mechanic", "Tailor", "Electrician"];

// ─── In-memory "database" ──────────────────────────
let nextArtisanId = 3;
let nextToolId = 3;
let nextExchangeId = 1;

const ARTISANS = {
  "254700111111": {
    id: "ART-001",
    phone: "254700111111",
    name: "Otieno Welding",
    trade: "Welder",
    location: "Kariobangi, near St. Peters Church",
    lat: -1.2545,
    lng: 36.8825,
    experience: 5,
    certifications: "",
    approved: true,
    ratings: [4, 5, 5],
  },
  "254700222222": {
    id: "ART-002",
    phone: "254700222222",
    name: "Mama Njeri Tailoring",
    trade: "Tailor",
    location: "Gikomba Market, Section 3",
    lat: -1.2841,
    lng: 36.8312,
    experience: 8,
    certifications: "",
    approved: true,
    ratings: [3, 4],
  },
};

const TOOLS = {
  1: {
    id: 1,
    ownerPhone: "254700111111",
    name: "Pipe Bender",
    description: "Heavy duty pipe bender, manual",
    condition: "good",
    price: 600,
    deposit: 1000,
    available: true,
    history: [],
  },
  2: {
    id: 2,
    ownerPhone: "254700111111",
    name: "Welding Machine",
    description: "Arc welder, 200A",
    condition: "good",
    price: 800,
    deposit: 2000,
    available: true,
    history: [],
  },
};

const EXCHANGES = {};
const EMERGENCIES = [];

// ─── Helpers ────────────────────────────────────────

function distanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const findArtisan = (phone) => ARTISANS[phone];

const avgRating = (artisan) => {
  if (!artisan.ratings.length) return 0;
  return (
    artisan.ratings.reduce((a, b) => a + b, 0) / artisan.ratings.length
  ).toFixed(1);
};

const completedExchangeCount = (phone) =>
  Object.values(EXCHANGES).filter(
    (e) => e.ownerPhone === phone && e.status === "completed"
  ).length;

const tradeList = () =>
  TRADES.map((t, i) => `${i + 1}. ${t}`).join("\n");

const myTools = (phone) =>
  Object.values(TOOLS).filter((t) => t.ownerPhone === phone);

const myToolList = (phone) => {
  const tools = myTools(phone);
  if (!tools.length) return "You have no tools listed.";
  return tools
    .map(
      (t, i) =>
        `${i + 1}. ${t.name} (${t.available ? "Available" : "Unavailable"}) - KES ${t.price}/day`
    )
    .join("\n");
};

const DEFAULT_COORDS = { lat: -1.2864, lng: 36.8172 };

function searchTools(query, radiusKm, fromArtisan) {
  const q = query.toLowerCase();
  const origin = fromArtisan
    ? { lat: fromArtisan.lat, lng: fromArtisan.lng }
    : DEFAULT_COORDS;

  return Object.values(TOOLS)
    .filter((t) => t.available && t.name.toLowerCase().includes(q))
    .map((t) => {
      const owner = findArtisan(t.ownerPhone);
      if (!owner) return null;
      const dist = distanceKm(origin.lat, origin.lng, owner.lat, owner.lng);
      return { tool: t, owner, dist };
    })
    .filter((r) => r && r.dist <= radiusKm)
    .sort((a, b) => a.dist - b.dist);
}

// ─── Menu ──────────────────────────────────────────
const MAIN_MENU = `CON Welcome to JuaKali Link
1. Register
2. Search Tools
3. My Tools
4. My Exchanges
5. Rate an Exchange
6. Emergency Tool Request
7. Contact Support`;

// ─── USSD handler ──────────────────────────────────
app.post("/ussd", (req, res) => {
  let { phoneNumber, text } = req.body;

  text = text || "";
  const phone = (phoneNumber || "unknown").replace("+", "");
  const session = getSession(phone);
  const artisan = findArtisan(phone);

  const parts = text.split("*");
  const level = parts.length;

  let response = "";

  // ── LEVEL 0 ──
  if (text === "") {
    clearSession(phone);
    response = MAIN_MENU;

  // ── LEVEL 1 ──
  } else if (level === 1) {
    switch (parts[0]) {
      case "1":
        if (artisan) {
          response = `END You are already registered as ${artisan.name} (${artisan.id}).`;
        } else {
          response = `CON Enter your full name:`;
        }
        break;

      case "2":
        response = `CON Enter tool name to search (e.g. weld):`;
        break;

      case "3":
        if (!artisan) {
          response = `END Register first. Dial again and select 1.`;
        } else {
          response = `CON ${myToolList(phone)}\n\n1. List a new tool\n2. Toggle availability\n3. Back`;
        }
        break;

      case "4":
        if (!artisan) {
          response = `END Register first. Dial again and select 1.`;
        } else {
          const mine = Object.values(EXCHANGES).filter(
            (e) => e.ownerPhone === phone || e.borrowerPhone === phone
          );
          if (!mine.length) {
            response = `END You have no exchanges yet.`;
          } else {
            const pending = mine.filter(
              (e) => e.ownerPhone === phone && e.status === "requested"
            );
            const list = mine
              .slice(-5)
              .map((e) => `${e.id}: ${e.toolName} - ${e.status}`)
              .join("\n");
            response = `CON Recent exchanges:\n${list}\n\n${
              pending.length ? "1. Review pending requests\n" : ""
            }2. Back`;
          }
        }
        break;

      case "5":
        if (!artisan) {
          response = `END Register first. Dial again and select 1.`;
        } else {
          response = `CON Enter Exchange ID to rate (e.g. EX-1):`;
        }
        break;

      case "6":
        if (!artisan) {
          response = `END Register first. Dial again and select 1.`;
        } else {
          response = `CON Emergency Tool Request\nEnter tool name urgently needed:`;
        }
        break;

      case "7":
        response = `CON Support:
1. Call JuaKali Link
2. WhatsApp
3. Request Callback
4. Main menu`;
        break;

      default:
        response = `END Invalid option. Please dial again.`;
    }

  // ── LEVEL 2 ──
  } else if (level === 2) {
    const [l1, l2] = parts;

    // Registration: name -> trade
    if (l1 === "1") {
      response = `CON Select your trade:\n${tradeList()}`;
    }

    // Search: query -> radius
    else if (l1 === "2") {
      response = `CON Select search radius:\n1. 1 km\n2. 2 km\n3. 5 km`;
    }

    // My Tools submenu
    else if (l1 === "3") {
      if (l2 === "1") {
        response = `CON Enter tool name:`;
      } else if (l2 === "2") {
        const tools = myTools(phone);
        if (!tools.length) {
          response = `END You have no tools to toggle.`;
        } else {
          response = `CON Select tool to toggle:\n${tools
            .map((t, i) => `${i + 1}. ${t.name} (${t.available ? "Available" : "Unavailable"})`)
            .join("\n")}`;
        }
      } else {
        response = MAIN_MENU;
      }
    }

    // My exchanges: review pending
    else if (l1 === "4") {
      if (l2 === "1") {
        const pending = Object.values(EXCHANGES).filter(
          (e) => e.ownerPhone === phone && e.status === "requested"
        );
        if (!pending.length) {
          response = `END No pending requests.`;
        } else {
          response = `CON Pending requests:\n${pending
            .map((e) => `${e.id}: ${e.toolName} x${e.days}d by ${e.borrowerName}`)
            .join("\n")}\n\nReply with Exchange ID e.g. EX-1:`;
        }
      } else {
        response = MAIN_MENU;
      }
    }

    // Rate exchange
    else if (l1 === "5") {
      const ex = EXCHANGES[l2.toUpperCase()];
      if (!ex || ex.status !== "completed") {
        response = `END Exchange not found or not completed.`;
      } else {
        session.rateExId = l2.toUpperCase();
        response = `CON Rate 1-5 stars:\n1\n2\n3\n4\n5`;
      }
    }

    // Emergency: tool -> description
    else if (l1 === "6") {
      session.emTool = l2;
      response = `CON Enter brief description of the situation:`;
    }

    // Support submenu
    else if (l1 === "7") {
      if (l2 === "1") response = `END Call us: 0800 720 600`;
      else if (l2 === "2") response = `END WhatsApp: +254 700 555 111`;
      else if (l2 === "3") response = `END Callback requested for ${phone}`;
      else if (l2 === "4") response = MAIN_MENU;
      else response = `END Invalid option`;
    } else {
      response = `END Session ended`;
    }

  // ── LEVEL 3 ──
  } else if (level === 3) {
    const [l1, l2, l3] = parts;

    // Registration: name, trade -> location
    if (l1 === "1") {
      const tradeIdx = parseInt(l3) - 1;
      if (isNaN(tradeIdx) || !TRADES[tradeIdx]) {
        response = `END Invalid trade selection.`;
      } else {
        session.regName = l2;
        session.regTrade = TRADES[tradeIdx];
        response = `CON Enter your location (e.g. Kariobangi near church):`;
      }
    }

    // Search: query, radius -> results
    else if (l1 === "2") {
      const radiusMap = { 1: 1, 2: 2, 3: 5 };
      const radius = radiusMap[l3];
      if (!radius) {
        response = `END Invalid radius.`;
      } else {
        const results = searchTools(l2, radius, artisan);
        if (!results.length) {
          response = `END No tools found matching "${l2}" within ${radius}km.`;
        } else {
          const lines = results
            .slice(0, 5)
            .map(
              (r, i) =>
                `${i + 1}. ${r.tool.name} - ${r.owner.name} (${r.owner.trade})\n   ${r.dist.toFixed(1)}km, KES ${r.tool.price}/day, ${avgRating(r.owner)} stars`
            )
            .join("\n");
          session.lastSearchResults = results;
          response = `CON Results:\n${lines}\n\nEnter number to request, or 0 to exit:`;
        }
      }
    }

    // My Tools: list new tool name -> condition
    else if (l1 === "3" && l2 === "1") {
      session.newTool = { name: l3 };
      response = `CON Enter condition:\n1. New\n2. Good\n3. Worn`;
    }

    // My Tools: toggle
    else if (l1 === "3" && l2 === "2") {
      const tools = myTools(phone);
      const idx = parseInt(l3) - 1;
      const tool = tools[idx];
      if (!tool) {
        response = `END Invalid tool selection.`;
      } else {
        tool.available = !tool.available;
        response = `END ${tool.name} is now ${tool.available ? "available" : "unavailable"}.`;
      }
    }

    // My exchanges: accept/decline
    else if (l1 === "4" && l2 === "1") {
      const ex = EXCHANGES[l3.toUpperCase()];
      if (!ex || ex.ownerPhone !== phone || ex.status !== "requested") {
        response = `END Request not found or already handled.`;
      } else {
        session.respondExId = l3.toUpperCase();
        response = `CON ${ex.toolName} requested by ${ex.borrowerName} for ${ex.days} day(s).\n1. Accept\n2. Decline`;
      }
    }

    // Rate exchange: stars
    else if (l1 === "5") {
      const ex = EXCHANGES[l2.toUpperCase()];
      const stars = parseInt(l3);
      if (!ex || !stars || stars < 1 || stars > 5) {
        response = `END Invalid rating.`;
      } else {
        const ratee = phone === ex.ownerPhone ? ex.borrowerPhone : ex.ownerPhone;
        const rateeArtisan = findArtisan(ratee);
        if (rateeArtisan) {
          rateeArtisan.ratings.push(stars);
        }
        response = `END Thank you. You rated this exchange ${stars} star(s).`;
      }
    }

    // Emergency: description -> radius
    else if (l1 === "6") {
      session.emDescription = l2;
      response = `CON Select broadcast radius:\n1. 1 km\n2. 2 km\n3. 5 km`;
    } else {
      response = `END Invalid flow`;
    }

  // ── LEVEL 4 ──
  } else if (level === 4) {
    const [l1, l2, l3, l4] = parts;

    // Registration: save
    if (l1 === "1") {
      const id = `ART-${String(nextArtisanId++).padStart(3, "0")}`;
      ARTISANS[phone] = {
        id,
        phone,
        name: session.regName,
        trade: session.regTrade,
        location: l4,
        lat: DEFAULT_COORDS.lat + (Math.random() - 0.5) * 0.05,
        lng: DEFAULT_COORDS.lng + (Math.random() - 0.5) * 0.05,
        experience: 0,
        certifications: "",
        approved: false,
        ratings: [],
      };
      response = `END Registration submitted, ${session.regName}!\nID: ${id}\nPending admin approval.`;
      clearSession(phone);
    }

    // Search: select result -> days
    else if (l1 === "2") {
      const idx = parseInt(l4) - 1;
      const results = session.lastSearchResults;
      if (l4 === "0" || !results || !results[idx]) {
        response = `END Search cancelled.`;
        clearSession(phone);
      } else {
        session.requestTool = results[idx].tool;
        response = `CON Enter number of days needed:`;
      }
    }

    // List new tool: condition -> price
    else if (l1 === "3" && l2 === "1") {
      const conditionMap = { 1: "new", 2: "good", 3: "worn" };
      const condition = conditionMap[l4];
      if (!condition) {
        response = `END Invalid condition.`;
      } else {
        session.newTool.condition = condition;
        response = `CON Enter daily rental price (KES):`;
      }
    }

    // Accept/decline request
    else if (l1 === "4" && l2 === "1") {
      const ex = EXCHANGES[session.respondExId];
      if (!ex) {
        response = `END Request no longer available.`;
      } else if (l4 === "1") {
        ex.status = "accepted";
        TOOLS[ex.toolId].available = false;
        response = `END You accepted the request for ${ex.toolName}.`;
      } else if (l4 === "2") {
        ex.status = "declined";
        TOOLS[ex.toolId].available = true;
        response = `END You declined the request for ${ex.toolName}.`;
      } else {
        response = `END Invalid option.`;
      }
    }

    // Emergency: broadcast
    else if (l1 === "6") {
      const radiusMap = { 1: 1, 2: 2, 3: 5 };
      const radius = radiusMap[l4] || 1;
      const emergency = {
        id: `EMG-${EMERGENCIES.length + 1}`,
        requester: artisan,
        tool: session.emTool,
        description: session.emDescription,
        radius,
        createdAt: Date.now(),
        expiresAt: Date.now() + 2 * 60 * 60 * 1000,
      };
      EMERGENCIES.push(emergency);

      const notified = Object.values(ARTISANS).filter(
        (a) =>
          a.phone !== phone &&
          distanceKm(artisan.lat, artisan.lng, a.lat, a.lng) <= radius
      );

      response = `END Emergency broadcast sent for "${session.emTool}" to ${notified.length} nearby artisan(s) within ${radius}km. Expires in 2 hours.`;
      clearSession(phone);
    } else {
      response = `END Invalid flow`;
    }

  // ── LEVEL 5 ──
  } else if (level === 5) {
    const [l1, l2, l3, l4, l5] = parts;

    // Search: days -> create exchange
    if (l1 === "2") {
      const days = parseInt(l5);
      const tool = session.requestTool;
      if (!tool) {
        response = `END Session expired. Please search again.`;
        clearSession(phone);
      } else if (!days || days < 1) {
        response = `END Days must be a positive number.`;
      } else {
        const exId = `EX-${nextExchangeId++}`;
        EXCHANGES[exId] = {
          id: exId,
          toolId: tool.id,
          toolName: tool.name,
          ownerPhone: tool.ownerPhone,
          borrowerPhone: phone,
          borrowerName: artisan ? artisan.name : phone,
          days,
          status: "requested",
          createdAt: Date.now(),
        };
        response = `END Request sent! ${tool.name} for ${days} day(s).\nExchange ID: ${exId}\nAwaiting owner approval.`;
        clearSession(phone);
      }
    }

    // List new tool: price -> deposit
    else if (l1 === "3" && l2 === "1") {
      const price = parseInt(l5);
      if (!price || price < 0) {
        response = `END Invalid price.`;
      } else {
        session.newTool.price = price;
        response = `CON Enter refundable deposit (KES), or 0 for none:`;
      }
    } else {
      response = `END Invalid flow`;
    }

  // ── LEVEL 6 ──
  } else if (level === 6) {
    const [, , , , , l6] = parts;

    // List new tool: deposit -> save
    if (parts[0] === "3" && parts[1] === "1") {
      const deposit = parseInt(l6) || 0;
      const id = nextToolId++;
      TOOLS[id] = {
        id,
        ownerPhone: phone,
        name: session.newTool.name,
        description: "",
        condition: session.newTool.condition,
        price: session.newTool.price,
        deposit,
        available: true,
        history: [],
      };
      response = `END Tool "${session.newTool.name}" listed successfully at KES ${session.newTool.price}/day.`;
      clearSession(phone);
    } else {
      response = `END Invalid flow`;
    }

  // ── fallback ──
  } else {
    response = `END Session expired`;
    clearSession(phone);
  }

  res.setHeader("Content-Type", "text/plain");
  res.send(response);
});

// ─── health ────────────────────────────────────────
app.get("/", (req, res) => {
  res.send("JuaKali Link USSD running ");
});

// ─── start ─────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`JuaKali Link USSD running on port ${PORT}`);
});
