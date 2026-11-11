# Razorpay Standard Checkout

## Run locally

1. Set your matching Razorpay Key ID and Key Secret in `.env`; keep the Secret out of all `VITE_` variables. The `.env` file is ignored by Git.
2. Set `PAYMENT_AMOUNT_PAISE=10000` for a ₹100 payment, or change it to another amount of at least 100 paise. The server controls the actual order amount.
3. Run `npm run dev` from this folder.
4. Open the Vite URL printed in the terminal (usually `http://localhost:5173`), click **Continue**, fill in the required details, then click **Continue to payment**.

The checkout uses the mode associated with the configured keys. Test keys require Razorpay test payment details. Live keys charge real money, including when running locally.

## Deploy on Vercel

1. In Vercel, add `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `VITE_RAZORPAY_KEY_ID`, `PAYMENT_AMOUNT_PAISE`, and `VITE_PAYMENT_AMOUNT_PAISE` under **Project Settings → Environment Variables**. Use matching live credentials for Production; use test credentials for Preview.
2. In the Vercel project **Storage** tab, create a **private Blob store** and connect it to the project. Vercel supplies the function credentials automatically.
3. Redeploy after setting the environment variables and connecting storage.

The root `api/` folder contains Vercel Functions for order creation and payment verification. Verified customer receipts are stored as private Blob records; Vercel's function filesystem is not used for persistent storage.

To export the private receipt records to Excel, connect the Blob store to the project's **Development** environment, then run `npx vercel login`, `npx vercel link`, and `npx vercel env pull .env.local` from this folder. Run `npm run export:payments` to create `data/payments.xlsx` locally. Keep the workbook private and back it up securely.

For local development, the Express API writes verified receipts directly to `data/payments.xlsx`. The workbook includes customer name, email, phone, amount, order/payment IDs, and verification time; it does not contain card or bank details. WhatsApp notifications are not configured.
