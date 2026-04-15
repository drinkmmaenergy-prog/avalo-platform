import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

type LegalKey =
  | "terms"
  | "privacy"
  | "cookies"
  | "payments"
  | "payout"
  | "creatorTerms"
  | "community";

type Props = {
  docKey: LegalKey;
};

export default function LegalDocumentScreen({ docKey }: Props) {
  const { t } = useTranslation();

  const title = t(`legal.${docKey}.title`);
  const body = t(`legal.${docKey}.body`);
  const effectiveDate = t("legal.meta.effectiveDate");
  const englishPrevails = t("legal.meta.englishPrevails");

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <View style={{ gap: 16 }}>
        <View>
          <Text style={{ fontSize: 28, fontWeight: "700", marginBottom: 8 }}>
            {title}
          </Text>
          <Text style={{ fontSize: 13, opacity: 0.7 }}>
            Effective date: {effectiveDate}
          </Text>
        </View>

        <View
          style={{
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 16,
            padding: 16,
          }}
        >
          <Text style={{ fontSize: 14, lineHeight: 22 }}>
            {body}
          </Text>
        </View>

        <View
          style={{
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 12,
            padding: 12,
          }}
        >
          <Text style={{ fontSize: 13, opacity: 0.8 }}>
            {englishPrevails}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
