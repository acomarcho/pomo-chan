import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";

import { cn } from "@/lib/utils";

function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return <RadioGroupPrimitive data-slot="radio-group" className={cn("grid w-full gap-3", className)} {...props} />;
}

function RadioGroupItem({ className, ...props }: RadioPrimitive.Root.Props) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        "peer group/radio-group-item relative flex size-5 shrink-0 cursor-pointer border-2 border-border bg-card outline-none transition-[transform,box-shadow,background-color] duration-100 data-[checked]:bg-primary focus-visible:ring-[3px] focus-visible:ring-ring/25 data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      style={{ boxShadow: "var(--shadow-elevated)" }}
      {...props}
    >
      <RadioPrimitive.Indicator data-slot="radio-group-indicator" className="flex size-full items-center justify-center">
        <span className="block size-2.5 bg-foreground" />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Root>
  );
}

export { RadioGroup, RadioGroupItem };
