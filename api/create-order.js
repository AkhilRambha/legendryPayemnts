import Razorpay from 'razorpay'
import { getPaymentSettings } from '../lib/payment-utils.js'

export async function POST() {
  let settings
  try {
    settings = getPaymentSettings()
  } catch {
    return Response.json({ error: 'Payment server configuration is incomplete.' }, { status: 500 })
  }

  try {
    const razorpay = new Razorpay({
      key_id: settings.keyId,
      key_secret: settings.keySecret,
    })
    const order = await razorpay.orders.create({
      amount: settings.amount,
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
    })

    return Response.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
    }, { status: 201 })
  } catch (error) {
    const statusCode = error.statusCode === 401 || error.statusCode === 403 ? 401 : 500
    console.error('Razorpay order creation failed:', error.statusCode || 'unknown status')
    return Response.json({
      error: statusCode === 401
        ? 'Razorpay authentication failed. Check the server key settings.'
        : 'Unable to create a payment order. Please try again.',
    }, { status: statusCode })
  }
}
