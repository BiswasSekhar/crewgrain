import { useTranslation } from "react-i18next";
import { tr, errorText, currentLanguage } from "../lib/i18n";
import React, { useEffect, useState } from "react";
import { ActivityIndicator } from "react-native";
import { Text } from "./Typography";
import { LANGUAGES } from "../lib/languages";
import { languageFont, loadPickerFonts } from "../lib/language-fonts";
import { selectLanguage } from "./LanguageProvider";
import { Sheet, Search, Tap, Icon, Pill, c, styles } from "./kit";
export function LanguagePicker({ onClose }: { onClose: () => void }) {
  useTranslation();
  const [search, setSearch] = useState(""),
    [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState(""),
    [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadPickerFonts()
      .then(() => {
        if (alive) setFontsReady(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  const selected = currentLanguage().code;
  return (
    <Sheet
      title={tr("Language")}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <Search
        value={search}
        onChange={setSearch}
        placeholder={tr("Search languages")}
      />
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: c.danger }}>
          {errorText(error)}
        </Text>
      )}
      {LANGUAGES.filter((language) =>
        `${language.name} ${language.native}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ).map((language) => (
        <Tap
          key={language.code}
          accessibilityRole="radio"
          accessibilityLabel={language.native}
          accessibilityState={{
            checked: selected === language.code,
            disabled: !!busy,
          }}
          disabled={!!busy}
          onPress={() => {
            setBusy(language.code);
            setError("");
            void selectLanguage(language.code)
              .then(onClose)
              .catch(() => setError("Could not change language. Try again."))
              .finally(() => setBusy(null));
          }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            padding: 14,
            minHeight: 56,
            borderWidth: 1,
            borderColor: selected === language.code ? c.primary : c.line,
            backgroundColor: selected === language.code ? c.infoLight : c.paper,
            borderRadius: 12,
          }}
        >
          <Text
            style={{
              ...styles.body,
              flex: 1,
              fontWeight: selected === language.code ? "600" : "400",
              ...(fontsReady && languageFont(language.code)
                ? { fontFamily: languageFont(language.code)! }
                : {}),
            }}
          >
            {language.native}
          </Text>
          {busy === language.code ? (
            <ActivityIndicator color={c.primary} />
          ) : selected === language.code ? (
            <Pill label={tr("Selected")} tone="info" />
          ) : (
            <Icon name="radio-button-off" color={c.muted} size={18} />
          )}
        </Tap>
      ))}
    </Sheet>
  );
}
