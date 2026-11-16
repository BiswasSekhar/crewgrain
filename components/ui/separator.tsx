import { cn } from "@/lib/utils";
import { View, type ViewProps } from "react-native";

type SeparatorProps = ViewProps & {
  orientation?: "horizontal" | "vertical";
};

function Separator({
  orientation = "horizontal",
  className,
  ...props
}: SeparatorProps) {
  return (
    <View
      role="none"
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "w-px self-stretch",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
