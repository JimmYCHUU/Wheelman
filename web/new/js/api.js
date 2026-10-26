// The new page's way to talk to the server. No DOM: the sign-in redirect goes through go(url).

/** api(path) is a GET; api(path, body) is a POST of JSON. A 401 goes to the sign-in page and throws. */
export function createApi({ fetch, go }) {
  return async function api(path, body) {
    const init = body === undefined ? undefined
      : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
    const res = await fetch(path, init);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      go('/signin');
      throw new Error('Signed out');
    }
    if (!res.ok) throw new Error((data && data.error) || 'HTTP ' + res.status);
    return data;
  };
}
