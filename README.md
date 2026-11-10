# Be Elite Supplements — website

The shop, customer accounts, affiliate portal, wholesale page and admin panel for Be Elite Supplements.
Hosted on Vercel; orders are stored in Supabase, paid by Open Banking through Fena, emailed through Resend,
and shipping labels are created through Royal Mail Click & Drop.

## Pages

| Address | What it is |
|---|---|
| `/` | Shop: entry notice, home, catalogue, product pages, basket, checkout |
| `/account` | Customer sign-in, order history, reminders |
| `/affiliate` | Affiliate portal: code, sales, commission, payout bank details |
| `/wholesale` | Password-protected trade price list and order request |
| `/admin` | Staff panel: orders, dispatch, labels, affiliates and discount codes |

## Going live: checklist

1. **Supabase (database)**
   - Create a new project at supabase.com.
   - Open **SQL Editor**, paste in `supabase-schema.sql` and click **Run**.
   - In **Settings → API**, copy the Project URL, the `anon` key and the `service_role` key.
   - In `account.html`, replace `YOUR_SUPABASE_URL` and `YOUR_SUPABASE_ANON_KEY` with the URL and `anon` key. The `anon` key is safe in the page; the `service_role` key is not, and only goes in Vercel.
   - In **Authentication → URL Configuration**, set the Site URL to `https://beelitesupplements.com`.
2. **Resend (emails)**
   - Add the domain `beelitesupplements.com`.
   - Add the DNS records Resend gives you (DKIM, SPF, MX) at the domain registrar.
   - Create an API key.
3. **Fena (Open Banking payments)**
   - Create a terminal and note the terminal ID and secret, and the bank account ID.
   - Set the webhook URL to `https://beelitesupplements.com/api/fena-webhook`.
   - Set the redirect URL to `https://beelitesupplements.com/`.
4. **Royal Mail Click & Drop**: create an API key (only needed for the "print label" button in admin).
5. **Vercel**
   - Import this repo as a new project.
   - Under **Settings → Environment Variables**, add the variables listed below.
   - Under **Settings → Domains**, add `beelitesupplements.com` **and** `www.beelitesupplements.com`. Both are needed, or the www address shows a certificate error.
6. **Change the defaults in the code**
   - `index.html`: in `SITE`, add the WhatsApp number to switch the chat button on.
   - `index.html`: the collection code `BE-COLLECT`.
   - `wholesale.html`: the trade password `BE-TRADE`.

### Vercel environment variables

| Name | Value |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase `service_role` key (keep secret) |
| `RESEND_API_KEY` | Resend API key |
| `FENA_TERMINAL_ID` | Fena terminal ID |
| `FENA_SECRET` | Fena terminal secret |
| `FENA_BANK_ACCOUNT_ID` | Fena bank account ID |
| `ROYAL_MAIL_API_KEY` | Click & Drop API key |
| `ADMIN_KEY` | The admin panel password. Pick a long one; it's never stored in the pages. |
| `CRON_SECRET` | Any long random string. Vercel uses it for the daily abandoned-basket and win-back emails. |

## Changing the domain

The domain appears in the emails (`api/*.js`), `index.html` (footer and `SITE`) and `account.html`.
To change it, search the repo for `beelitesupplements.com` and replace every match.

## Products and prices

Products are listed in `PRODUCTS` inside `index.html`. Each product exists as a pen; the vial version is created
automatically at £10 less unless `vialPrice` is set. The product images are in `img/` (`pen-*.svg`, `vial-*.svg`).
Wholesale prices are in `wholesale.html`.
