// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { fileURLToPath } from "node:url";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// Production is a Node server (Nitro node-server). Cloudflare is disabled for this build.
export default defineConfig({
  cloudflare: false,
  tanstackStart: {
    server: { entry: "server" },
  },
  plugins: [nitro({ preset: "node-server" })],
  vite: {
    resolve: {
      // SheetJS's ESM build has no default export. Node production bundles the CJS entry.
      alias: {
        xlsx: fileURLToPath(new URL("./node_modules/xlsx/xlsx.js", import.meta.url)),
      },
    },
  },
});
