# TDS Fandom Comment Bridge

This bridge can post replies to TDS Fandom Discussions, but it intentionally requires revocable Fandom bot credentials.

## One-time authentication

1. Sign in to Fandom normally in your browser.
2. Open `https://tds.fandom.com/wiki/Special:BotPasswords`.
3. Create a bot password named something like `TDSCommentBridge`.
4. Give it only the minimum permissions needed for posting/editing.
5. In GitHub, open this repository's **Settings → Secrets and variables → Actions**.
6. Add these repository secrets:
   - `FANDOM_BOT_USERNAME`
   - `FANDOM_BOT_PASSWORD`
7. Never put either credential in a committed file, issue, discussion, or chat message.

## Posting

The workflow watches `tds_bridge/comment_request.json`.

A post only happens when:
- `send` is exactly `true`
- the URL is a `https://tds.fandom.com/f/p/<id>` thread
- the body is non-empty
- the body is within the bridge safety limit
- authentication succeeds
- the thread is not locked

After every attempt, the workflow automatically resets `send` to `false`.

The server response is saved to `tds_bridge/comment_result.json`.

## Security

Use a dedicated Bot Password, not your main Fandom password. Bot Passwords can be revoked independently if needed.
