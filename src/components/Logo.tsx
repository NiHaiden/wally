export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="logo-photo1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: "#ec4899" }} />
          <stop offset="100%" style={{ stopColor: "#8b5cf6" }} />
        </linearGradient>
        <linearGradient id="logo-photo2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: "#3b82f6" }} />
          <stop offset="100%" style={{ stopColor: "#06b6d4" }} />
        </linearGradient>
      </defs>
      {/* Back polaroid */}
      <g transform="rotate(-12 60 60)">
        <rect x="30" y="15" width="60" height="72" rx="4" fill="#fafafa" />
        <rect x="35" y="20" width="50" height="50" rx="2" fill="url(#logo-photo2)" />
      </g>
      {/* Front polaroid */}
      <g transform="rotate(8 60 60)">
        <rect x="30" y="20" width="60" height="72" rx="4" fill="#fff" />
        <rect x="35" y="25" width="50" height="50" rx="2" fill="url(#logo-photo1)" />
        {/* W on the photo */}
        <path
          d="M45 45 L50 60 L55 50 L60 60 L65 45"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>
    </svg>
  );
}
