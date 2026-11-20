import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// BASE_PATH is set by the GitHub Pages workflow (the site lives under /<repo>/).
export default defineConfig({
  base: process.env.BASE_PATH || "/",
  plugins: [react()],
  build: {
    // auth-redirect.html is where Microsoft's sign-in window returns to
    rollupOptions: { input: { main: path.resolve(__dirname, "index.html"), authRedirect: path.resolve(__dirname, "auth-redirect.html") } },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
