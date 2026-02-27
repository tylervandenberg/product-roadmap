// api/notion.js
const NOTION_VERSION = "2022-06-28";
const NOTION_BASE    = "https://api.notion.com/v1";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  const { path } = req.query;
  if (!path) {
    res.status(400).json({ error: "Missing path query param" });
    return;
  }

  const token = process.env.NOTION_TOKEN;
  if (!token) {
    res.status(500).json({ error: "NOTION_TOKEN env variable not set" });
    return;
  }

  try {
    const notionRes = await fetch(`${NOTION_BASE}${path}`, {
      method:  req.method,
      headers: {
        "Authorization":  `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type":   "application/json",
      },
      body: ["POST", "PATCH"].includes(req.method)
        ? JSON.stringify(req.body)
        : undefined,
    });

    const data = await notionRes.json();
    res.status(notionRes.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
