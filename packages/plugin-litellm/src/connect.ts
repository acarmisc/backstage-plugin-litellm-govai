/**
 * Local-client connect flow (e.g. abby-desktop's installer): the client listens on a loopback
 * port and opens /litellm/connect?redirect_uri=http://localhost:<port>/callback&state=<nonce>.
 */

/** Same rule as the backend: only http://localhost|127.0.0.1:<port>/callback, never an open redirect. */
export function isLoopbackCallback(uri: string | null): uri is string {
  if (!uri) return false;
  try {
    const url = new URL(uri);
    return (
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
      url.pathname === '/callback' &&
      url.search === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
}

/** Hands the keys to the local client as a form POST, so they never land in a URL or the browser history. */
export function postToLoopback(redirectUri: string, fields: [string, string][]): void {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = redirectUri;
  for (const [name, value] of fields) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

/** Teams ticked when the page opens: only the ones the client has no key for, when it says (`have`). */
export function initialTeams(all: string[], have: Set<string>): Set<string> {
  const missing = all.filter(id => !have.has(id));
  return new Set(have.size ? missing : all);
}
