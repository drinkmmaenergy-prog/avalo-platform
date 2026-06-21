import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

import { onRequest } from "firebase-functions/v2/https";

export const ciHealth = onRequest((req, res) => {
  res.status(200).json({
    ok: true,
    service: "platform-functions",
    kind: "ciHealth",
    ts: Date.now(),
  });
});

























