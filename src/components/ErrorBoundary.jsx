"use client";

import { Component } from "react";

/**
 * ErrorBoundary — catches unhandled render errors in its subtree and displays
 * a friendly fallback UI instead of crashing the whole page.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <SomeComponent />
 *   </ErrorBoundary>
 *
 * Or with a custom fallback:
 *   <ErrorBoundary fallback={<p>Something went wrong.</p>}>
 *     <SomeComponent />
 *   </ErrorBoundary>
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught an error:", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center min-h-[200px] rounded-xl border border-red-200 bg-red-50 p-8 text-center"
        >
          <span className="text-4xl mb-3" aria-hidden="true">⚠️</span>
          <h2 className="text-base font-semibold text-red-800 mb-1">
            Terjadi Kesalahan
          </h2>
          <p className="text-sm text-red-600 mb-4 max-w-sm">
            {this.state.error?.message || "Komponen ini mengalami kesalahan yang tidak terduga."}
          </p>
          <button
            onClick={this.handleReset}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            Coba Lagi
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
