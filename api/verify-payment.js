import { saveReceipt } from '../lib/blob-receipts.js'
import { getPaymentSettings, isValidPaymentSignature, normalizeCustomer } from '../lib/payment-utils.js'

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'A valid JSON request body is required.' }, { status: 400 })
  }

  const {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
    customer: rawCustomer,
  } = body ?? {}
  const customer = normalizeCustomer(rawCustomer)

  if (
    typeof orderId !== 'string' ||
    typeof paymentId !== 'string' ||
    !customer
  ) {
    return Response.json({ error: 'Payment verification fields are required.' }, { status: 400 })
  }

  let settings
  try {
    settings = getPaymentSettings()
  } catch {
    return Response.json({ error: 'Payment server configuration is incomplete.' }, { status: 500 })
  }

  if (!isValidPaymentSignature(orderId, paymentId, signature, settings.keySecret)) {
    return Response.json({ error: 'Payment signature did not match.' }, { status: 400 })
  }

  const record = {
    verifiedAt: new Date().toISOString(),
    ...customer,
    amount: settings.amount / 100,
    currency: 'INR',
    orderId,
    paymentId,
  }

  try {
    await saveReceipt(record)
    return Response.json({
      verified: true,
      saved: true,
      payment_id: paymentId,
      order_id: orderId,
      amount: record.amount,
    })
  } catch (error) {
    console.error('Verified payment could not be saved to private Blob storage:', error.name)
    return Response.json({
      verified: true,
      saved: false,
      error: 'Payment succeeded, but its receipt could not be saved. Check Vercel Blob setup.',
      payment_id: paymentId,
      order_id: orderId,
      amount: record.amount,
    }, { status: 503 })
  }
}
