import Image from "next/image";
import { cn } from "@/lib/utils/cn";

interface LogoProps {
  className?: string;
  /** default width in px (height scales with aspect ratio) */
  size?: number;
  priority?: boolean;
}

/**
 * Official UniByte logo. Always rendered with the source image so the brand
 * mark and its exact purple are never recreated or distorted.
 */
export function Logo({ className, size = 96, priority = false }: LogoProps) {
  return (
    <Image
      src="/unibyte-logo.png"
      alt="UniByte"
      width={size}
      height={size}
      priority={priority}
      className={cn("object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}
