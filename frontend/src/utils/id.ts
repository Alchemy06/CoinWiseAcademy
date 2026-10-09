export function createId(prefix: string): string {
  // Not cryptographically secure; sufficient for temporary UI keys and session ids.
  // Format example: "session_1710000000000_ab12cd".
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
