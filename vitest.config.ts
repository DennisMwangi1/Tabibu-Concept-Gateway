import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      // OCL_BASE_URL defaults to the public instance; override here for test isolation.
      OCL_BASE_URL: "https://api.openconceptlab.org",
      // OCL_API_TOKEN is optional — omit to test the token-less public-read path.
      OPS_API_KEY: "test-ops-key",
    },
  },
});
