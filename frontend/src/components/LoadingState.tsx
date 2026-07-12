export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="min-h-[40vh] flex items-center justify-center" role="status" aria-live="polite">
      <div className="text-center">
        <div className="inline-flex w-10 h-10 border-2 border-gold/30 border-t-gold rounded-full animate-spin mb-4" />
        <p className="text-sm text-white/45 font-mono tracking-wider uppercase">{label}</p>
      </div>
    </div>
  );
}

export function MetricSkeleton() {
  return (
    <div className="panel p-8">
      <div className="h-8 w-56 bg-white/5 rounded animate-pulse mb-6" />
      <div className="h-44 bg-white/5 rounded animate-pulse mb-6" />
      <div className="grid grid-cols-6 gap-2 mb-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 bg-white/5 rounded animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-5 gap-6">
        <div className="col-span-2 h-48 bg-white/5 rounded animate-pulse" />
        <div className="col-span-3 space-y-2">
          <div className="h-4 bg-white/5 rounded animate-pulse" />
          <div className="h-4 bg-white/5 rounded animate-pulse" />
          <div className="h-4 w-3/4 bg-white/5 rounded animate-pulse" />
        </div>
      </div>
    </div>
  );
}
