interface WSBFeedProps {
  feedText: string;
  roundIndex: number;
}

/** WSB member counts per round index (Scenario 4). */
const WSB_MEMBERS: Record<number, string> = {
  0: "1.7M",
  1: "2.4M",
  2: "6.5M",
  3: "7.2M",
  4: "8.1M",
};

export function WSBFeed({ feedText, roundIndex }: WSBFeedProps) {
  if (!feedText) return null;

  const members = WSB_MEMBERS[roundIndex] ?? "";

  return (
    <div className="cc-wsb-feed">
      <div className="cc-wsb-header">
        <span className="cc-wsb-icon" aria-hidden="true">🚀</span>
        <div className="cc-wsb-title-group">
          <span className="cc-wsb-subreddit">r/wallstreetbets</span>
          {members && (
            <span className="cc-wsb-members">{members} members</span>
          )}
        </div>
        <span className="cc-wsb-live" aria-label="live feed">LIVE</span>
      </div>
      <div className="cc-wsb-body">
        <p className="cc-wsb-text">{feedText}</p>
      </div>
    </div>
  );
}
