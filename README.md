# Legendary Business Awards Checkout

## Local setup

1. Create a Firebase project and enable Cloud Firestore.
2. In Firebase Console → Firestore Database → Rules, publish the contents of `firestore.rules`.
3. Create a Firebase service account for the server and download its JSON key. For local development, put the file in the project root as `firebase-service-account.json`; Git ignores this filename.
4. Add `FIREBASE_PROJECT_ID` and `FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json` to your existing `.env`. You do not need to copy the JSON contents. For Vercel, use the `FIREBASE_SERVICE_ACCOUNT_JSON` environment variable instead, because the local key file is not deployed.
5. Copy any other missing settings from `.env.example` into `.env`. Never expose the Firebase service-account JSON or Razorpay secret in a `VITE_` variable.
6. Run `npm run dev`, then open the Vite URL printed in the terminal.
7. Continue through checkout, complete a Razorpay payment, then use **Continue to Attendee Registration** to add up to four attendee names and issue their QR tickets.

Use Razorpay test credentials and test payment details while developing. Live credentials charge real money, including on localhost.

## Firebase configuration

Set these server environment variables locally in `.env` and in Vercel Project Settings → Environment Variables:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_DATABASE_ID` — defaults to `default`, matching the Firebase database created for this project.
- `FIREBASE_SERVICE_ACCOUNT_JSON` — the service account JSON as one environment-variable value; never commit or share it.
- `ATTENDEE_LIMIT` — maximum attendees per booking (defaults to `4`, including the main attendee).
- `BOOKING_ID_PREFIX` — defaults to `LBA26`.
- `EVENT_NAME` — defaults to `Legendary Business Awards 2026`.

Also configure the Razorpay variables shown in `.env.example`. `VITE_RAZORPAY_KEY_ID` is public; do not add `VITE_` to the Razorpay secret or Firebase credentials. Redeploy after changing Vercel variables.

The backend uses Firebase Admin, so browser clients do not access Firestore directly. `firestore.rules` denies direct client reads and writes. The server account needs Firestore access.

## Firestore collections

- `bookings`: payment/order IDs, booking ID, registered email and phone, payment and registration statuses, attendee limit/count, event name, and status history.
- `attendees`: attendee name, booking ID, and attendee number.
- `tickets`: SHA-256 QR token hash, attendee ID, booking ID, and check-in status. The raw QR token is returned to the customer once and is not stored in Firestore.
- `system/bookingCounter`: transaction-protected booking ID sequence.

Bookings transition from `PAYMENT_PENDING` to `PAID`, then `REGISTRATION_COMPLETED` and `TICKETS_ISSUED`. Payment verification requires the Razorpay signature and matching unguessable registration token. Attendee creation and ticket issuance happen in one Firestore transaction, enforce the booking's attendee limit, and cannot issue duplicate tickets.

## API routes

- `POST /api/create-order` — creates a Razorpay order and `PAYMENT_PENDING` booking.
- `POST /api/verify-payment` — verifies the Razorpay signature and marks the booking paid.
- `POST /api/register-attendees` — saves attendees and issues QR tickets for a verified booking.

The local Express server supports these routes during development. Vercel deploys the `api/` handlers as serverless functions.
