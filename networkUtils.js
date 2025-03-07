// networkUtils.js
export function sendRequest(url, method = "GET", data = null) {
    console.log("Sending request to:", url, "with method:", method);
    const options = { method, headers: { "Content-Type": "application/json" } };
    if (data) {
      options.body = JSON.stringify(data);
    }
    return fetch(url, options)
      .then(response => {
        console.log("Response status:", response.status);
        if (!response.ok) {
          return response.text().then(text => {
            throw new Error(`HTTP error ${response.status}: ${text}`);
          });
        }
        return response.json().catch(() => {
          console.warn("Response is not JSON, returning as text");
          return response.text();
        });
      });
  }
  