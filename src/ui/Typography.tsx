import React, { createContext, useContext, forwardRef } from "react";
import {
  Text as NativeText,
  TextInput as NativeInput,
  StyleSheet,
  type TextProps,
  type TextInputProps,
  type TextStyle,
} from "react-native";
import { isLoaded } from "expo-font";
import { cssInterop } from "nativewind";
import { useTranslation } from "react-i18next";
import { currentLanguage, normalizeDigits } from "../lib/i18n";
import { languageFont } from "../lib/language-fonts";

const Weight = createContext<TextStyle["fontWeight"]>("400");
export const font = {
  regular: "ManropeRegular",
  medium: "ManropeMedium",
  semibold: "ManropeSemiBold",
  bold: "ManropeBold",
};
function family(weight: TextStyle["fontWeight"]) {
  const n = weight === "bold" ? 700 : Number(weight ?? 400);
  return n >= 700
    ? font.bold
    : n >= 600
      ? font.semibold
      : n >= 500
        ? font.medium
        : font.regular;
}
export const Text = forwardRef<
  React.ComponentRef<typeof NativeText>,
  TextProps & { className?: string }
>(function Text({ style, ...props }, ref) {
  useTranslation();
  const inherited = useContext(Weight);
  const weight = StyleSheet.flatten(style)?.fontWeight ?? inherited;
  const explicit = StyleSheet.flatten(style)?.fontFamily;
  const name =
    explicit ??
    languageFont(
      currentLanguage().code,
      weight === "bold" || Number(weight) >= 600,
    ) ??
    family(weight);
  return (
    <Weight.Provider value={weight}>
      <NativeText
        {...props}
        ref={ref}
        style={[
          style,
          isLoaded(name)
            ? {
                fontFamily: name,
                fontWeight: "normal",
                writingDirection: currentLanguage().rtl ? "rtl" : "ltr",
              }
            : undefined,
        ]}
      />
    </Weight.Provider>
  );
});
export const TextInput = forwardRef<
  React.ComponentRef<typeof NativeInput>,
  TextInputProps & { className?: string }
>(function TextInput({ style, ...props }, ref) {
  useTranslation();
  const name = languageFont(currentLanguage().code) ?? font.regular;
  const numeric =
    props.secureTextEntry ||
    [
      "numeric",
      "number-pad",
      "phone-pad",
      "decimal-pad",
      "email-address",
      "url",
    ].includes(props.keyboardType ?? "") ||
    props.autoComplete === "username";
  return (
    <NativeInput
      {...props}
      onChangeText={(value) =>
        props.onChangeText?.(
          ["numeric", "number-pad", "phone-pad", "decimal-pad"].includes(
            props.keyboardType ?? "",
          ) || props.autoComplete === "username"
            ? normalizeDigits(value)
            : value,
        )
      }
      ref={ref}
      style={[
        style,
        isLoaded(name)
          ? {
              fontFamily: name,
              writingDirection: numeric
                ? "ltr"
                : currentLanguage().rtl
                  ? "rtl"
                  : "ltr",
              textAlign: numeric
                ? "left"
                : currentLanguage().rtl
                  ? "right"
                  : "left",
            }
          : undefined,
      ]}
    />
  );
});
cssInterop(Text, { className: "style" });
cssInterop(TextInput, { className: "style" });
