"use client";

import { Component, type ReactNode } from "react";

type State = { error: Error | null };

/**
 * Catches any runtime/render error in the Admin Panel and shows a visible,
 * recoverable message instead of a blank white screen.
 */
export default class AdminErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("[admin-ui-error]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-4">
          <div className="card mx-auto max-w-lg p-6 text-center">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-red-500/20 text-2xl">⚠️</div>
            <h1 className="text-lg font-black">কিছু একটা সমস্যা হয়েছে</h1>
            <p className="mt-2 break-words text-sm text-red-200">{this.state.error.message}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                className="btn btn-primary"
                onClick={() => {
                  this.setState({ error: null });
                  window.location.reload();
                }}
              >
                🔄 রিলোড করুন
              </button>
              <a href="/admin" className="btn btn-ghost">
                ← Dashboard
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
