import { firebaseWebConfig } from "./firebase-config";

const FIREBASE_FUNCTION_REGION = "us-central1";
const configuredBaseUrl = (process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL ?? "").trim().replace(/\/+$/, "");

/**
 * Build the HTTPS endpoint for a Firebase Function.
 *
 * Production falls back to the deployed Firebase project/region URL. Local and preview builds may
 * override the base with NEXT_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL without changing application code.
 */
export function firebaseFunctionUrl(functionName: string): string {
  const config = firebaseWebConfig();
  if (!config) throw new Error("Firebase web app configuration is missing.");

  const baseUrl = configuredBaseUrl || `https://${FIREBASE_FUNCTION_REGION}-${config.projectId}.cloudfunctions.net`;
  return `${baseUrl}/${encodeURIComponent(functionName)}`;
}
