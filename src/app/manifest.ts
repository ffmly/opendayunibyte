import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "UniByte Open Day",
    short_name: "UniByte",
    description:
      "UniByte Open Day — scan, play and earn XP across the university event.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#550055",
    dir: "rtl",
    lang: "ar",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
