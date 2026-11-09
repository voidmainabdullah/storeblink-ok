
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { cloudflare } from "@cloudflare/vite-plugin";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8082,
    strictPort: true,
    allowedHosts: ["localtest.me"],
    open: "/dashboard/store",
    hmr: {
      overlay: false,
    },
  },

  plugins: [
    react(),
    cloudflare(),
    ...(mode === "development" ? [componentTagger()] : []),
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },

    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },

  build: {
    manifest: true,

    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/react-router") ||
            id.includes("/scheduler/")
          ) {
            return "vendor-react";
          }

          // Leave Supabase to Rollup's route-aware chunking.
          // Forcing it into a global manual chunk can make
          // dashboard-only auth eager on /store/*.
          if (
            id.includes("/react-moveable/") ||
            id.includes("/react-selecto/") ||
            id.includes("/moveable/") ||
            id.includes("/selecto/") ||
            id.includes("/@daybrush/") ||
            id.includes("/gesto/")
          ) {
            return "vendor-editor-interaction";
          }

          if (id.includes("/@dnd-kit/")) {
            return "vendor-editor-dnd";
          }

          if (id.includes("/react-resizable-panels/")) {
            return "vendor-editor-panels";
          }

          if (id.includes("/@radix-ui/")) {
            return "vendor-radix";
          }

          if (id.includes("/lucide-react/")) {
            return "vendor-icons";
          }

          if (id.includes("/@tanstack/")) {
            return "vendor-query";
          }

          return undefined;
        },
      },
    },
  },
}));
