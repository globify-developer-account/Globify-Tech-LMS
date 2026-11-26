import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    coverage: { reporter: ["text", "html"] },
    env: {
      NODE_ENV: "test",
      AUTH_SECRET: "test-secret-test-secret-test-secret",
      DATABASE_URL: "mysql://test:test@localhost:3306/test",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    },
  },
});
