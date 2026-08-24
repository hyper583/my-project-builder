# Connecting Paystack

What it takes to accept a real ₦25,000 project pass, and the three things that
fail silently if you get them wrong.

Until `PAYSTACK_SECRET_KEY` is set, checkout is not offered and the webhook
returns `503` rather than falling through to logic that grants passes. Nothing
half-works.

---

## 1. Get the secret key

<https://dashboard.paystack.com/#/settings/developers>

Copy the **Secret Key**, not the public one. Start with the **test** key
(`sk_test_…`) — you can drive the whole flow with a test card before any real
money moves.

> The secret key both authenticates API calls and **signs webhooks**. A leak is
> not "someone can read your transactions", it is "someone can forge a
> payment". It never goes in a `NEXT_PUBLIC_` variable, never in the browser,
> and never in a commit.

## 2. Put it in `.env.local`

```
PAYSTACK_SECRET_KEY="sk_test_..."
```

Restart the dev server — env is read at boot.

## 3. Give Paystack somewhere to reach

**Paystack cannot reach `localhost`.** For local testing you need a public URL
pointing at your machine:

```bash
npx untun@latest tunnel http://localhost:3000
```

That prints something like `https://abc123.untun.dev`. Leave it running.

Then, on the same dashboard page, set the **Webhook URL**:

```
https://<your-public-host>/api/webhooks/paystack
```

For production this is your real domain and nothing else changes.

## 4. Check the price

`src/config/plans.ts`:

```ts
export const PASS_PRICE_KOBO = 2_500_000;   // ₦25,000
```

**Kobo, not naira.** `25000` here would charge ₦250. The webhook refuses any
payment below this figure, so getting it wrong fails closed rather than
selling passes cheaply — but it fails closed *silently*, as a 200 with a
console line.

## 5. Try it

Sign in, open a project, go to its **Export** page and start a purchase.
Paystack's test cards are at
<https://paystack.com/docs/payments/test-payments/>; `4084 0840 8408 4081`
with any future expiry and any CVV succeeds.

## 6. Confirm it actually landed

The webhook is what grants the pass, not the redirect back — so check the
database rather than the screen:

```bash
npx tsx --env-file=.env.local -e "
import { prisma } from '@/server/db';
const passes = await prisma.projectPass.findMany({
  orderBy: { createdAt: 'desc' }, take: 5,
  select: { externalId: true, amountMinor: true, currency: true, claimedAt: true, projectId: true },
});
console.log(passes);
await prisma.\$disconnect();
"
```

A row with your reference, `amountMinor: 2500000`, and a `claimedAt` means the
whole path worked. The Paystack dashboard also shows every delivery attempt and
the response it got, under **Transactions → the transaction → Webhook**.

---

## The three that fail silently

**Test key with live webhooks, or the reverse.** Each key signs with itself, so
a mismatch presents as every webhook failing its signature check — not as an
obvious configuration error. If deliveries are arriving and being rejected, this
is the first thing to check.

**A wrong webhook URL.** There is no resend button for a delivery Paystack could
not make. The student pays, nothing happens, and the only trace is in Paystack's
dashboard.

**Forgetting the tunnel is running.** Restart it and the public URL changes;
the dashboard still points at the old one.

---

## What happens when a payment arrives

In order, and the order is the security model:

1. **Signature**, over the raw body, in constant time. Nothing else runs first.
2. **Ask Paystack what happened**, rather than believing the payload.
3. **Check the amount and currency** against `PASS_PRICE_KOBO`.
4. **Create the pass**, keyed by the Paystack reference so retries cannot grant
   a second one.

Steps 2 and 3 are not belt-and-braces. A signed webhook proves Paystack sent
it — it does not prove the transaction succeeded, and it certainly does not
prove what was paid. Someone who opens a ₦100 transaction produces exactly the
same signed `charge.success` as someone who paid ₦25,000.

If the payment named a project, the pass is spent on it immediately, provided
the buyer owns it and it has no pass already. Otherwise the pass sits unclaimed
and the student spends it from Settings.

## Going live

Swap `sk_test_…` for the live key, point the webhook at your real domain, and
set `BETTER_AUTH_URL` to that domain — the payment callback is built from it, so
a stale value sends paying students to localhost.
