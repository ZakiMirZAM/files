// A6 practice tests: make a test with AI, list saved tests, and take one.

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Trash2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { formatScore } from "../../lib/learnApi";
import { TestBuilder } from "./TestBuilder";
import { TestRunner } from "./TestRunner";

export function TestsTab() {
  const tests = useQuery(api.learnTests.listTests);
  const deleteTest = useMutation(api.learnTests.deleteTest);
  const [openId, setOpenId] = useState<Id<"learnTests"> | null>(null);
  const [confirmId, setConfirmId] = useState<Id<"learnTests"> | null>(null);

  if (openId) return <TestRunner testId={openId} onBack={() => setOpenId(null)} />;

  return (
    <div className="space-y-6">
      <TestBuilder onCreated={setOpenId} />

      <section className="space-y-2">
        <p className="label">Your tests</p>
        {tests === undefined ? (
          <p className="text-sm text-white/45">Loading</p>
        ) : tests.length === 0 ? (
          <p className="text-sm text-white/45">No tests yet. Make one above.</p>
        ) : (
          <ul className="space-y-2">
            {tests.map((t) => (
              <li key={t._id} className="panel-soft p-3 flex flex-wrap items-center gap-3">
                <button type="button" className="flex-1 min-w-[12rem] text-left" onClick={() => setOpenId(t._id)}>
                  <span className="block text-sm font-medium text-white">{t.title}</span>
                  <span className="block text-xs text-white/45 mt-0.5">
                    {t.mc} multiple choice · {t.short} short answer · {new Date(t.createdAt).toLocaleDateString()}
                    {t.lastScore && ` · last score ${formatScore(t.lastScore.score, t.lastScore.total)}`}
                  </span>
                </button>
                <button type="button" className="btn-outline px-3 py-1.5" onClick={() => setOpenId(t._id)}>
                  Open
                </button>
                {confirmId === t._id ? (
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn-ghost text-loss"
                      onClick={() => {
                        setConfirmId(null);
                        void deleteTest({ testId: t._id });
                      }}
                    >
                      Delete test and attempts
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setConfirmId(null)}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn-ghost p-2"
                    onClick={() => setConfirmId(t._id)}
                    aria-label={`Delete ${t.title}`}
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
