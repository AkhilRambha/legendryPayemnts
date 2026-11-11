import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'
import {
  createPendingBooking,
  getPaymentSettings,
  isValidPaymentSignature,
  registerAttendees,
  verifyAndMarkBookingPaid,
} from '../lib/booking-workflow.js'

class MemoryFirestore {
  documents = new Map()

  collection(name) {
    return new MemoryCollection(this, name)
  }

  async runTransaction(callback) {
    const writes = []
    const transaction = {
      get: async (reference) => {
        const data = this.documents.get(reference.path)
        return { exists: Boolean(data), data: () => data, ref: reference }
      },
      set: (reference, data) => writes.push({ type: 'set', reference, data }),
      create: (reference, data) => writes.push({ type: 'create', reference, data }),
      update: (reference, data) => writes.push({ type: 'update', reference, data }),
    }

    const result = await callback(transaction)
    for (const write of writes) {
      const { reference, data } = write
      if (write.type === 'create' && this.documents.has(reference.path)) {
        throw new Error('Document already exists.')
      }
      if (write.type === 'update') {
        this.documents.set(reference.path, { ...this.documents.get(reference.path), ...data })
      } else {
        this.documents.set(reference.path, data)
      }
    }
    return result
  }
}

class MemoryCollection {
  constructor(database, name) {
    this.database = database
    this.name = name
  }

  doc(id) {
    return { id, path: `${this.name}/${id}` }
  }

  where(field, operator, value) {
    assert.equal(operator, '==')
    return {
      limit: () => ({
        get: async () => {
          const docs = [...this.database.documents.entries()]
            .filter(([path, data]) =>
              path.startsWith(`${this.name}/`) && data[field] === value)
            .map(([path, data]) => ({
              ref: { id: path.slice(this.name.length + 1), path },
              data: () => data,
            }))
          return { empty: docs.length === 0, docs }
        },
      }),
    }
  }
}

const settings = getPaymentSettings({
  RAZORPAY_KEY_ID: 'rzp_test_id',
  RAZORPAY_KEY_SECRET: 'test-secret',
  PAYMENT_AMOUNT_PAISE: '10000',
  ATTENDEE_LIMIT: '4',
})
const customer = {
  name: 'Test Attendee',
  email: 'attendee@example.test',
  contact: '+15551234567',
}

async function createBooking() {
  const db = new MemoryFirestore()
  const order = { id: 'order_test_001', amount: 10000, currency: 'INR' }
  const registrationToken = crypto.randomBytes(32).toString('base64url')
  const booking = await createPendingBooking(db, order, customer, settings, registrationToken)
  return { db, order, booking, registrationToken }
}

test('creates a pending booking with the registration-token hash', async () => {
  const { db, order, booking, registrationToken } = await createBooking()
  const stored = db.documents.get(`bookings/${order.id}`)

  assert.equal(booking.bookingId, 'LBA26-0001')
  assert.equal(stored.status, 'PAYMENT_PENDING')
  assert.equal(stored.registrationTokenHash.length, 64)
  assert.notEqual(stored.registrationTokenHash, registrationToken)
})

test('accepts only correct payment signatures and marks the booking paid', async () => {
  const { db, order, registrationToken } = await createBooking()
  const paymentId = 'pay_test_001'
  const signature = crypto.createHmac('sha256', settings.keySecret)
    .update(`${order.id}|${paymentId}`)
    .digest('hex')

  assert.equal(isValidPaymentSignature(order.id, paymentId, signature, settings.keySecret), true)
  assert.equal(isValidPaymentSignature(order.id, paymentId, '0'.repeat(64), settings.keySecret), false)
  const result = await verifyAndMarkBookingPaid(db, order.id, paymentId, registrationToken)
  assert.equal(result.booking.status, 'PAID')
  assert.equal(db.documents.get(`bookings/${order.id}`).paymentStatus, 'VERIFIED')
})

test('requires a paid booking and enforces the attendee limit', async () => {
  const { db, booking, registrationToken } = await createBooking()
  const unpaid = await registerAttendees(db, booking.bookingId, registrationToken, ['One'])
  await verifyAndMarkBookingPaid(db, 'order_test_001', 'pay_test_003', registrationToken)
  const tooMany = await registerAttendees(
    db,
    booking.bookingId,
    registrationToken,
    ['One', 'Two', 'Three', 'Four', 'Five'],
  )

  assert.equal(unpaid.statusCode, 409)
  assert.equal(tooMany.statusCode, 400)
  assert.equal([...db.documents.keys()].filter((path) => path.startsWith('tickets/')).length, 0)
})

test('issues hashed QR tickets once for a paid booking', async () => {
  const { db, order, booking, registrationToken } = await createBooking()
  const paymentId = 'pay_test_002'
  await verifyAndMarkBookingPaid(db, order.id, paymentId, registrationToken)

  const result = await registerAttendees(
    db,
    booking.bookingId,
    registrationToken,
    ['Main Attendee', 'Additional Member'],
  )
  const storedTickets = [...db.documents.entries()]
    .filter(([path]) => path.startsWith('tickets/'))
    .map(([, ticket]) => ticket)

  assert.equal(result.tickets.length, 2)
  assert.equal(storedTickets.length, 2)
  assert.equal(db.documents.get(`bookings/${order.id}`).status, 'TICKETS_ISSUED')
  assert.ok(storedTickets.every((ticket) => /^[a-f\d]{64}$/.test(ticket.tokenHash)))
  assert.ok(storedTickets.every((ticket) => !('qrToken' in ticket)))

  const duplicate = await registerAttendees(
    db,
    booking.bookingId,
    registrationToken,
    ['Main Attendee'],
  )
  assert.equal(duplicate.statusCode, 409)
  assert.equal([...db.documents.keys()].filter((path) => path.startsWith('tickets/')).length, 2)
})
