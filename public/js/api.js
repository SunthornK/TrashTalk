// Every request to our server goes through api(). It sends and receives
// JSON, and turns error responses into an ApiError the page can show.

export class ApiError extends Error {
  constructor(status, message, field) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

export async function api(method, path, body) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin', // send our session cookie
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // The server is down or the network is gone.
    throw new ApiError(0, 'Something went wrong, try again');
  }

  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);

  if (response.ok) return data;

  // Not logged in (any more): go to the login page, unless we're already there.
  if (response.status === 401 && !location.pathname.endsWith('/login.html')) {
    location.href = '/login.html';
  }
  throw new ApiError(response.status, data?.error ?? 'Something went wrong, try again', data?.field);
}
