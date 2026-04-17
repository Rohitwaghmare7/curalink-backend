const express = require("express");
const mongoose = require("mongoose");
const { getPineconeClient } = require("../config/pinecone");
const router = express.Router();

router.get("/", async (req, res) => {
  const mongoStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";

  let pineconeStatus = "disconnected";
  try {
    const client = getPineconeClient();
    await client.listIndexes();
    pineconeStatus = "connected";
  } catch {
    pineconeStatus = "disconnected";
  }

  const uptimeSeconds = process.uptime();
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);

  res.json({
    success: true,
    data: {
      status: "ok",
      mongodb: mongoStatus,
      pinecone: pineconeStatus,
      uptime: `${hours}h ${minutes}m`,
      timestamp: new Date().toISOString(),
    },
  });
});

module.exports = router;
