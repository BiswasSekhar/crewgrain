import * as Font from "expo-font";
import { languageInfo } from "./languages";
const assets: Record<string, Record<string, number>> = {
  devanagari: {
    Crewgrain_devanagari_400Regular: require("@expo-google-fonts/noto-sans-devanagari/400Regular/NotoSansDevanagari_400Regular.ttf"),
    Crewgrain_devanagari_600SemiBold: require("@expo-google-fonts/noto-sans-devanagari/600SemiBold/NotoSansDevanagari_600SemiBold.ttf"),
  },
  bengali: {
    Crewgrain_bengali_400Regular: require("@expo-google-fonts/noto-sans-bengali/400Regular/NotoSansBengali_400Regular.ttf"),
    Crewgrain_bengali_600SemiBold: require("@expo-google-fonts/noto-sans-bengali/600SemiBold/NotoSansBengali_600SemiBold.ttf"),
  },
  gujarati: {
    Crewgrain_gujarati_400Regular: require("@expo-google-fonts/noto-sans-gujarati/400Regular/NotoSansGujarati_400Regular.ttf"),
    Crewgrain_gujarati_600SemiBold: require("@expo-google-fonts/noto-sans-gujarati/600SemiBold/NotoSansGujarati_600SemiBold.ttf"),
  },
  gurmukhi: {
    Crewgrain_gurmukhi_400Regular: require("@expo-google-fonts/noto-sans-gurmukhi/400Regular/NotoSansGurmukhi_400Regular.ttf"),
    Crewgrain_gurmukhi_600SemiBold: require("@expo-google-fonts/noto-sans-gurmukhi/600SemiBold/NotoSansGurmukhi_600SemiBold.ttf"),
  },
  kannada: {
    Crewgrain_kannada_400Regular: require("@expo-google-fonts/noto-sans-kannada/400Regular/NotoSansKannada_400Regular.ttf"),
    Crewgrain_kannada_600SemiBold: require("@expo-google-fonts/noto-sans-kannada/600SemiBold/NotoSansKannada_600SemiBold.ttf"),
  },
  malayalam: {
    Crewgrain_malayalam_400Regular: require("@expo-google-fonts/noto-sans-malayalam/400Regular/NotoSansMalayalam_400Regular.ttf"),
    Crewgrain_malayalam_600SemiBold: require("@expo-google-fonts/noto-sans-malayalam/600SemiBold/NotoSansMalayalam_600SemiBold.ttf"),
  },
  oriya: {
    Crewgrain_oriya_400Regular: require("@expo-google-fonts/noto-sans-oriya/400Regular/NotoSansOriya_400Regular.ttf"),
    Crewgrain_oriya_600SemiBold: require("@expo-google-fonts/noto-sans-oriya/600SemiBold/NotoSansOriya_600SemiBold.ttf"),
  },
  tamil: {
    Crewgrain_tamil_400Regular: require("@expo-google-fonts/noto-sans-tamil/400Regular/NotoSansTamil_400Regular.ttf"),
    Crewgrain_tamil_600SemiBold: require("@expo-google-fonts/noto-sans-tamil/600SemiBold/NotoSansTamil_600SemiBold.ttf"),
  },
  telugu: {
    Crewgrain_telugu_400Regular: require("@expo-google-fonts/noto-sans-telugu/400Regular/NotoSansTelugu_400Regular.ttf"),
    Crewgrain_telugu_600SemiBold: require("@expo-google-fonts/noto-sans-telugu/600SemiBold/NotoSansTelugu_600SemiBold.ttf"),
  },
  arabic: {
    Crewgrain_arabic_400Regular: require("@expo-google-fonts/noto-naskh-arabic/400Regular/NotoNaskhArabic_400Regular.ttf"),
    Crewgrain_arabic_600SemiBold: require("@expo-google-fonts/noto-naskh-arabic/600SemiBold/NotoNaskhArabic_600SemiBold.ttf"),
  },
  meetei: {
    Crewgrain_meetei_400Regular: require("@expo-google-fonts/noto-sans-meetei-mayek/400Regular/NotoSansMeeteiMayek_400Regular.ttf"),
    Crewgrain_meetei_600SemiBold: require("@expo-google-fonts/noto-sans-meetei-mayek/600SemiBold/NotoSansMeeteiMayek_600SemiBold.ttf"),
  },
  olchiki: {
    Crewgrain_olchiki_400Regular: require("@expo-google-fonts/noto-sans-ol-chiki/400Regular/NotoSansOlChiki_400Regular.ttf"),
    Crewgrain_olchiki_600SemiBold: require("@expo-google-fonts/noto-sans-ol-chiki/600SemiBold/NotoSansOlChiki_600SemiBold.ttf"),
  },
};
export async function loadLanguageFont(code: string) {
  const script = languageInfo(code).script;
  const selected = assets[script];
  if (selected && !Object.keys(selected).every(Font.isLoaded))
    await Font.loadAsync(selected);
}
export async function loadPickerFonts() {
  await Promise.all(
    Object.keys(assets).map((script) => {
      const values = Object.fromEntries(
        Object.entries(assets[script]).filter(([key]) =>
          key.endsWith("400Regular"),
        ),
      );
      return Object.keys(values).every(Font.isLoaded)
        ? Promise.resolve()
        : Font.loadAsync(values);
    }),
  );
}
export function languageFont(code: string, bold = false) {
  const script = languageInfo(code).script;
  return script === "latin"
    ? null
    : `Crewgrain_${script}_${bold ? "600SemiBold" : "400Regular"}`;
}
