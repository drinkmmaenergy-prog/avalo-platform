"use client";

import React from "react";
import { useTranslations } from "next-intl";

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

export default function LegalDocumentPage({ docKey }: Props) {
  const t = useTranslations();

  const title = t(`legal.${docKey}.title`);
  const body = t(`legal.${docKey}.body`);
  const effectiveDate = t("legal.meta.effectiveDate");
  const englishPrevails = t("legal.meta.englishPrevails");

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm opacity-70">
          Effective date: {effectiveDate}
        </p>
      </div>

      <div className="rounded-2xl border p-6 shadow-sm">
        <div className="whitespace-pre-line text-sm leading-7">
          {body}
        </div>
      </div>

      <div className="mt-6 rounded-xl border p-4 text-sm opacity-80">
        {englishPrevails}
      </div>
    </main>
  );
}
