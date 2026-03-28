import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tugmon Arena",
    short_name: "Tugmon",
    description: "Real-time on-chain tug-of-war on Monad — play from your phone, show on the big screen.",
    start_url: "/",
    display: "standalone",
    background_color: "#040408",
    theme_color: "#040408",
    orientation: "portrait-primary",
    scope: "/",
    categories: ["games", "entertainment"],
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
