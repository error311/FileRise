export function sendRequest(url, method = "GET", data = null) {
  console.log("Sending request to:", url, "with method:", method);
  const options = {
    method,
    credentials: 'include', // include cookies in requests
    headers: {}
  };

  // If data is provided and is not FormData, assume JSON.
  if (data && !(data instanceof FormData)) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(data);
  } else if (data instanceof FormData) {
    // For FormData, don't set the Content-Type header; the browser will handle it.
    options.body = data;
  }

  return fetch(url, options)
    .then(response => {
      console.log("Response status:", response.status);
      if (!response.ok) {
        return response.text().then(text => {
          throw new Error(`HTTP error ${response.status}: ${text}`);
        });
      }
      // Clone the response so we can safely fall back if JSON parsing fails.
      const clonedResponse = response.clone();
      return response.json().catch(() => {
        console.warn("Response is not JSON, returning as text");
        return clonedResponse.text();
      });
    });
}