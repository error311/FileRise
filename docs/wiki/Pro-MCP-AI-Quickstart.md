# Pro MCP AI quickstart (OpenAI / Claude / Gemini)

This page is the fastest way to wire FileRise MCP into an AI app.

## What FileRise gives you

FileRise MCP gives you:

- A managed MCP runtime service (start/stop/restart in Admin).
- Scoped MCP users/tokens mapped to a FileRise user + source + root path.
- ACL-enforced operations and audit visibility.

## What you still need to build

FileRise does not call OpenAI/Claude/Gemini for you.  
You provide a thin connector in your app that:

1. Receives model tool calls.
2. Calls FileRise MCP `/v1/ops` with a bearer token.
3. Returns results back to the model.

`curl` examples below are for testing only, not production architecture.

## 1) Configure MCP in FileRise Admin

In `Admin -> Gateway Shares -> MCP`:

1. Save/start MCP service (default `127.0.0.1:3030` is recommended).
2. Create an MCP user:
   - Map to a FileRise user.
   - Set source ID.
   - Set root path scope.
3. Copy the issued token (shown only at issue/rotation time).

## 2) Test MCP directly

```bash
export MCP_URL="http://127.0.0.1:3030"
export MCP_TOKEN="paste_mcp_user_token_here"
```

Health check:

```bash
curl -s "$MCP_URL/health"
```

List files in a scoped folder:

```bash
curl -s "$MCP_URL/v1/ops" \
  -H "Authorization: Bearer $MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation":"list_files",
    "payload":{"folder":"root/photos","mode":"fast","limit":200}
  }'
```

## 3) Use one connector function for any model provider

```js
async function fileriseMcpOp(operation, payload = {}) {
  const res = await fetch(`${process.env.MCP_URL}/v1/ops`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.MCP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ operation, payload })
  });
  return await res.json();
}
```

Use this in:

- OpenAI function/tool calling
- Claude tool use
- Gemini function calling

Only the model SDK loop changes. The FileRise call stays the same.

## 4) Example workflow: duplicate image candidates

1. Call `list_files` for folder(s).
2. Keep image extensions (`jpg`, `jpeg`, `png`, `webp`, `gif`, `bmp`, `tif`, `tiff`, `heic`).
3. Group by `sizeBytes` as probable duplicates.
4. Optional: mark candidates with `save_file_tag`.

Note: exact duplicate detection requires hashing/content comparison in your app layer.

## 5) Security defaults

- Keep MCP bind on loopback unless you have a strong network control reason.
- Use one MCP token per integration/app.
- Keep MCP user scopes narrow (`sourceId` + `rootPath`).
- Rotate tokens if exposed.
- Do not log tokens, secrets, or raw sensitive payloads.

## Common confusion

`Gateway Shares -> MCP` in FileRise is the secure data/control plane.  
Your AI app is the orchestration plane.

That split is intentional:

- FileRise enforces ACL and scope.
- Your app chooses model/provider and prompt/tool behavior.
