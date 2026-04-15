import { useState, useMemo } from 'react';

type Platform = 'macos' | 'ios' | 'windows' | 'android' | 'linux' | 'unknown';

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Macintosh|Mac OS X/.test(ua)) return 'macos';
  if (/Windows/.test(ua)) return 'windows';
  if (/Android/.test(ua)) return 'android';
  if (/Linux/.test(ua)) return 'linux';
  return 'unknown';
}

const INSTRUCTIONS: Record<Exclude<Platform, 'unknown'>, { label: string; steps: string[] }> = {
  macos: {
    label: 'macOS',
    steps: [
      'Open the downloaded .pem file — it opens Keychain Access.',
      'Double-click the "Hub CA" certificate in the list.',
      'Expand the Trust section and set "When using this certificate" to Always Trust.',
      'Close the window and enter your password to confirm.',
    ],
  },
  ios: {
    label: 'iOS / iPadOS',
    steps: [
      'Open this page in Safari (other browsers cannot install certificates on iOS).',
      'Tap the download button — tap Allow when prompted to download the profile.',
      'Open Settings \u2192 General \u2192 VPN & Device Management and install the downloaded profile.',
      'Then go to Settings \u2192 General \u2192 About \u2192 Certificate Trust Settings and enable full trust for the Hub CA.',
    ],
  },
  windows: {
    label: 'Windows',
    steps: [
      'Double-click the downloaded .pem file.',
      'Click Install Certificate and choose Local Machine (or Current User).',
      'Select "Place all certificates in the following store" and choose Trusted Root Certification Authorities.',
      'Click Finish.',
    ],
  },
  android: {
    label: 'Android',
    steps: [
      'Open Settings \u2192 Security \u2192 Encryption & Credentials \u2192 Install a certificate \u2192 CA certificate.',
      'Select the downloaded file and confirm.',
    ],
  },
  linux: {
    label: 'Linux',
    steps: [
      'Copy the downloaded file to /usr/local/share/ca-certificates/ and run:',
      'sudo cp smart-home-hub-ca.pem /usr/local/share/ca-certificates/smart-home-hub-ca.crt && sudo update-ca-certificates',
      'For browser trust, you may also need to import it into your browser\'s certificate manager.',
    ],
  },
};

const PLATFORM_ORDER: Exclude<Platform, 'unknown'>[] = ['macos', 'ios', 'windows', 'android', 'linux'];

export default function Trust() {
  const detected = useMemo(() => detectPlatform(), []);
  const [showAll, setShowAll] = useState(detected === 'unknown');

  const httpsUrl = `https://${window.location.hostname}/`;

  const platformsToShow = showAll
    ? PLATFORM_ORDER
    : detected !== 'unknown'
      ? [detected]
      : PLATFORM_ORDER;

  return (
    <div className="relative min-h-full overflow-hidden bg-[var(--bg-primary)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_80%_at_50%_-30%,var(--accent-glow),transparent)]" />
      <div className="relative mx-auto flex min-h-full max-w-2xl flex-col px-5 pb-16 pt-12 sm:px-8 sm:pt-16">
        <div className="mb-10 text-center sm:mb-14">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)]/15">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
            Trust your hub
          </h1>
          <p className="mx-auto mt-4 max-w-md text-lg leading-relaxed text-[var(--text-secondary)]">
            Install the hub&apos;s certificate authority on this device so your browser trusts the secure connection. You only need to do this once.
          </p>
        </div>

        <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl shadow-black/25 sm:p-8">
          <div className="flex flex-col items-center gap-6">
            <a
              href="/api/system/ca-cert"
              download="smart-home-hub-ca.pem"
              className="flex w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-[var(--accent)]/30 transition-colors hover:bg-[var(--accent-hover)]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download CA Certificate
            </a>
            <p className="text-center text-sm text-[var(--text-muted)]">
              Then follow the steps below for your device.
            </p>
          </div>

          <div className="mt-8 border-t border-[var(--border)] pt-8">
            {platformsToShow.map((p) => {
              const info = INSTRUCTIONS[p];
              return (
                <div key={p} className="mb-6 last:mb-0">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--accent)]">
                    {info.label}
                  </h3>
                  <ol className="list-decimal space-y-2 pl-5 text-[var(--text-primary)]">
                    {info.steps.map((step, i) => (
                      <li key={i} className="pl-1 text-sm leading-relaxed">
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}

            {detected !== 'unknown' && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="mt-4 text-sm font-medium text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"
              >
                {showAll ? 'Show only my platform' : 'Show all platforms'}
              </button>
            )}
          </div>
        </div>

        <div className="mt-10 text-center">
          <a
            href={httpsUrl}
            className="text-sm font-medium text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"
          >
            Already installed? Go to dashboard &rarr;
          </a>
        </div>
      </div>
    </div>
  );
}
