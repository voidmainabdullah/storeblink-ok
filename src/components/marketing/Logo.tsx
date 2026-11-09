import { Link } from "react-router-dom";
import logo from "@/assets/storeblink-logo.png";
import invertedLogo from "@/assets/storeblink-logo-inverted.png";
import { cn } from "@/lib/utils";

type LogoSize = "sm" | "md" | "lg";

const logoSizeClasses: Record<LogoSize, string> = {
  sm: "w-[6.75rem]",
  md: "w-[8.75rem]",
  lg: "w-[11rem]",
};

type BrandLogoProps = Readonly<{
  inverted?: boolean;
  alt?: string;
  className?: string;
}>;

export const BrandLogo = ({ inverted = false, alt = "StoreBlink", className }: BrandLogoProps) => (
  <img
    src={inverted ? invertedLogo : logo}
    alt={alt}
    width={1882}
    height={395}
    className={cn("block h-auto max-w-full select-none", className)}
    draggable={false}
    decoding="async"
  />
);

type LogoProps = Readonly<{
  inverted?: boolean;
  to?: string;
  ariaLabel?: string;
  size?: LogoSize;
  className?: string;
}>;

export const Logo = ({
  inverted = false,
  to = "/",
  ariaLabel,
  size = "md",
  className,
}: LogoProps) => (
  <Link
    to={to}
    aria-label={ariaLabel}
    className={cn(
      "inline-flex shrink-0 items-center transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      logoSizeClasses[size],
      className,
    )}
  >
    <BrandLogo inverted={inverted} alt={ariaLabel ? "" : "StoreBlink"} className="w-full" />
  </Link>
);
