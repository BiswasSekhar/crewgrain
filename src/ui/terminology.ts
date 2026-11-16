import type { Role } from "../domain/types";
import { tr } from "../lib/i18n";
export function moneyLabel(role: Role) {
  return tr(
    role === "admin" ? "Labour cost" : role === "captain" ? "Line pay" : "Pay",
  );
}
