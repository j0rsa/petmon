import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  public static getDerivedStateFromError() {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled frontend error', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="empty-state">
          <h2>Something went wrong</h2>
          <p>Reload the page and try again.</p>
        </div>
      );
    }

    return this.props.children;
  }
}
