// dev-proxy.js
// Run alongside Vite during local development: node dev-proxy.js
// This adds your Notion token server-side so the browser never sees it.
// In production, Vercel's api/notion.js handles this instead.

import express from "express";

const app  = express();
const PORT = 3001;
const TOKEN = process.env.NOTION_TOKEN; // set in your shell: export NOTION_TOKEN=ntn_...

app.use(express.json());

app.all("/api/notion", async (req, res) => {
  const path = req.query.path;
  if (!path) return res.status(400).json({ error: "Missing path" });

  if (!TOKEN) {
    return res.status(500).json({ error: "NOTION_TOKEN not set. Run: export NOTION_TOKEN=your_token" });
  }

  try {
    const notionRes = await fetch(`https://api.notion.com/v1${path}`, {
      method: req.method,
      headers: {
        "Authorization":  `Bearer ${TOKEN}`,
        "Notion-Version": "2022-06-28",
        "Content-Type":   "application/json",
      },
      body: ["POST","PATCH"].includes(req.method) ? JSON.stringify(req.body) : undefined,
    });
    const data = await notionRes.json();
    res.status(notionRes.status).json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`✓ Notion dev proxy running on http://localhost:${PORT}`);
  console.log(`  Token: ${TOKEN ? TOKEN.slice(0,12)+"…" : "NOT SET — export NOTION_TOKEN first"}`);
});
