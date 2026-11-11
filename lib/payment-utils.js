import crypto from 'node:crypto'

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
    !/^[a-f\d]{64}$/i.test(signature)
  ) {
    return false
  }

  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex')
  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(signature)
  return expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
}

export function getPaymentSettings(environment = process.env) {
  const keyId = environment.RAZORPAY_KEY_ID
  const keySecret = environment.RAZORPAY_KEY_SECRET
  const amount = Number(environment.PAYMENT_AMOUNT_PAISE)

  if (!keyId || !keySecret) {
    throw new Error('Missing Razorpay server credentials.')
  }
  if (!Number.isSafeInteger(amount) || amount < 100) {
    throw new Error('PAYMENT_AMOUNT_PAISE must be a whole number of at least 100.')
  }

  return { keyId, keySecret, amount }
}
