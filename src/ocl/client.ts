import axios, { type AxiosInstance } from "axios";
import { env } from "../config/env.js";

// Public OCL collections can be read without a token.
// Only send Authorization when OCL_API_TOKEN is explicitly set (authoring/curation writes
// or private collections).
const headers: Record<string, string> = { Accept: "application/json" };
if (env.OCL_API_TOKEN) {
  headers.Authorization = `Token ${env.OCL_API_TOKEN}`;
}

export const oclClient: AxiosInstance = axios.create({
  baseURL: env.OCL_BASE_URL,
  headers,
  validateStatus: (status) => status < 500,
});
