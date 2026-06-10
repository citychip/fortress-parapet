import { Switch, Route } from 'wouter';
import BriefingPage   from './pages/BriefingPage';
import TriagePage     from './pages/TriagePage';
import PositionsPage  from './pages/PositionsPage';
import SystemPage     from './pages/SystemPage';
import CandidatesPage from './pages/CandidatesPage';
import MarketPage     from './pages/MarketPage';
import ErrorBoundary  from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { Redirect } from 'wouter';

// Per-page ErrorBoundary (#86): a render error in one page no longer blanks the app.
const page = (label: string, C: () => JSX.Element) => () => (
  <ErrorBoundary label={label}><C /></ErrorBoundary>
);

export default function App() {
  return (
    <ToastProvider>
    <ErrorBoundary label="app">
      <Switch>
        <Route path="/"           component={page('briefing',   BriefingPage)} />
        <Route path="/triage"     component={page('triage',     TriagePage)} />
        <Route path="/positions"  component={page('positions',  PositionsPage)} />
        <Route path="/candidates" component={page('candidates', CandidatesPage)} />
        <Route path="/market"     component={page('market',     MarketPage)} />
        <Route path="/system"     component={page('system',     SystemPage)} />
        {/* /orders removed (#78) — approvals happen via Claude; status lives on Triage */}
        <Route path="/orders"><Redirect to="/triage" /></Route>
        <Route>
          <div style={{ padding: 40, color: 'var(--muted)' }}>404 — not found</div>
        </Route>
      </Switch>
    </ErrorBoundary>
    </ToastProvider>
  );
}
