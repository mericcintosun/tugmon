import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tugmon Arena",
    short_name: "Tugmon",
    description: "On-chain tug of war on Monad testnet.",
    start_url: "/",
    display: "standalone",
    background_color: "#0d0d18",
    theme_color: "#0d0d18",
    icons: [
      {
        src: "/icons/icon.svg",
        type: "image/svg+xml",
        sizes: "512x512",
        purpose: "any",
      },
    ],
  };
}
