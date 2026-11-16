import type { Employee } from "../domain/types";

export const staffIdentifier = (value: string) => value.trim().toUpperCase();
export function phoneDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91")
    ? digits.slice(2)
    : digits;
}
export function findStaff(employees: Employee[], value: string) {
  const identifier = staffIdentifier(value);
  const digits = phoneDigits(identifier);
  const matches = employees.filter(
    (employee) =>
      employee.active &&
      employee.role !== "admin" &&
      (employee.employeeId.toUpperCase() === identifier ||
        (/^[+\d\s().-]+$/.test(identifier) &&
          digits.length >= 7 &&
          !!employee.phone &&
          phoneDigits(employee.phone) === digits)),
  );
  if (matches.length !== 1) throw new Error("Check your ID or phone number.");
  return matches[0];
}
