import en from "./en.json";
// Metro packages these factories offline, but evaluates only a chosen language.
const catalogs: Record<string, () => Record<string, string>> = {
  as: () => require("./as.json"),
  bn: () => require("./bn.json"),
  brx: () => require("./brx.json"),
  doi: () => require("./doi.json"),
  gom: () => require("./gom.json"),
  gu: () => require("./gu.json"),
  hi: () => require("./hi.json"),
  kn: () => require("./kn.json"),
  ks: () => require("./ks.json"),
  mai: () => require("./mai.json"),
  ml: () => require("./ml.json"),
  "mni-Mtei": () => require("./mni-Mtei.json"),
  mr: () => require("./mr.json"),
  ne: () => require("./ne.json"),
  or: () => require("./or.json"),
  pa: () => require("./pa.json"),
  sa: () => require("./sa.json"),
  sat: () => require("./sat.json"),
  sd: () => require("./sd.json"),
  ta: () => require("./ta.json"),
  te: () => require("./te.json"),
  ur: () => require("./ur.json"),
};
export const readCatalog = (code: string) =>
  code === "en" ? en : catalogs[code]?.();
export default { en: { translation: en } };
