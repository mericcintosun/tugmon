"use client";

import { useEffect } from "react";

/** Registers public/sw.js in production for offline /play/offline cache hints. */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* non-fatal */
    });
  }, []);
  return null;
}
