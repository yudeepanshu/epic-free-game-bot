// server.js
import express from "express";
import axios from "axios";
import cron from "node-cron";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const cronInterval = process.env.CRON_INTERVAL || "30 19 * * *"; // default: every day at 1:00 AM IST
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK; // set in .env
const CACHE_FILE = "sentGames.json";

// -------------------- Helpers --------------------

// Load cache
function loadCache() {
  if (!fs.existsSync(CACHE_FILE)) return new Set();
  const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  return new Set(data);
}

// Save cache
function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify([...cache], null, 2));
}

// Format date nicely
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleString("en-US", { timeZone: "UTC" });
}

// Send notification to Discord
async function sendToDiscord(game) {
  try {
    await axios.post(DISCORD_WEBHOOK, {
      username: "Epic Free Games",
      embeds: [
        {
          title: `🎮 Free Game: ${game.title}`,
          url: game.url,
          description: game.description || "Free this week on Epic Games!",
          thumbnail: { url: game.image },
          fields: [
            {
              name: "Free From",
              value: formatDate(game.startDate),
              inline: true,
            },
            {
              name: "Until",
              value: formatDate(game.endDate),
              inline: true,
            },
          ],
          color: 3447003,
        },
      ],
    });
    console.log(`✅ Sent ${game.title} to Discord`);
  } catch (err) {
    console.error("❌ Error sending to Discord:", err.message);
  }
}

// -------------------- Main Logic --------------------

async function fetchEpicFreeGames() {
  try {
    const { data } = await axios.get(
      "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US"
    );

    const cache = loadCache();

    const games =
      data.data.Catalog.searchStore.elements
        .filter((g) => g.promotions && g.promotions.promotionalOffers.length > 0)
        .map((g) => {
          const offer = g.promotions.promotionalOffers[0].promotionalOffers[0];
          return {
            id: g.id, // unique Epic id
            title: g.title,
            url: `https://store.epicgames.com/en-US/p/${g.productSlug}`,
            description: g.description,
            image: g.keyImages?.[0]?.url,
            startDate: offer.startDate,
            endDate: offer.endDate,
          };
        });

    let newGames = [];

    for (const game of games) {
      if (!cache.has(game.id)) {
        await sendToDiscord(game);
        cache.add(game.id);
        newGames.push(game);
      } else {
        console.log(`⚠️ Skipping ${game.title}, already notified`);
      }
    }

    saveCache(cache);
    return newGames;
  } catch (err) {
    console.error("❌ Error fetching games:", err.message);
    return [];
  }
}

// -------------------- Scheduler --------------------

cron.schedule(cronInterval, () => {
  console.log("⏰ Checking Epic Free Games...");
  fetchEpicFreeGames();
});

// -------------------- Express Server --------------------

// Health check
app.get("/", (req, res) => res.send("✅ Epic Free Games Bot is running"));

// Manual trigger
app.get("/check", async (req, res) => {
  console.log("🔍 Manual check triggered via /check");
  const newGames = await fetchEpicFreeGames();
  if (newGames.length > 0) {
    res.json({ success: true, message: "New games found!", games: newGames });
  } else {
    res.json({ success: true, message: "No new games right now." });
  }
});

app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
