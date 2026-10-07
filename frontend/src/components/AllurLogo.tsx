/** Render the supplied wordmark without altering its geometry or source pixels. */
export function AllurLogo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="529 468 3216 1113"
      className={`allur-wordmark ${className}`}
      role="img"
      aria-label="Allur"
    >
      <image href={`${import.meta.env.BASE_URL}assets/allur-logo.png`} width="4256" height="2091" />
    </svg>
  );
}
