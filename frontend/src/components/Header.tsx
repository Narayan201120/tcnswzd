export function Header() {
  return (
    <header className="masthead">
      <svg className="wind-mark" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
        <circle cx="20" cy="20" r="18.5" className="mark-ring" />
        <path d="M8 15h14a4.5 4.5 0 1 0-4.5-7.5" className="mark-flow" />
        <path d="M8 21h20a4.5 4.5 0 1 1-4.5 7.5" className="mark-flow" />
        <path d="M8 27h9" className="mark-flow" />
      </svg>
      <div>
        <p className="wordmark">WindLens</p>
        <p className="tagline">Day-ahead wind forecast clarity and accuracy</p>
      </div>
    </header>
  );
}
