import { useTranslation } from "react-i18next";
import { tr } from "../lib/i18n";
import React, { useState } from "react";
import { useDailyStore } from "../lib/daily-store";
import { Segments, Tools } from "./kit";
import { Requests, Corrections, Reports } from "./FeatureScreens";
import { AdminDay } from "./Workflows";
import { CAPTAIN_REPORTS_ENABLED } from "../lib/features";
export function AdminInbox(tools: Tools) {
  useTranslation();
  const { data } = useDailyStore();
  const work =
    (data?.days ?? []).filter((day) => day.status === "needs_admin").length +
    (data?.corrections ?? []).filter((row) => row.status === "pending").length;
  const people = (data?.requests ?? []).filter(
    (row) => row.status === "pending",
  ).length;
  const reports = CAPTAIN_REPORTS_ENABLED
    ? (data?.reports ?? []).filter((row) => row.status === "submitted").length
    : 0;
  const [tab, setTab] = useState(
    work ? "work" : people ? "people" : reports ? "reports" : "work",
  );
  return (
    <>
      <Segments
        value={tab}
        onChange={setTab}
        options={[
          {
            id: "work",
            label: tr("Counts{{value0}}", { value0: work ? ` (${work})` : "" }),
          },
          {
            id: "people",
            label: tr("Employees{{value0}}", {
              value0: people ? ` (${people})` : "",
            }),
          },
          ...(CAPTAIN_REPORTS_ENABLED
            ? [
                {
                  id: "reports",
                  label: tr("Reports{{value0}}", {
                    value0: reports ? ` (${reports})` : "",
                  }),
                },
              ]
            : []),
        ]}
      />
      {tab === "work" && (
        <>
          <Corrections {...tools} />
          <AdminDay {...tools} />
        </>
      )}
      {tab === "people" && <Requests {...tools} pendingOnly />}
      {CAPTAIN_REPORTS_ENABLED && tab === "reports" && (
        <Reports {...tools} inbox />
      )}
    </>
  );
}
