import { resolve } from "node:path";
import { CatalogueStore } from "./catalogue.mjs";
import { IntegrationError } from "./provider.mjs";

const store = new CatalogueStore(resolve(process.env.VEZLIO_DATA_DIR || "./private-data"), process.env);
try {
  const receipt = await store.sync();
  // Receipt contains counts and provenance only, never costs or credentials.
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    authenticated: false,
    receivedCount: null,
    importedThisAttempt: 0,
    sourceTimestamp: null,
    code: error instanceof IntegrationError ? error.code : "IMPORT_FAILED",
    message: error instanceof IntegrationError ? error.message : "Import failed."
  }, null, 2));
  process.exitCode = 1;
}
