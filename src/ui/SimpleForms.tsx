import { useTranslation } from "react-i18next";
import { tr, errorText } from "../lib/i18n";
import { Text } from "./Typography";
import React, { useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { View, Pressable } from "react-native";
import { Input as ReusableInput } from "../../components/ui/input";
import { Sheet, ActionButton, ChoiceField, Icon, c, styles } from "./kit";
function groupFields(fields: FormField[]) {
  const out: FormField[][] = [];
  for (const f of fields) {
    const last = out[out.length - 1];
    if (f.half && last && last.length === 1 && last[0].half) last.push(f);
    else out.push([f]);
  }
  return out;
}
export type FormField = {
  key: string;
  label: string;
  placeholder?: string;
  value?: string;
  required?: boolean;
  numeric?: boolean;
  multiline?: boolean;
  secure?: boolean;
  /** Two consecutive half fields share one row. */
  half?: boolean;
  options?: {
    value: string;
    label: string;
  }[];
};
export type FormSpec = {
  title: string;
  description?: string;
  fields: FormField[];
  submitLabel: string;
  destructive?: boolean;
  onSubmit: (values: Record<string, string>) => Promise<void>;
};
export function FormSheet({
  form,
  onClose,
}: {
  form: FormSpec | null;
  onClose: () => void;
}) {
  useTranslation();
  return form ? <Form key={form.title} form={form} onClose={onClose} /> : null;
}
function Form({ form, onClose }: { form: FormSpec; onClose: () => void }) {
  useTranslation();
  const [serverError, setServerError] = useState("");
  const schema = useMemo(
    () =>
      z.record(z.string(), z.string()).superRefine((values, ctx) => {
        for (const field of form.fields) {
          const value = values[field.key]?.trim() ?? "";
          if (field.required && !value) {
            ctx.addIssue({
              code: "custom",
              path: [field.key],
              message: tr("Enter {{value0}}.", {
                value0: field.label.toLowerCase(),
              }),
            });
          } else if (
            field.numeric &&
            value &&
            (!Number.isFinite(Number(value)) || Number(value) < 0)
          ) {
            ctx.addIssue({
              code: "custom",
              path: [field.key],
              message: tr("Enter a valid {{value0}}.", {
                value0: field.label.toLowerCase(),
              }),
            });
          }
        }
      }),
    [form.fields],
  );
  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Record<string, string>>({
    defaultValues: Object.fromEntries(
      form.fields.map((field) => [field.key, field.value ?? ""]),
    ),
    resolver: zodResolver(schema),
  });
  const currentValues = useWatch({ control });
  async function save(values: Record<string, string>) {
    setServerError("");
    try {
      await form.onSubmit(values);
      onClose();
    } catch (e) {
      setServerError((e as Error).message);
    }
  }
  return (
    <Sheet
      title={form.title}
      info={
        form.description && form.description.length > 50
          ? form.description
          : undefined
      }
      onClose={() => {
        if (!isSubmitting) onClose();
      }}
      footer={
        <>
          {!!serverError && (
            <Text
              accessibilityRole="alert"
              style={{ fontSize: 14, color: c.danger, lineHeight: 21 }}
            >
              {errorText(serverError)}
            </Text>
          )}
          <ActionButton
            label={isSubmitting ? tr("Saving...") : form.submitLabel}
            disabled={isSubmitting}
            destructive={form.destructive}
            onPress={() => void handleSubmit(save)()}
          />
        </>
      }
    >
      {!!form.description && form.description.length <= 50 && (
        <Text style={styles.muted}>{form.description}</Text>
      )}
      {groupFields(form.fields).map((group) => (
        <View
          key={group.map((f) => f.key).join()}
          style={{ flexDirection: "row", gap: 12 }}
        >
          {group.map((field) => (
            <View key={field.key} style={{ gap: 9, flex: 1, minWidth: 0 }}>
              <Text style={styles.label}>{field.label}</Text>
              {field.options && field.options.length > 3 ? (
                <ChoiceField
                  label={field.label}
                  value={currentValues[field.key] ?? ""}
                  options={field.options.map((option) => ({
                    id: option.value,
                    label: option.label,
                  }))}
                  onChange={(value) =>
                    setValue(field.key, value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  portalHost="sheet-choices"
                />
              ) : field.options ? (
                <View style={{ gap: 7 }}>
                  {field.options.map((option) => {
                    const selected = currentValues[field.key] === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        accessibilityRole="radio"
                        accessibilityLabel={option.label}
                        accessibilityState={{ checked: selected }}
                        onPress={() =>
                          setValue(field.key, option.value, {
                            shouldDirty: true,
                            shouldValidate: true,
                          })
                        }
                        style={[
                          styles.between,
                          {
                            padding: 14,
                            minHeight: 52,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: selected ? c.primary : c.line,
                            backgroundColor: selected ? c.soft : c.paper,
                          },
                        ]}
                      >
                        <Text style={[styles.body, { fontSize: 14, flex: 1 }]}>
                          {option.label}
                        </Text>
                        <Icon
                          name={
                            selected ? "radio-button-on" : "radio-button-off"
                          }
                          size={20}
                          color={selected ? c.primary : c.muted}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <Controller
                  control={control}
                  name={field.key}
                  render={({ field: input }) => (
                    <ReusableInput
                      accessibilityLabel={field.label}
                      value={input.value}
                      onChangeText={input.onChange}
                      onBlur={input.onBlur}
                      ref={input.ref}
                      keyboardType={
                        field.numeric
                          ? field.key === "rate" || field.key === "price"
                            ? "decimal-pad"
                            : "number-pad"
                          : field.key === "email"
                            ? "email-address"
                            : "default"
                      }
                      secureTextEntry={field.secure}
                      autoCapitalize={
                        field.secure || field.key === "email"
                          ? "none"
                          : "sentences"
                      }
                      multiline={field.multiline}
                      maxLength={field.multiline ? 2000 : 200}
                      placeholder={field.placeholder}
                      placeholderTextColor={c.muted}
                      className={
                        field.multiline
                          ? "h-auto min-h-[100px] py-3"
                          : "h-[52px] min-h-[52px]"
                      }
                      style={[
                        styles.input,
                        {
                          minHeight: field.multiline ? 100 : 52,
                          textAlignVertical: field.multiline ? "top" : "center",
                        },
                      ]}
                    />
                  )}
                />
              )}
              {!!errors[field.key]?.message && (
                <Text style={{ fontSize: 12, color: c.danger }}>
                  {String(errors[field.key]?.message)}
                </Text>
              )}
            </View>
          ))}
        </View>
      ))}
    </Sheet>
  );
}
