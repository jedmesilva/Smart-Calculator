export type Variant = "control" | "treatment";

export function getVariant(): Variant {
  const match = document.cookie.match(/(?:^|;\s*)ab-variant=([^;]+)/);
  const value = match?.[1];
  if (value === "control" || value === "treatment") return value;
  return Math.random() < 0.5 ? "control" : "treatment";
}
