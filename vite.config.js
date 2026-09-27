import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "知练 · 费曼练习",
        short_name: "知练",
        description: "费曼型学习助手：知识地图、费曼对练、盲区补漏，支持离线练习。",
        theme_color: "#0c4a6e",
        background_color: "#f0f9ff",
        display: "standalone",
        orientation: "portrait-primary",
        lang: "zh-CN",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable"
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          }
        ]
      },
      workbox: {
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,webp}"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkOnly",
            method: "GET"
          },
          {
            urlPattern: ({ request }) => request.destination === "font" || request.destination === "style",
            handler: "CacheFirst",
            options: {
              cacheName: "zhifan-static-assets",
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
        ]
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: {
      "/api": process.env.API_PROXY || "http://127.0.0.1:8787"
    }
  }
});
