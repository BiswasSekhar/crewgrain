import { Platform } from "react-native";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { csv } from "./export-csv";
export { csv } from "./export-csv";
export async function exportCsv(name: string, rows: (string | number)[][]) {
  const content = csv(rows);
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name + ".csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const file = new File(Paths.cache, name + ".csv");
  file.write(content);
  if (await Sharing.isAvailableAsync())
    await Sharing.shareAsync(file.uri, { mimeType: "text/csv" });
  else throw new Error("File sharing is unavailable on this device.");
}
