"use client";

import { Component, useCallback, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import "../styles.css";
import AnalysisScreen from "../components/AnalysisScreen";
import AppShell from "../components/AppShell";
import HomeScreen from "../components/HomeScreen";
import QuizScreen from "../components/QuizScreen";
import { loadBank, publicAssetUrl } from "../data/repository";
import { createAttempt } from "../domain/selection";
import type { Attempt, AttemptConfig, BankData, ModeId } from "../domain/types";
import {
  clearLocalData,
  deleteAttempt,
  getExposureCounts,
  listAttempts,
  recordExposure,
  saveAttempt,
} from "../persistence/database";

type View = "home" | "quiz" | "analysis";

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Quiz application error", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <AppShell>
          <main className="state-page">
            <p className="eyebrow">Something went wrong</p>
            <h1>The attempt could not be displayed.</h1>
            <p>{this.state.error.message}</p>
            <button className="button button--ink" type="button" onClick={() => window.location.reload()}>
              Reload application
            </button>
          </main>
        </AppShell>
      );
    }
    return this.props.children;
  }
}

function QuizApplication() {
  const [bank, setBank] = useState<BankData | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [activeAttempt, setActiveAttempt] = useState<Attempt | null>(null);
  const [view, setView] = useState<View>("home");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshAttempts = useCallback(async () => {
    const stored = await listAttempts();
    setAttempts(stored);
    return stored;
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadBank(), listAttempts()])
      .then(([loadedBank, storedAttempts]) => {
        if (cancelled) return;
        setBank(loadedBank);
        setAttempts(storedAttempts);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "The question bank could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator) ||
      window.location.protocol !== "https:" ||
      window.location.hostname === "terminal.local"
    ) {
      return;
    }
    navigator.serviceWorker.register(publicAssetUrl("sw.js")).catch(() => {
      // Offline support is optional; a failed registration must not block the quiz.
    });
  }, []);

  const startAttempt = useCallback(
    async (modeId: ModeId, config: AttemptConfig) => {
      if (!bank) return;
      setBusy(true);
      try {
        const exposure = await getExposureCounts();
        const attempt = createAttempt({ bank, modeId, config, exposure });
        await Promise.all([saveAttempt(attempt), recordExposure(attempt.questionIds)]);
        setAttempts((current) => [attempt, ...current]);
        setActiveAttempt(attempt);
        setView("quiz");
        window.scrollTo({ top: 0 });
      } finally {
        setBusy(false);
      }
    },
    [bank],
  );

  const updateAttempt = useCallback((attempt: Attempt) => {
    setActiveAttempt(attempt);
    setAttempts((current) => [attempt, ...current.filter((candidate) => candidate.id !== attempt.id)]);
    void saveAttempt(attempt);
  }, []);

  const completeAttempt = useCallback((attempt: Attempt) => {
    setActiveAttempt(attempt);
    setAttempts((current) => [attempt, ...current.filter((candidate) => candidate.id !== attempt.id)]);
    void saveAttempt(attempt);
    setView("analysis");
    window.scrollTo({ top: 0 });
  }, []);

  const openAttempt = useCallback((attempt: Attempt) => {
    setActiveAttempt(attempt);
    setView(attempt.status === "completed" ? "analysis" : "quiz");
    window.scrollTo({ top: 0 });
  }, []);

  const goHome = useCallback(() => {
    setView("home");
    setActiveAttempt(null);
    void refreshAttempts();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [refreshAttempts]);

  if (loading) {
    return (
      <AppShell>
        <main className="state-page" role="status">
          <span className="loading-rule" />
          <p>Opening the question bank…</p>
        </main>
      </AppShell>
    );
  }

  if (error || !bank) {
    return (
      <AppShell>
        <main className="state-page">
          <p className="eyebrow">Question bank unavailable</p>
          <h1>{error ?? "The required data files were not found."}</h1>
          <p>Check that the complete data directory was deployed with the application.</p>
          <button className="button button--ink" type="button" onClick={() => window.location.reload()}>
            Try again
          </button>
        </main>
      </AppShell>
    );
  }

  if (view === "quiz" && activeAttempt) {
    return (
      <QuizScreen
        bank={bank}
        attempt={activeAttempt}
        onUpdate={updateAttempt}
        onComplete={completeAttempt}
        onHome={goHome}
      />
    );
  }

  if (view === "analysis" && activeAttempt) {
    return (
      <AnalysisScreen
        bank={bank}
        attempt={activeAttempt}
        onHome={goHome}
        onRetake={async (sourceAttempt) => {
          await startAttempt(sourceAttempt.modeId, sourceAttempt.config);
        }}
      />
    );
  }

  return (
    <HomeScreen
      bank={bank}
      attempts={attempts}
      busy={busy}
      onStart={startAttempt}
      onOpenAttempt={openAttempt}
      onDeleteAttempt={async (attemptId) => {
        await deleteAttempt(attemptId);
        setAttempts((current) => current.filter((attempt) => attempt.id !== attemptId));
      }}
      onClearData={async () => {
        await clearLocalData();
        setAttempts([]);
      }}
    />
  );
}

export default function QuizApp() {
  return (
    <AppErrorBoundary>
      <QuizApplication />
    </AppErrorBoundary>
  );
}
