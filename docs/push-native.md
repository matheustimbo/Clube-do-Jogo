# Native push delivery

Native notifications use the Expo Push Service while browser notifications keep the existing Web Push path. The server verifies each event and derives its recipients before inserting one durable Expo delivery per active installation.

## Required configuration

Set these server-only variables:

| Variable | Purpose |
| --- | --- |
| `EXPO_PROJECT_ID` | Accepts tokens only for the deployed EAS project and scopes native fan-out |
| `CRON_SECRET` | Authenticates `/api/push/worker` |
| `EXPO_ACCESS_TOKEN` | Optional token when Expo enhanced push security is enabled |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing server credential used by verified event routes and the worker |

`EXPO_PROJECT_ID` is not inferred from the token. Mobile sends the project ID used by `getExpoPushTokenAsync`, and the API compares it to the server value.

The repository had no `vercel.json` or another scheduler configuration when this feature was implemented. The worker route alone does not schedule itself. On a Vercel Pro or Enterprise deployment, add this project-root configuration:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/push/worker",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

Vercel sends `CRON_SECRET` as a Bearer token for configured cron invocations. A Hobby deployment supports only one cron invocation per day, so it cannot meet the 15-minute receipt and bounded retry schedule. Use a plan that supports minute-level cron or an external scheduler that sends the same authenticated GET request. Vercel does not retry a failed cron invocation, so monitor non-2xx responses and function logs. See [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs) and [Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

## Database rollout

`20260910143000_native_push_delivery.sql` is additive. It creates:

- `native_push_installations` for the current installation, account, token, project, and platform binding;
- `native_push_deliveries` for queue state and the unique `event/channel/installation` claim;
- `native_push_attempts` for each outbound attempt, ticket, receipt, error, and uncertainty flag;
- authenticated registration and unlink functions;
- service-role-only enqueue, claim, ticket, and receipt functions.

Do not apply the migration until local and linked migration histories have been compared. Review the linked schema for name collisions and run it first in a separate Supabase instance. The implementation did not apply this migration to production.

Authenticated users can read only their own installation rows. They cannot read deliveries or attempts and cannot write tables directly. Registration obtains the owner from `auth.uid()`. Unlink checks the current owner and exact token, which prevents delayed logout traffic from removing a newer account or rotated token.

## Event and channel behavior

Comment, club game, ranking leader, and reward routes still load the event from the database. Reward recipients come from grants. Comment authors are excluded. Club game and ranking notifications retain their all-member fan-out.

Web Push sends immediately. Expo delivery is inserted durably and returns before any Expo network call. A duplicate native event inserts no new row. Existing Web Push claims remain in place, but a duplicate web claim still runs native enqueue. A failure in one channel is recorded or returned without starting work after the HTTP response.

The native payload contains the existing `title`, `body`, `url`, and `tag`. The worker places `url` and `tag` under Expo `data`, where the mobile Router adapter can validate them before navigation.

## Worker lifecycle

Each worker call claims no more than 100 due deliveries, matching the Expo send batch limit. A database lease prevents concurrent workers from claiming the same ready row. Before each retry, the claim verifies that the installation is active and still belongs to the original recipient. A transferred installation cancels the old delivery.

Each Expo HTTP request has a 30-second abort deadline. Worker database requests have an eight-second deadline, and outcome writes use at most 20 concurrent requests. An aborted send is recorded as uncertain and follows the bounded retry policy; an aborted receipt request remains awaiting a receipt. Delivery batches keep project identities separate and run with at most ten concurrent requests. Since one claim contains at most 100 deliveries, the worst case of 100 distinct projects uses one eight-second claim and at most ten waves of one Expo request plus one outcome write: at most 388 seconds. This reserves more than three minutes of the ten-minute delivery lease. All claimed delivery batches are sent or classified from an attempted request; the worker does not label an unsent item as externally uncertain.

Receipt rows are claimed only after every delivery outcome has been persisted, so their ten-minute leases start independently of the send phase. A receipt claim contains at most 1000 rows, which fit in one 30-second Expo receipt request. At 20 concurrent writes, persistence takes at most 50 eight-second waves; including the claim, the combined 438-second bound leaves more than two minutes before receipt leases expire.

If persistence for one project fails, the worker stops taking new batches, waits for every already-started batch to settle, skips the receipt claim, and returns an error. It does not leave in-process sends running after the request or invent an external result for batches that never started; their database leases remain the recovery boundary.

An Expo ticket with an ID moves a row to `ticketed`. Receipt lookup begins after 15 minutes, following Expo's recommendation, and sends no more than 1000 ticket IDs per request. Missing receipts are checked at most five times because Expo clears receipts after 24 hours.

`DeviceNotRegistered` moves the delivery to `invalid_token` and deactivates the installation only when its current token equals the token used for that attempt. A late ticket or receipt cannot deactivate a rotated token.

Explicit rate errors, HTTP 429, HTTP 5xx, and network failures use delays of 1 minute, 5 minutes, 30 minutes, and 2 hours. At most five sends occur. A network failure after the request was written is ambiguous. The attempt is marked uncertain before retry. The Expo API has no event idempotency field, and Expo describes its service as at-least-once, so this policy can produce a duplicate external handoff. Exhausted ambiguous work ends as `unknown`.

A ticket or receipt `ok` proves acceptance by Expo or the platform push service. It does not prove presentation on the device. Expo recommends checking receipts and stopping sends after `DeviceNotRegistered`. See [Send notifications with the Expo Push Service](https://docs.expo.dev/push-notifications/sending-notifications/) and [Expo push notification FAQ](https://docs.expo.dev/push-notifications/faq/).

## Operational checks

After an approved database rollout:

1. register one isolated test installation and confirm that its row owner, project, token, and platform match;
2. enqueue a synthetic event through an authenticated event route;
3. invoke the worker with its cron secret and inspect the delivery plus attempt row;
4. wait at least 15 minutes, invoke the worker again, and inspect the receipt state;
5. rotate the isolated token and confirm that a delayed invalid-token result does not disable the new token;
6. switch the isolated device account and confirm that queued content for the old account becomes `cancelled`;
7. repeat the same event and confirm that the unique native delivery count does not increase;
8. confirm in the Vercel dashboard that the cron is registered at the intended cadence.

Do not use production member accounts, send real pushes, or alter the active club cycle for schema verification.
