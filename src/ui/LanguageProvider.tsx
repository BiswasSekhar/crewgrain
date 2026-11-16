import React, { useEffect, useState } from "react";
import { View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { I18nextProvider, useTranslation } from "react-i18next";
import i18n, { currentLanguage, loadLanguageCatalog } from "../lib/i18n";
import { LANGUAGES, type LanguageCode } from "../lib/languages";
import { loadLanguageFont } from "../lib/language-fonts";
import { LaunchScreen } from "./LaunchScreen";
const preferenceKey = "crewgrain.language.v1";
export async function selectLanguage(code: LanguageCode) {
  loadLanguageCatalog(code);
  await loadLanguageFont(code);
  await AsyncStorage.setItem(preferenceKey, code);
  await i18n.changeLanguage(code);
}
function LanguageRoot({ children }: { children: React.ReactNode }) {
  useTranslation();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void (async () => {
      try {
        const saved = await AsyncStorage.getItem(preferenceKey);
        if (saved && LANGUAGES.some((l) => l.code === saved)) {
          loadLanguageCatalog(saved);
          await loadLanguageFont(saved);
          await i18n.changeLanguage(saved);
        }
      } finally {
        setReady(true);
      }
    })().catch(() => setReady(true));
  }, []);
  return (
    <View style={{ flex: 1, direction: currentLanguage().rtl ? "rtl" : "ltr" }}>
      {ready ? children : <LaunchScreen />}
    </View>
  );
}
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <LanguageRoot>{children}</LanguageRoot>
    </I18nextProvider>
  );
}
