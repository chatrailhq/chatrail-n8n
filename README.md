# n8n-nodes-chatrail

n8n nodes for [ChatRail](https://www.chatrail.dev), a WhatsApp API for developers. Send WhatsApp messages from a number you already have, check whether numbers are on WhatsApp, and start workflows when a customer replies.

- **ChatRail**: send messages, look up a message's delivery status, check numbers and list your connected numbers.
- **ChatRail Trigger**: start a workflow on WhatsApp events such as an incoming message, a delivery update or a number disconnecting. Every event is signature-checked.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) · [Trigger](#trigger) · [Example workflows](#example-workflows) · [Troubleshooting](#troubleshooting) · [Compatibility](#compatibility) · [Resources](#resources)

## Installation

Follow the [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n docs and install `n8n-nodes-chatrail`.

## Credentials

1. Sign up at [chatrail.dev](https://www.chatrail.dev). The free Sandbox includes 500 messages a month.
2. Pair a WhatsApp number in the dashboard by scanning a QR code or entering a pairing code.
3. Create an API key under **API keys** with the scopes you need:
   - `messages:write` to send messages
   - `messages:read` to get messages and check numbers
   - `webhooks:read` and `webhooks:write` for the ChatRail Trigger
4. In n8n, create a **ChatRail API** credential and paste the key. Leave **Base URL** as `https://www.chatrail.dev`.

The key belongs to one workspace and can act on everything in it, so treat it like a password.

## Operations

### Message

- **Send**: send text, or media from a public HTTPS URL, from a connected number.
  - **Context** attaches the data behind an alert (an order, a booking). When the customer replies, the reply is matched back to it, and ChatRail's optional AI replies can answer follow-up questions from it.
  - **Metadata** is your own reference data. It comes back on webhooks and is never sent to WhatsApp.
  - **Send At** schedules the message.
  - **Reply To Message ID** quotes an earlier message in the same chat.
  - Each item gets an idempotency key, so n8n's *Retry On Fail* can't send the same message twice. Set your own key under **Additional Fields** to deduplicate across executions.
- **Get**: get a message and its current delivery status, for example `sent`, `delivered`, `read` or `failed`, with the reason when it failed.

A successful send means ChatRail has accepted and queued the message. It doesn't yet mean WhatsApp has delivered it. Use **Get**, or the trigger's delivery events, to follow the status.

### Number

- **Check**: check up to 10 numbers at a time. Each number becomes its own output item, with `registered`, the WhatsApp `chat_id`, and whether the answer was `cached`.

Checks go through your own connected number, so ChatRail rations them to protect it:
- An answer from the last 24 hours is reused, and doesn't reach WhatsApp.
- Up to 10 lookups a minute per workspace, and 30 a day on Sandbox.

Use it to check a recipient before sending, not to sweep a list.

### Connection

- **Get Many**: list the WhatsApp numbers in the workspace and their state.

## Trigger

Choose one or more events:

| Group | Events |
|---|---|
| Incoming | `message.received`, `message.reply_correlated`, `message.reaction`, `message.edited`, `message.revoked`, `poll.vote`, `call.received`, `group.participants_changed` |
| Delivery | `message.accepted`, `message.queued`, `message.sent`, `message.delivered`, `message.read`, `message.failed` |
| Connections | `connection.connected`, `connection.degraded`, `connection.disconnected`, `connection.requires_repair` |
| Scheduling and AI | `schedule.created`, `schedule.sent`, `ai.reply_generated`, `ai.reply_blocked` |

- **Registration is automatic.** Activating the workflow registers its webhook URL with ChatRail, and deactivating it removes the registration.
- **Every delivery is checked.** The trigger verifies each delivery's HMAC-SHA256 signature and timestamp, and refuses unsigned, altered or replayed requests with `401`.
- **Optional filter:** set **Connection** to receive events from one number only. This needs a plan with more than one connection.

ChatRail only delivers webhooks to public HTTPS addresses, so the trigger needs an n8n instance that is reachable from the internet. That includes n8n Cloud and a self-hosted n8n with a public domain, but not `localhost`.

Each event has the same envelope:

```json
{
  "id": "whd_…",
  "type": "message.received",
  "created_at": "2026-09-30T12:00:00.000Z",
  "workspace_id": "…",
  "data": { "…": "…" }
}
```

`id` stays the same across retries. Delivery is at least once, so use `id` to skip duplicates.

## Example workflows

- **Order update with follow-up answers:** a Shopify or WooCommerce trigger feeds **ChatRail → Message → Send**, with the order as **Context**. Customers' questions about that order are matched back to it automatically.
- **Route replies to your team:** **ChatRail Trigger** on `message.received` feeds a Slack or email node.
- **Know when a number drops:** **ChatRail Trigger** on `connection.disconnected` sends you an alert, so you can re-pair before messages pile up.
- **Clean a contact before sending:** **ChatRail → Number → Check**, then an IF node on `registered`.

Two ready-to-import workflows are in [`examples/`](examples): one sends, checks and looks up messages, and one reacts to incoming events. In n8n, choose **Import from File**, then pick your ChatRail credential and connection in each node.

More patterns are in the [ChatRail n8n guide](https://www.chatrail.dev/integrations/n8n) and [tutorial](https://www.chatrail.dev/tutorials/n8n-whatsapp-workflow).

## Troubleshooting

- **The trigger never fires:** ChatRail can only deliver to a public HTTPS address. A self-hosted n8n on `localhost` or a private network won't receive events. Check the webhook endpoint the trigger created in the ChatRail dashboard, under Webhooks. Its delivery log shows each attempt and its response.
- **Activating the trigger fails with 402:** limiting the trigger to one **Connection** needs a plan with more than one connection. Leave **Connection** empty to receive events from every number.
- **Number checks return 429, or `reason: minute_limit` or `daily_limit`:** lookups are limited to protect your number (10 a minute, and 30 a day on Sandbox). Answers from the last 24 hours are reused and don't count, so wait and try again.
- **A send returns 409:** the connection isn't ready, usually because the WhatsApp number needs pairing again. Re-pair it in the dashboard.
- **401 or 403:** check the credential's API key and that it has the scopes listed under [Credentials](#credentials).

## Compatibility

Built with the `n8n-node` CLI against n8n Nodes API version 1.

## Resources

- [ChatRail documentation](https://www.chatrail.dev/docs)
- [API reference](https://www.chatrail.dev/api-reference)
- [Webhook events and signatures](https://www.chatrail.dev/webhooks)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

ChatRail connects through WhatsApp Linked Devices. It isn't affiliated with or endorsed by Meta or WhatsApp.

## License

[MIT](LICENSE.md)
