export function sendRequest(url, method = "GET", data = null, customHeaders = {}) {
  const options = {
    method,
    credentials: 'include',
    headers: {}
  };

  // Merge custom headers
  Object.assign(options.headers, customHeaders);

  // If data is provided and is not FormData, assume JSON.
  if (data && !(data instanceof FormData)) {
    if (!options.headers["Content-Type"]) {
      options.headers["Content-Type"] = "application/json";
    }
    options.body = JSON.stringify(data);
  } else if (data instanceof FormData) {
    options.body = data;
  }

  return fetch(url, options)
    .then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          throw new Error(`HTTP error ${response.status}: ${text}`);
        });
      }
      const clonedResponse = response.clone();
      return response.json().catch(() => clonedResponse.text());
    });
}