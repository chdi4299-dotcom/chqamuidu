import { createAppServer } from "./http.mjs";

const { server } = createAppServer();
const port = Number(process.env.PORT || 8000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT.");
server.listen(port, process.env.HOST || "127.0.0.1", () => {
  console.log(`VEZLIO listening on port ${port}. Catalogue imports are manual; no provider orders are enabled.`);
});
