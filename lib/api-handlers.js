import crypto from 'node:crypto'
import Razorpay from 'razorpay'
import { getAdminFirestore } from './firebase-admin.js'
import {
  createPendingBooking,
  getPaymentSettings,
  isValidPaymentSignature,
  normalizeCustomer,
  registerAttendees,
  verifyAndMarkBookingPaid,
} from './booking-workflow.js'

function sendError(response, statusCode, message) {
  return response.status(statusCode).json({ error: message })
}

function getFirestoreErrorMessage(error, action) {
  if (Number(error.code) === 5 || error.code === 'not-found') {
    return 'Firestore database not found. Create the default Firestore database in the Firebase project configured for this app.'
  }
  return action
}

export async function createOrderHandler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendError(response, 405, 'Method not allowed.')
  }

  const customer = normalizeCustomer(request.body?.customer)
  if (!customer) return sendError(response, 400, 'Valid customer name, email, and phone are required.')

  let settings
  let db
  try {
    settings = getPaymentSettings()
    db = getAdminFirestore()
  } catch (error) {
    console.error('Checkout configuration is invalid:', error.message)
    return sendError(response, 500, 'Payment or Firebase server configuration is incomplete.')
  }

  const registrationToken = crypto.randomBytes(32).toString('base64url')
  const razorpay = new Razorpay({ key_id: settings.keyId, key_secret: settings.keySecret })
  let order
  try {
    order = await razorpay.orders.create({
      amount: settings.amount,
      currency: 'INR',
      receipt: `lba_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
    })
  } catch (error) {
    const statusCode = error.statusCode === 401 || error.statusCode === 403 ? 401 : 503
    console.error('Razorpay order creation failed:', {
      code: error.statusCode || error.code || error.name,
      message: error.message,
    })
    return sendError(
      response,
      statusCode,
      statusCode === 401
        ? 'Razorpay authentication failed. Check the server key settings.'
        : 'Unable to create a Razorpay order. Please try again.',
    )
  }

  try {
    const booking = await createPendingBooking(db, order, customer, settings, registrationToken)
    return response.status(201).json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      booking_id: booking.bookingId,
      attendee_limit: booking.attendeeLimit,
      event_name: booking.eventName,
      registration_token: registrationToken,
    })
  } catch (error) {
    console.error('Firestore booking creation failed:', {
      code: error.code || error.name,
      message: error.message,
    })
    return sendError(
      response,
      503,
      getFirestoreErrorMessage(
        error,
        'Razorpay order created, but the booking could not be saved in Firestore. Check the Firebase setup.',
      ),
    )
  }
}

export async function verifyPaymentHandler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendError(response, 405, 'Method not allowed.')
  }

  const {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
    registration_token: registrationToken,
  } = request.body ?? {}
  if (
    typeof orderId !== 'string' ||
    typeof paymentId !== 'string' ||
    typeof signature !== 'string' ||
    typeof registrationToken !== 'string'
  ) {
    return sendError(response, 400, 'Payment verification fields are required.')
  }

  let settings
  let db
  try {
    settings = getPaymentSettings()
    db = getAdminFirestore()
  } catch (error) {
    console.error('Payment verification configuration is invalid:', error.message)
    return sendError(response, 500, 'Payment or Firebase server configuration is incomplete.')
  }

  if (!isValidPaymentSignature(orderId, paymentId, signature, settings.keySecret)) {
    return sendError(response, 400, 'Payment signature did not match.')
  }

  try {
    const result = await verifyAndMarkBookingPaid(db, orderId, paymentId, registrationToken)
    if (result.error) return sendError(response, result.statusCode, result.error)

    const booking = result.booking
    return response.json({
      verified: true,
      booking_id: booking.bookingId,
      payment_id: paymentId,
      order_id: orderId,
      amount: booking.amount / 100,
      currency: booking.currency,
      attendee_limit: booking.attendeeLimit,
      event_name: booking.eventName,
      payment_status: booking.paymentStatus,
      registration_status: booking.registrationStatus,
      status: booking.status,
      registration_token: registrationToken,
    })
  } catch (error) {
    console.error('Verified payment could not be recorded in Firestore:', {
      code: error.code || error.name,
      message: error.message,
    })
    return sendError(
      response,
      503,
      getFirestoreErrorMessage(
        error,
        'Payment was received, but the booking could not be updated. Contact support with your payment ID.',
      ),
    )
  }
}

export async function registerAttendeesHandler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendError(response, 405, 'Method not allowed.')
  }

  const { booking_id: bookingId, registration_token: registrationToken, attendees } = request.body ?? {}
  let db
  try {
    db = getAdminFirestore()
  } catch (error) {
    console.error('Firebase configuration is invalid:', error.message)
    return sendError(response, 500, 'Firebase server configuration is incomplete.')
  }

  try {
    const result = await registerAttendees(
      db,
      bookingId,
      registrationToken,
      Array.isArray(attendees) ? attendees.map((attendee) => attendee?.name) : attendees,
    )
    if (result.error) {
      return response.status(result.statusCode).json({
        error: result.error,
        already_issued: Boolean(result.alreadyIssued),
      })
    }
    return response.json(result)
  } catch (error) {
    console.error('Attendee registration could not be saved in Firestore:', {
      code: error.code || error.name,
      message: error.message,
    })
    return sendError(
      response,
      503,
      getFirestoreErrorMessage(error, 'Registration could not be completed. Please try again.'),
    )
  }
}
