import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import { languageInfo } from "./languages";
import resources, { readCatalog } from "../locales/resources";
const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  keySeparator: false,
  nsSeparator: false,
  initAsync: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});
export default i18n;
export function loadLanguageCatalog(code: string) {
  if (!i18n.hasResourceBundle(code, "translation")) {
    const catalog = readCatalog(code);
    if (catalog)
      i18n.addResourceBundle(code, "translation", catalog, true, true);
  }
}
const renderedMessages = new Set<string>();
i18n.on("languageChanged", () => renderedMessages.clear());
export const tr = (key: string, values?: Record<string, unknown>): string => {
  const value = String(i18n.t(key, values ?? {}));
  if (renderedMessages.size > 2000) renderedMessages.clear();
  renderedMessages.add(value);
  return value;
};
export const currentLanguage = () =>
  languageInfo(i18n.language ?? i18n.resolvedLanguage);
export function numberLocale() {
  const locale = currentLanguage().locale;
  try {
    return Intl.NumberFormat.supportedLocalesOf([locale]).length
      ? locale
      : "en-IN";
  } catch {
    return "en-IN";
  }
}
const calendarWords = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "AM",
  "PM",
];
export function formatDate(date: Date, options?: Intl.DateTimeFormatOptions) {
  const value = date.toLocaleDateString(numberLocale(), options);
  return currentLanguage().code === "en"
    ? value
    : value.replace(
        new RegExp(`\\b(${calendarWords.join("|")})\\b`, "g"),
        (word) => tr(word),
      );
}
export function formatTime(date: Date, options?: Intl.DateTimeFormatOptions) {
  return date
    .toLocaleTimeString(numberLocale(), options)
    .replace(/\b(AM|PM)\b/g, (word) => tr(word));
}
export function formatDateTime(
  date: Date,
  options?: Intl.DateTimeFormatOptions,
) {
  const value = date.toLocaleString(numberLocale(), options);
  return currentLanguage().code === "en"
    ? value
    : value.replace(
        new RegExp(`\\b(${calendarWords.join("|")})\\b`, "g"),
        (word) => tr(word),
      );
}
export function normalizeDigits(value: string) {
  const bases = [
    0x660, 0x6f0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6, 0xc66, 0xce6, 0xd66,
    0xabf0, 0x1c50,
  ];
  return value.replace(/\p{Nd}/gu, (char) => {
    const point = char.codePointAt(0)!;
    const base = bases.find((b) => point >= b && point < b + 10);
    return base === undefined ? char : String(point - base);
  });
}
export function errorText(message: unknown): string {
  const value = String(message ?? "");
  if (!value) return "";
  if (renderedMessages.has(value)) return value;
  if (i18n.exists(value, { lng: "en" })) return tr(value);
  const entries = i18n.getResourceBundle("en", "translation") ?? {};
  for (const key of Object.keys(entries)) {
    if (!key.includes("{{")) continue;
    const names: string[] = [];
    const pattern = key
      .split(/(\{\{[^}]+\}\})/g)
      .map((part) => {
        if (part.startsWith("{{")) {
          names.push(part.slice(2, -2));
          return "(.+?)";
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("");
    const match = value.match(new RegExp("^" + pattern + "$"));
    if (match)
      return tr(
        key,
        Object.fromEntries(
          names.map((name, index) => [name, match[index + 1]]),
        ),
      );
  }
  return currentLanguage().code === "en"
    ? value
    : tr("Could not complete this action. Try again.");
}
