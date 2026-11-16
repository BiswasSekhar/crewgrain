import { cn } from "@/lib/utils";
import { View, type TextProps, type ViewProps } from "react-native";
import { Text } from "../../src/ui/Typography";

function Table({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn(
        "w-full overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
      {...props}
    />
  );
}

function TableHeader({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn("flex-row items-center bg-muted", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn(
        "min-h-14 flex-row items-center border-t border-border px-3",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: TextProps) {
  return (
    <Text
      className={cn(
        "px-3 py-3 text-xs font-semibold text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: ViewProps) {
  return (
    <View className={cn("justify-center px-3 py-3", className)} {...props} />
  );
}

export { Table, TableHeader, TableRow, TableHead, TableCell };
