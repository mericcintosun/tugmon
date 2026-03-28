import TugOfWar from "@/components/TugOfWar";

/** Local mock session (no chain) — full-screen tug UI + canvas */
export default function OfflinePlayPage() {
  return (
    <div className="flex h-[calc(100dvh-var(--layout-nav-min-h))] min-h-0 flex-col">
      <TugOfWar />
    </div>
  );
}
