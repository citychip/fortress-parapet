import { Switch, Route } from 'wouter';
import BriefingPage   from './pages/BriefingPage';
import TriagePage     from './pages/TriagePage';
import PositionsPage  from './pages/PositionsPage';
import OrdersPage     from './pages/OrdersPage';
import SystemPage     from './pages/SystemPage';
import CandidatesPage from './pages/CandidatesPage';
import MarketPage     from './pages/MarketPage';
import ErrorBoundary  from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';

export default function App() {
  return (
    <ToastProvider>
    <ErrorBoundary label="app">
      <Switch>
        <Route path="/"           component={BriefingPage} />
        <Route path="/triage"     component={TriagePage} />
        <Route path="/positions"  component={PositionsPage} />
        <Route path="/candidates" component={CandidatesPage} />
        <Route path="/market"     component={MarketPage} />
        <Route path="/system"     component={SystemPage} />
        {/* legacy redirect: /orders still accessible directly */}
        <Route path="/orders"     component={OrdersPage} />
        <Route>
          <div style={{ padding: 40, color: 'var(--muted)' }}>404 — not found</div>
        </Route>
      </Switch>
    </ErrorBoundary>
    </ToastProvider>
  );
}
