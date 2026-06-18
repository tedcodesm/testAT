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

// ─── Products ──────────────────────────────────────
const PRODUCTS = [
  { id: 1, name: "Home Composter (20L)", price: 1500 },
  { id: 2, name: "Compost Bags (10 pack)", price: 350 },
  { id: 3, name: "Ready Compost (5kg)", price: 800 },
  { id: 4, name: "Worm Bin Kit", price: 2200 },
  { id: 5, name: "Collection Service", price: 500 },
];

const productList = () =>
  PRODUCTS.map((p, i) => `${i + 1}. ${p.name} — KES ${p.price}`).join("\n");

// ─── Tips ──────────────────────────────────────────
const TIPS = [
  "Chop waste small to speed composting.",
  "Balance greens & browns (1:3).",
  "Keep compost moist, not wet.",
  "Turn pile weekly for oxygen.",
  "Avoid meat & dairy.",
];

const currentTip = () => TIPS[new Date().getHours() % TIPS.length];

// ─── Orders ────────────────────────────────────────
const ORDERS = {
  "ORD-001": { status: "Out for delivery", eta: "Today 3–5 PM" },
  "ORD-002": { status: "Processing", eta: "Tomorrow morning" },
  "ORD-003": { status: "Delivered", eta: "Completed" },
};

// ─── Eco points ────────────────────────────────────
const ecoPoints = (phone) =>
  ((phone
    .replace(/\D/g, "")
    .split("")
    .reduce((a, d) => a + +d, 0) * 17) %
    900) +
  100;

// ─── Menu ──────────────────────────────────────────
const MAIN_MENU = `CON Welcome to Captain Compost 
1. Shop Products
2. My Eco-Points
3. Track Order
4. Compost Tips
5. Contact Support`;

// ─── USSD handler ──────────────────────────────────
app.post("/ussd", (req, res) => {
  let { phoneNumber, text } = req.body;

  text = text || ""; // IMPORTANT FIX
  const phone = phoneNumber || "unknown";
  const session = getSession(phone);

  const parts = text.split("*");
  const level = parts.length;

  let response = "";

  // ── LEVEL 0 ──
  if (text === "") {
    clearSession(phone);
    response = MAIN_MENU;

  // ── LEVEL 1 ──
  } else if (level === 1) {
    switch (text) {
      case "1":
        response = `CON Select a product:\n${productList()}`;
        break;

      case "2":
        response = `CON Your Eco-Points: ${ecoPoints(phone)} pts 
1. Redeem 50 pts
2. Redeem 200 pts
3. Back`;
        break;

      case "3":
        response = `CON Enter order number (e.g. ORD-001):`;
        break;

      case "4":
        response = `END Tip:\n${currentTip()}`;
        clearSession(phone);
        break;

      case "5":
        response = `CON Support:
1. Call
2. WhatsApp
3. Callback
4. Main menu`;
        break;

      default:
        response = `CON Invalid option\n${MAIN_MENU}`;
    }

  // ── LEVEL 2 ──
  } else if (level === 2) {
    const [l1, l2] = parts;

    // Track order flow
    if (l1 === "3") {
      const order = ORDERS[l2.toUpperCase()];
      response = order
        ? `END Status: ${order.status}\nETA: ${order.eta}`
        : `CON Order not found\n1. Retry\n2. Exit`;
    }

    // Support submenu
    else if (l1 === "5") {
      if (l2 === "1") response = `END Call us: 0800 720 500`;
      else if (l2 === "2") response = `END WhatsApp: +254 700 555 000`;
      else if (l2 === "3") response = `END Callback requested for ${phone}`;
      else if (l2 === "4") response = MAIN_MENU;
      else response = `END Invalid option`;
    }

    // Eco points submenu
    else if (l1 === "2") {
      const pts = ecoPoints(phone);

      if (l2 === "1") {
        response =
          pts >= 50
            ? `CON Redeem 50 pts for KES 50 discount?\n1. Confirm\n2. Cancel`
            : `END Need 50 pts. You have ${pts}`;
      } else if (l2 === "2") {
        response =
          pts >= 200
            ? `CON Redeem 200 pts for free compost bag?\n1. Confirm\n2. Cancel`
            : `END Need 200 pts. You have ${pts}`;
      } else {
        response = `END Invalid option`;
      }
    } else {
      response = `END Session ended`;
    }

  // ── LEVEL 3 ──
  } else if (level === 3) {
    const [l1, l2, l3] = parts;

    // Eco confirmation
    if (l1 === "2" && l3 === "1") {
      response = `END Reward redeemed successfully 🎉`;
    } else if (l1 === "2" && l3 === "2") {
      response = `END Redemption cancelled`;
    }

    // Product selection (buy flow simplified)
    else if (l1 === "1") {
      const product = PRODUCTS[parseInt(l2) - 1];

      if (l3 === "1") {
        response = `END M-Pesa STK sent for ${product.name} (KES ${product.price}) 📱`;
      } else if (l3 === "2") {
        session.cart ??= [];
        session.cart.push(product);
        response = `CON Added to cart \n${productList()}\n6. Checkout`;
      } else {
        response = `CON Back to products:\n${productList()}`;
      }
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
  res.send("Captain Compost USSD running ");
});

// ─── start ─────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`USSD running on port ${PORT}`);
});