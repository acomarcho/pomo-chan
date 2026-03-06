import * as React from "react";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center whitespace-nowrap border-2 border-border text-sm font-black uppercase tracking-[0.14em] outline-none transition-[transform,box-shadow,background-color,color] duration-100 select-none focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none disabled:translate-x-0 disabled:translate-y-0 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 hover:-translate-x-px hover:-translate-y-px active:translate-x-[4px] active:translate-y-[4px]",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[4px_4px_0_0_var(--shadow-color)] hover:shadow-[6px_6px_0_0_var(--shadow-color)] active:shadow-none",
        outline:
          "bg-card text-foreground shadow-[4px_4px_0_0_var(--shadow-color)] hover:bg-secondary hover:shadow-[6px_6px_0_0_var(--shadow-color)] active:shadow-none",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[4px_4px_0_0_var(--shadow-color)] hover:bg-accent hover:shadow-[6px_6px_0_0_var(--shadow-color)] active:shadow-none",
        ghost:
          "border-transparent bg-transparent text-foreground shadow-none hover:border-border hover:bg-secondary hover:shadow-[4px_4px_0_0_var(--shadow-color)] active:shadow-none",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[4px_4px_0_0_var(--shadow-color)] hover:bg-destructive/90 hover:shadow-[6px_6px_0_0_var(--shadow-color)] active:shadow-none",
        link: "border-0 bg-transparent p-0 font-semibold normal-case tracking-normal text-foreground underline-offset-4 shadow-none hover:text-primary hover:underline"
      },
      size: {
        default: "h-10 gap-2 px-4",
        xs: "h-8 gap-1.5 px-2.5 text-[10px]",
        sm: "h-9 gap-1.5 px-3 text-[11px]",
        lg: "h-11 gap-2 px-5 text-sm",
        icon: "size-10 p-0",
        "icon-xs": "size-8 p-0",
        "icon-sm": "size-9 p-0",
        "icon-lg": "size-11 p-0"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

const Button = React.forwardRef<
  React.ElementRef<typeof ButtonPrimitive>,
  ButtonPrimitive.Props & VariantProps<typeof buttonVariants>
>(({ className, variant = "default", size = "default", ...props }, ref) => (
  <ButtonPrimitive ref={ref} data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
));
Button.displayName = "Button";

export { Button, buttonVariants };
