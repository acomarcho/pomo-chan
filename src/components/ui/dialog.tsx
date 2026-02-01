import * as React from "react";
import * as DialogPrimitive from "@base-ui/react/dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Backdrop>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Backdrop>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Backdrop
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:animate-in data-[open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Backdrop.displayName;

type DialogContentProps = React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Popup
> & {
  showCloseButton?: boolean;
};

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Popup>,
  DialogContentProps
>(({ className, children, showCloseButton = true, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Viewport className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <DialogPrimitive.Popup
        ref={ref}
        className={cn(
          "relative grid w-[min(92vw,26rem)] gap-4 rounded-2xl border border-border bg-background p-6 text-foreground shadow-lg outline-none data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95 data-[open]:animate-in data-[open]:fade-in-0 data-[open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground transition hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
            aria-label="Close"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Viewport>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Popup.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col gap-1 text-left", className)}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
