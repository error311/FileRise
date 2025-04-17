// public/js/networkUtils.js
export function sendRequest(url, method = "GET", data = null, customHeaders = {}) {
  const options = {
    method,
    credentials: 'include',
    headers: { ...customHeaders }
  };

  if (data && !(data instanceof FormData)) {
    options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/json';
    options.body = JSON.stringify(data);
  } else if (data instanceof FormData) {
    options.body = data;
  }

  return fetch(url, options)
    .then(async res => {
      const text = await res.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
      if (!res.ok) {
        // Reject with the parsed JSON (or raw text) so .catch(error) gets it
        throw payload;
      }
      return payload;
    });
}