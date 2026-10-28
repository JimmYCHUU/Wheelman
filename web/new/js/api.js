// The new page's way to talk to the server. No DOM: the sign-in redirect goes through go(url).

export const NOT_RESPONDING = 'Wheelman is not responding. Check that it is running.';

/**
 * api(path) is a GET; api(path, body) is a POST of JSON. A 401 goes to the sign-in page and throws; a
 * fetch that fails (the server is off) says so in plain words, with no status. Any other failure
 * throws the server's words with the status, and said: whether they are the server's own (a gateway
 * in between answers in none), so a send can tell a refusal from an outcome it does not know.
 */
export function createApi({ fetch, go }) {
  return async function api(path, body) {
    const init = body === undefined ? undefined
      : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
    let res;
    try { res = await fetch(path, init); } catch { throw new Error(NOT_RESPONDING); }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      go('/signin');
      throw Object.assign(new Error('Signed out'), { status: 401, said: false });
    }
    if (!res.ok) throw Object.assign(new Error((data && data.error) || 'HTTP ' + res.status), { status: res.status, said: !!(data && data.error) });
    return data;
  };
}
