import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catches render-time exceptions so a single bad render can't blank the whole app
 * (which on mobile can look like a crash and trigger relaunch churn). Shows a simple
 * recovery screen with a manual reload instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('App crashed:', error, info.componentStack)
  }

  handleReload = (): void => {
    try {
      const doomed: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith('freifeed.hc.')) doomed.push(key)
      }
      for (const key of doomed) localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
    window.location.reload()
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: '1.25rem', margin: 0 }}>Something went wrong</h1>
          <p style={{ opacity: 0.7, margin: 0, maxWidth: '24rem' }}>
            The app hit an unexpected error. Reloading usually fixes it.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              padding: '0.6rem 1.4rem',
              borderRadius: '999px',
              border: 'none',
              background: '#7c5cff',
              color: '#fff',
              fontSize: '1rem',
              fontWeight: 600,
            }}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
