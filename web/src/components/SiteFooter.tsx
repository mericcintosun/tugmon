import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="mt-auto w-full rounded-t-sm border-t-2 border-dashed border-outline-variant bg-surface-container-low">
      <div className="flex w-full flex-col items-center gap-6 py-10 md:flex-row md:justify-between md:gap-8">
        <div className="font-label text-lg font-bold uppercase text-primary">
          Tugmon Atelier
        </div>
        <div className="text-center font-label text-[10px] uppercase tracking-widest text-outline sm:text-xs">
          © {new Date().getFullYear()} Tugmon. Stitched for speed.
        </div>
        <div className="flex flex-wrap justify-center gap-6 font-label text-[10px] uppercase tracking-widest sm:text-xs">
          <Link className="text-outline transition-colors hover:text-secondary" href="https://docs.monad.xyz/" target="_blank" rel="noreferrer">
            Docs
          </Link>
          <Link className="text-outline transition-colors hover:text-secondary" href="/dashboard">
            Live board
          </Link>
          <Link className="text-outline transition-colors hover:text-secondary" href="/play">
            Play
          </Link>
        </div>
      </div>
    </footer>
  );
}
