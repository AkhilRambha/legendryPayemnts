import crypto from 'node:crypto'
import { FieldValue } from 'firebase-admin/firestore'

const bookingIdPattern = /^[A-Z0-9-]{4,32}$/
const signaturePattern = /^[a-f\d]{64}$/i
const registrationTokenPattern = /^[A-Za-z0-9_-]{40,64}$/

export function getPaymentSettings(environment = process.env) {
  const keyId = environment.RAZORPAY_KEY_ID
  const keySecret = environment.RAZORPAY_KEY_SECRET
  const amount = Number(environment.PAYMENT_AMOUNT_PAISE)
  const attendeeLimit = Number(environment.ATTENDEE_LIMIT || 4)
  const bookingIdPrefix = environment.BOOKING_ID_PREFIX || 'LBA26'
  const eventName = environment.EVENT_NAME || 'Legendary Business Awards 2026'

  if (!keyId || !keySecret) {
    throw new Error('Razorpay server credentials are missing.')
  }
  if (!Number.isSafeInteger(amount) || amount < 100) {
    throw new Error('PAYMENT_AMOUNT_PAISE must be a whole number of at least 100.')
  }
  if (!Number.isSafeInteger(attendeeLimit) || attendeeLimit < 1 || attendeeLimit > 20) {
    throw new Error('ATTENDEE_LIMIT must be a whole number between 1 and 20.')
  }
  if (!/^[A-Z0-9-]{2,12}$/.test(bookingIdPrefix)) {
    throw new Error('BOOKING_ID_PREFIX must use 2-12 uppercase letters, digits, or dashes.')
  }

  return { keyId, keySecret, amount, attendeeLimit, bookingIdPrefix, eventName }
}

export function normalizeCustomer(customer) {
  if (
    typeof customer?.name !== 'string' ||
    typeof customer?.email !== 'string' ||
    typeof customer?.contact !== 'string'
  ) {
    return null
  }

  const name = customer.name.trim()
  const email = customer.email.trim()
  const contact = customer.contact.trim()
  if (
    !name ||
    name.length > 100 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    !/^[+()\d -]{7,20}$/.test(contact)
  ) {
    return null
  }

  return { name, email, contact }
}

export function isValidPaymentSignature(orderId, paymentId, signature, keySecret) {
  if (
    typeof orderId !== 'string' ||
    typeof paymentId !== 'string' ||
    typeof signature !== 'string' ||
    !orderId ||
    !paymentId ||
    !signaturePattern.test(signature)
  ) {
    return false
  }

  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest()
  const received = Buffer.from(signature, 'hex')
  return expected.length === received.length && crypto.timingSafeEqual(expected, received)
}

export function hashRegistrationToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function equalHash(left, right) {
  if (
    typeof left !== 'string' ||
    typeof right !== 'string' ||
    !/^[a-f\d]{64}$/i.test(left) ||
    !/^[a-f\d]{64}$/i.test(right)
  ) {
    return false
  }
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'))
}

export async function createPendingBooking(db, order, customer, settings, registrationToken) {
  const bookingRef = db.collection('bookings').doc(order.id)
  const counterRef = db.collection('system').doc('bookingCounter')

  return db.runTransaction(async (transaction) => {
    const [existingBooking, counter] = await Promise.all([
      transaction.get(bookingRef),
      transaction.get(counterRef),
    ])
    if (existingBooking.exists) {
      throw new Error('A booking already exists for this payment order.')
    }

    const sequence = (counter.data()?.sequence || 0) + 1
    const bookingId = `${settings.bookingIdPrefix}-${String(sequence).padStart(4, '0')}`
    const now = new Date().toISOString()

    transaction.set(counterRef, { sequence })
    transaction.create(bookingRef, {
      bookingId,
      orderId: order.id,
      paymentId: null,
      email: customer.email,
      customerName: customer.name,
      contact: customer.contact,
      amount: order.amount,
      currency: order.currency,
      paymentStatus: 'PENDING',
      registrationStatus: 'PENDING',
      ticketStatus: 'PENDING',
      status: 'PAYMENT_PENDING',
      attendeeLimit: settings.attendeeLimit,
      attendeeCount: 0,
      eventName: settings.eventName,
      registrationTokenHash: hashRegistrationToken(registrationToken),
      createdAt: FieldValue.serverTimestamp(),
      statusHistory: [{ status: 'PAYMENT_PENDING', at: now }],
    })

    return { bookingId, attendeeLimit: settings.attendeeLimit, eventName: settings.eventName }
  })
}

export async function verifyAndMarkBookingPaid(db, orderId, paymentId, registrationToken) {
  if (!registrationTokenPattern.test(registrationToken || '')) {
    return { error: 'Registration access token is missing or invalid.', statusCode: 400 }
  }

  const bookingRef = db.collection('bookings').doc(orderId)
  const tokenHash = hashRegistrationToken(registrationToken)
  return db.runTransaction(async (transaction) => {
    const bookingSnapshot = await transaction.get(bookingRef)
    if (!bookingSnapshot.exists) {
      return { error: 'No booking was found for this payment order.', statusCode: 404 }
    }

    const booking = bookingSnapshot.data()
    if (!equalHash(booking.registrationTokenHash, tokenHash)) {
      return { error: 'Registration access token did not match.', statusCode: 403 }
    }
    if (booking.status !== 'PAYMENT_PENDING') {
      if (booking.paymentId === paymentId && booking.status !== 'PAYMENT_PENDING') {
        return { booking, alreadyVerified: true }
      }
      return { error: 'This booking has already been processed.', statusCode: 409 }
    }

    const paidAt = new Date().toISOString()
    transaction.update(bookingRef, {
      paymentId,
      paymentStatus: 'VERIFIED',
      status: 'PAID',
      paidAt: FieldValue.serverTimestamp(),
      statusHistory: FieldValue.arrayUnion({ status: 'PAID', at: paidAt }),
    })
    return {
      booking: { ...booking, paymentId, paymentStatus: 'VERIFIED', status: 'PAID' },
      alreadyVerified: false,
    }
  })
}

export async function registerAttendees(db, bookingId, registrationToken, attendeeNames) {
  if (!bookingIdPattern.test(bookingId || '')) {
    return { error: 'Booking ID is missing or invalid.', statusCode: 400 }
  }
  if (!registrationTokenPattern.test(registrationToken || '')) {
    return { error: 'Registration access token is missing or invalid.', statusCode: 400 }
  }
  if (
    !Array.isArray(attendeeNames) ||
    attendeeNames.length < 1 ||
    attendeeNames.length > 20 ||
    attendeeNames.some((name) => typeof name !== 'string' || !name.trim() || name.trim().length > 100)
  ) {
    return { error: 'Enter a name for each attendee.', statusCode: 400 }
  }

  const tokenHash = hashRegistrationToken(registrationToken)
  const bookingQuery = db.collection('bookings').where('bookingId', '==', bookingId).limit(1)
  const lookup = await bookingQuery.get()
  if (lookup.empty) return { error: 'Booking was not found.', statusCode: 404 }

  const bookingRef = lookup.docs[0].ref
  const attendees = attendeeNames.map((name, index) => {
    const token = crypto.randomBytes(32).toString('base64url')
    const id = crypto.randomUUID()
    return {
      id,
      name: name.trim(),
      attendeeNumber: index + 1,
      token,
      tokenHash: hashRegistrationToken(token),
    }
  })

  return db.runTransaction(async (transaction) => {
    const bookingSnapshot = await transaction.get(bookingRef)
    if (!bookingSnapshot.exists) {
      return { error: 'Booking was not found.', statusCode: 404 }
    }

    const booking = bookingSnapshot.data()
    if (!equalHash(booking.registrationTokenHash, tokenHash)) {
      return { error: 'Registration access token did not match.', statusCode: 403 }
    }
    if (booking.status === 'TICKETS_ISSUED') {
      return {
        error: 'Tickets have already been issued for this booking.',
        statusCode: 409,
        alreadyIssued: true,
      }
    }
    if (booking.status !== 'PAID' || booking.paymentStatus !== 'VERIFIED') {
      return { error: 'Attendees can only be registered for a verified paid booking.', statusCode: 409 }
    }
    if (attendees.length > booking.attendeeLimit) {
      return {
        error: `This booking allows at most ${booking.attendeeLimit} attendees.`,
        statusCode: 400,
      }
    }

    const now = new Date().toISOString()
    const attendeeCollection = db.collection('attendees')
    const ticketCollection = db.collection('tickets')
    const ticketResults = attendees.map((attendee) => ({
      ticketId: attendee.tokenHash,
      attendeeId: attendee.id,
      attendeeName: attendee.name,
      attendeeNumber: attendee.attendeeNumber,
      qrToken: attendee.token,
    }))

    for (const attendee of attendees) {
      const attendeeRef = attendeeCollection.doc(attendee.id)
      const ticketRef = ticketCollection.doc(attendee.tokenHash)
      transaction.create(attendeeRef, {
        bookingId,
        attendeeNumber: attendee.attendeeNumber,
        name: attendee.name,
        createdAt: FieldValue.serverTimestamp(),
      })
      transaction.create(ticketRef, {
        tokenHash: attendee.tokenHash,
        attendeeId: attendee.id,
        bookingId,
        checkInStatus: 'NOT_CHECKED_IN',
        checkedInAt: null,
        issuedAt: FieldValue.serverTimestamp(),
      })
    }

    transaction.update(bookingRef, {
      status: 'TICKETS_ISSUED',
      registrationStatus: 'COMPLETED',
      ticketStatus: 'ISSUED',
      attendeeCount: attendees.length,
      registrationCompletedAt: FieldValue.serverTimestamp(),
      ticketsIssuedAt: FieldValue.serverTimestamp(),
      statusHistory: FieldValue.arrayUnion(
        { status: 'REGISTRATION_COMPLETED', at: now },
        { status: 'TICKETS_ISSUED', at: now },
      ),
    })

    return { bookingId, status: 'TICKETS_ISSUED', tickets: ticketResults }
  })
}
