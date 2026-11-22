export function pollUnavailableReason(
  pollsEnabled: boolean | undefined,
  canSendPoll: boolean | undefined,
): string {
  if (pollsEnabled === undefined) {
    return "Poll settings are unavailable. Reopen this conversation and try again.";
  }
  if (!pollsEnabled) {
    return "Polls are not enabled for this conversation's channel type in Stream.";
  }
  if (!canSendPoll) {
    return "Your role does not have the send-poll permission for this conversation in Stream.";
  }
  return "";
}
