import { Firestore } from "@google-cloud/firestore";

const PROJECT_ID = process.env.GCP_PROJECT_ID || "web-analytics-ai-platform";

declare global {
  // eslint-disable-next-line no-var
  var __firestoreClient: Firestore | undefined;
}

export function firestore(): Firestore {
  if (!global.__firestoreClient) {
    const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    global.__firestoreClient = credentialsJson
      ? new Firestore({
          projectId: PROJECT_ID,
          credentials: JSON.parse(
            Buffer.from(credentialsJson, "base64").toString("utf-8")
          ) as object,
        })
      : new Firestore({ projectId: PROJECT_ID });
  }
  return global.__firestoreClient;
}
