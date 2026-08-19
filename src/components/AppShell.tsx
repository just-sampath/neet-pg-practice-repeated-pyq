import type { ReactNode } from "react";

interface AppShellProps {
  children: ReactNode;
  compact?: boolean;
  trailing?: ReactNode;
}

export default function AppShell({ children, compact = false, trailing }: AppShellProps) {
  return (
    <div className={compact ? "app-shell app-shell--compact" : "app-shell"}>
      <header className="site-header">
        <div className="site-header__inner">
          <a className="brand" href="./" aria-label="NEET PG 377 home">
            <span className="brand__mark" aria-hidden="true">377</span>
            <span>
              <strong>NEET PG</strong>
              <small>review bank</small>
            </span>
          </a>
          {trailing ? <div className="site-header__trailing">{trailing}</div> : null}
        </div>
      </header>
      {children}
    </div>
  );
}
