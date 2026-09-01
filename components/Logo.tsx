interface LogoProps {
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: "text-base",
  md: "text-xl",
  lg: "text-3xl",
};

export function Logo({ size = "md" }: LogoProps) {
  return (
    <span
      className={`font-bold italic uppercase tracking-tight ${sizes[size]}`}
      style={{ fontFamily: "var(--font-poppins)" }}
    >
      <span style={{ color: "var(--text-primary)" }}>BETTER</span>
      <span style={{ color: "var(--accent)" }}>STEPS.</span>
    </span>
  );
}
