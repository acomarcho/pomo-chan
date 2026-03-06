import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 border-2 border-border bg-card px-3 py-2 text-sm font-medium text-foreground outline-none transition-[box-shadow,background-color] duration-100 placeholder:text-muted-foreground focus-visible:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:shadow-[4px_4px_0_0_var(--shadow-color)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted-foreground file:inline-flex file:border-0 file:bg-transparent file:text-foreground file:text-sm file:font-medium",
        className
      )}
      {...props}
    />
  );
}

export { Input };
