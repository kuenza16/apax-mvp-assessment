import "dotenv/config";
import app from "./app";
import connectDatabase from "./config/database";
import { getJWTConfig } from "./config/auth";

async function startServer() {
  getJWTConfig();
  const port = Number(process.env.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  await connectDatabase();
  const server = app.listen(port);
  server.once("listening", () => console.log("Server listening on port " + port));
  server.on("error", () => {
    console.error("API server failed to listen; check PORT availability");
    process.exit(1);
  });
}

startServer().catch((error: Error) => {
  console.error("API startup failed: " + error.message);
  process.exit(1);
});
