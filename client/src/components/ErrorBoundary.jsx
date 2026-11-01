import { Component } from 'react';

// Last line of defence: if a page crashes while rendering, show a message instead of a blank
// screen. (Error boundaries still have to be class components in React.)
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Page crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="max-w-md">
          <h1 className="text-xl">Something broke on this page</h1>
          <p className="mt-2 text-sm text-muted">
            It's not you. Reload the page to try again, or go back to the events list.
          </p>
          <p className="mt-4 flex gap-4 text-sm">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="cursor-pointer text-accent hover:underline"
            >
              Reload
            </button>
            <a href="/">Go to events</a>
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
