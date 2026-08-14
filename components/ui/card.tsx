import { cn } from "@/lib/utils";

/**
 * Kartica iz prototipa (`.card`): 1px ivica, radius 14px, bez teških senki.
 * `hover` dodaje podizanje za 1px i ivicu u indigo tonu — koristi se samo tamo
 * gde je cela kartica klikabilna.
 */
export function Card({
  className,
  hover = false,
  ...props
}: React.ComponentProps<"div"> & { hover?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-card border border-border bg-card px-5 py-[18px] shadow-card",
        hover &&
          "transition duration-150 hover:-translate-y-px hover:border-accent-ring hover:shadow-pop",
        className,
      )}
      {...props}
    />
  );
}
