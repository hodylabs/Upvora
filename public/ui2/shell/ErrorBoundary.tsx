import React from "react"

interface Props {
  onError?: (err: Error) => void
  children: React.ReactNode
}

interface State {
  failed: boolean
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = { failed: false }

  public static getDerivedStateFromError(): State {
    return { failed: true }
  }

  public componentDidCatch(err: Error) {
    this.props.onError?.(err)
  }

  public render() {
    if (this.state.failed) {
      return (
        <main className="u2-error" role="alert">
          <h1>Something went wrong</h1>
          <p>
            <a href={location.href}>Reload the page</a>
          </p>
        </main>
      )
    }
    return this.props.children
  }
}
