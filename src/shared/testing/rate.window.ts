// Runs a rate limit scenario inside one limiter window. The simulated limiter starts a new window
// at every full minute of the wall clock, so a scenario that begins in one minute and ends in the
// next sees its counter reset. When that happens the scenario runs again, from another address.

const WINDOW_MILLISECONDS = 60_000;
// why: half a window, so a scenario and its one repetition never reach a second minute boundary.
const RATE_LIMIT_TEST_TIMEOUT = 30_000;

async function completeWithinOneWindow<Outcome>(
  scenario: (clientAddress: string) => Promise<Outcome>,
) {
  const startWindow = readWindowNumber();
  const outcome = await scenario(crypto.randomUUID());

  if (readWindowNumber() === startWindow) {
    return outcome;
  }

  const repeatedOutcome = await scenario(crypto.randomUUID());
  return repeatedOutcome;
}

function readWindowNumber() {
  const windowNumber = Math.floor(Date.now() / WINDOW_MILLISECONDS);
  return windowNumber;
}

export { completeWithinOneWindow, RATE_LIMIT_TEST_TIMEOUT };
