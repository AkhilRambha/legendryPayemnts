# Razorpay Standard Checkout

## Run locally

1. Set your matching Razorpay Key ID and Key Secret in `.env`; keep the Secret out of all `VITE_` variables. The `.env` file is ignored by Git.
2. Set `PAYMENT_AMOUNT_PAISE=10000` for a ₹100 payment, or change it to another amount of at least 100 paise. The server controls the actual order amount.
3. Run `npm run dev` from this folder.
4. Open the Vite URL printed in the terminal (usually `http://localhost:5173`), click **Continue**, fill in the required details, then click **Continue to payment**.

The checkout uses the mode associated with the configured keys. Test keys require Razorpay test payment details. Live keys charge real money, including when running locally.

## Environment variables

The local `.env` file is ignored by Git. Never commit it or put `RAZORPAY_KEY_SECRET` in a `VITE_` variable. For deployment, configure the same variables in your hosting provider's secret environment settings and deploy the API server securely; Vite's development proxy is only for local use.

## API

- `POST /api/create-order` — creates an INR order using the server-configured amount.
- `POST /api/verify-payment` — verifies the payment signature and saves the verified receipt.

After a payment signature is verified, a success page is shown and the receipt is stored in `data/payments.xlsx` on the server. It includes customer name, email, phone, amount, order/payment IDs, and verification time. Keep this file private and back it up securely. It does not contain card or bank details. WhatsApp notifications are not configured.
