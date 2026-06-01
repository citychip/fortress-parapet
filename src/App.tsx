import { Switch, Route } from 'wouter';
import OverviewPage   from './pages/OverviewPage';
import PortfolioPage  from './pages/PortfolioPage';
import MarketPage     from './pages/MarketPage';
import OrdersPage     from './pages/OrdersPage';
import SystemPage     from './pages/SystemPage';

export default function App() {
  return (
    <Switch>
      <Route path="/"          component={OverviewPage} />
      <Route path="/portfolio" component={PortfolioPage} />
      <Route path="/market"    component={MarketPage} />
      <Route path="/orders"    component={OrdersPage} />
      <Route path="/system"    component={SystemPage} />
      <Route>
        <div style={{ padding: 40, color: 'var(--muted)' }}>404 — not found</div>
      </Route>
    </Switch>
  );
}
