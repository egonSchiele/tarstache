import path from "path";

import { configDefaults, defineConfig } from "vitest/config";

console.log("dirname", __dirname);

const config = defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: "./vitest.globals.ts",
    include: ["./lib/**/*.test.{js,ts,tsx}", "./tests/**/*.test.{js,ts,tsx}"],
    exclude: [...configDefaults.exclude, "./build/**/*", "./dist/**/*"],
    coverage: {
      exclude: ["index.ts"],
    },
  },
  resolve: {
    alias: [{ find: "@/lib", replacement: path.resolve(__dirname, "./lib") }],
  },
});

export default config;
