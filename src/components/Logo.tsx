export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="relative h-8 w-8 rounded-xl bg-[var(--gradient-primary)] grid place-items-center shadow-[var(--shadow-glow)]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[oklch(0.16_0.012_240)]">
          <path d="M12 2L4 7l8 5 8-5-8-5z" />
          <path d="M4 12l8 5 8-5" />
          <path d="M4 17l8 5 8-5" />
        </svg>
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight">BGD Recruit AI</div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">AI Recruitment Platform</div>
      </div>
    </div>
  );
}
