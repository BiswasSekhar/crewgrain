import type { DailyCount, OutboxRow, Snapshot } from "./types";
export type CountReceipt = {
  id: string;
  count?: DailyCount;
  error?: string;
  code?: string;
};

/** Reconcile an entire acknowledgement batch before rendering quantities.
 * A duplicate retry may return a newer total including other taps in the batch.
 */
export function reconcileCountBatch(
  snapshot: Snapshot,
  batch: OutboxRow[],
  receipts: CountReceipt[],
) {
  const rows = new Map(batch.map((row) => [row.id, row]));
  const counts = new Map(
    (snapshot.counts || []).map((count) => [count.id, count]),
  );
  const acknowledged = new Set<string>();
  for (const receipt of receipts) {
    const row = rows.get(receipt.id),
      count = receipt.count;
    if (
      !row ||
      receipt.error ||
      !count ||
      count.employeeId !== row.employeeId ||
      count.assignmentId !== row.assignmentId ||
      count.workDate !== row.workDate
    )
      continue;
    acknowledged.add(row.id);
    const current = counts.get(count.id);
    if (!current || current.version <= count.version)
      counts.set(count.id, count);
  }
  return { data: { ...snapshot, counts: [...counts.values()] }, acknowledged };
}
