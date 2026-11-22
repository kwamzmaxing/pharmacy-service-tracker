import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// BASE_PATH is set by the GitHub Pages workflow (the site lives under /<repo>/).
export default defineConfig({
  base: process.env.BASE_PATH || "/",
  plugins: [
    react(),
    // Installable app with an offline copy of the site; the tracker's data already works offline
    // through Firestore's own cache, so the service worker never touches Firebase or Google requests.
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png", "reminders-sw.js"],
      manifest: {
        name: "KASA.Rx · Pharmacy service tracker",
        short_name: "KASA.Rx",
        description: "Log locum shifts, services and mileage, send invoices and track tax.",
        theme_color: "#171721",
        background_color: "#171721",
        display: "standalone",
        start_url: ".",
        scope: ".",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Reminder notifications (see src/lib/reminders.ts)
        importScripts: ["reminders-sw.js"],
        // Everything needed to open and use the tracker offline (the big export library loads when used)
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        globIgnores: ["**/exceljs*.js", "**/html2canvas*.js"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/privacy\.html$/, /changelog\.html$/],
        runtimeCaching: [
          { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//, handler: "StaleWhileRevalidate", options: { cacheName: "fonts", expiration: { maxEntries: 20 } } },
          { urlPattern: /^https:\/\/tile\.openstreetmap\.org\//, handler: "CacheFirst", options: { cacheName: "map-tiles", expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 3600 } } },
          { urlPattern: /\/assets\/(exceljs|html2canvas)[^/]*\.js$/, handler: "CacheFirst", options: { cacheName: "export-code", expiration: { maxEntries: 10 } } },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
