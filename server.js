import 'dotenv/config'
import express from 'express'
import ExcelJS from 'exceljs'
import { access, mkdir } from 'node:fs/promises'
import Razorpay from 'razorpay'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isValidPaymentSignature, normalizeCustomer } from './lib/payment-utils.js'

const keyId = process.env.RAZORPAY_KEY_ID
const keySecret = process.env.RAZORPAY_KEY_SECRET
const amount = Number(process.env.PAYMENT_AMOUNT_PAISE)
const port = Number(process.env.PORT || 3001)

if (!keyId || !keySecret) {
  console.error('Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET in .env.')
  process.exit(1)
}

if (!Number.isSafeInteger(amount) || amount < 100) {
  console.error('PAYMENT_AMOUNT_PAISE must be a whole number of at least 100.')
  process.exit(1)
}

const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })
const app = express()
const directory = dirname(fileURLToPath(import.meta.url))
const workbookPath = resolve(directory, 'data', 'payments.xlsx')
let workbookWriteQueue = Promise.resolve()

app.use(express.json({ limit: '10kb' }))

async function savePayment(record) {
  const save = workbookWriteQueue.then(async () => {
    await mkdir(dirname(workbookPath), { recursive: true })
    const workbook = new ExcelJS.Workbook()
    let existingWorkbook = true
    try {
      await access(workbookPath)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      existingWorkbook = false
    }

    if (existingWorkbook) {
      await workbook.xlsx.readFile(workbookPath)
    }

    const worksheet = workbook.getWorksheet('Payments') || workbook.addWorksheet('Payments')
    if (worksheet.rowCount === 0) {
      worksheet.columns = [
        { header: 'Verified at (UTC)', key: 'verifiedAt', width: 25 },
        { header: 'Customer name', key: 'name', width: 28 },
        { header: 'Email', key: 'email', width: 34 },
        { header: 'Phone', key: 'contact', width: 20 },
        { header: 'Amount (INR)', key: 'amount', width: 16 },
        { header: 'Currency', key: 'currency', width: 12 },
        { header: 'Order ID', key: 'orderId', width: 28 },
        { header: 'Payment ID', key: 'paymentId', width: 28 },
      ]
      worksheet.getRow(1).font = { bold: true }
      worksheet.views = [{ state: 'frozen', ySplit: 1 }]
    }

    let alreadySaved = false
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && row.getCell(8).value === record.paymentId) {
        alreadySaved = true
      }
    })
    if (alreadySaved) return

    worksheet.addRow(record)
    await workbook.xlsx.writeFile(workbookPath)
  })

  workbookWriteQueue = save.then(
    () => undefined,
    (error) => {
      console.error('Could not save verified payment to the workbook:', error)
    },
  )
  return save
}

app.post('/api/create-order', async (_request, response) => {
  try {
    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
    })

    response.status(201).json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
    })
  } catch (error) {
    const statusCode = error.statusCode === 401 || error.statusCode === 403 ? 401 : 500
    console.error('Razorpay order creation failed:', error.statusCode || 'unknown status')
    response.status(statusCode).json({
      error: statusCode === 401
        ? 'Razorpay authentication failed. Check the server key settings.'
        : 'Unable to create a payment order. Please try again.',
    })
  }
})

app.post('/api/verify-payment', async (request, response) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = request.body ?? {}
  if (
    typeof razorpay_order_id !== 'string' ||
    typeof razorpay_payment_id !== 'string' ||
    typeof razorpay_signature !== 'string' ||
    !razorpay_order_id ||
    !razorpay_payment_id
  ) {
    return response.status(400).json({ error: 'Payment verification fields are required.' })
  }

  const customer = normalizeCustomer(request.body.customer)
  if (!customer) {
    return response.status(400).json({ error: 'Customer details are invalid.' })
  }

  if (!isValidPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature, keySecret)) {
    return response.status(400).json({ error: 'Payment signature did not match.' })
  }

  const verifiedAt = new Date().toISOString()
  const paymentRecord = {
    verifiedAt,
    ...customer,
    amount: amount / 100,
    currency: 'INR',
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
  }

  try {
    await savePayment(paymentRecord)
    return response.json({
      verified: true,
      saved: true,
      payment_id: razorpay_payment_id,
      order_id: razorpay_order_id,
      amount: paymentRecord.amount,
    })
  } catch {
    console.error('Verified payment could not be recorded.')
    return response.status(503).json({
      verified: true,
      saved: false,
      error: 'Payment succeeded, but its receipt could not be saved. Contact support with this payment ID.',
      payment_id: razorpay_payment_id,
      order_id: razorpay_order_id,
      amount: paymentRecord.amount,
    })
  }
})

app.use('/api', (_request, response) => {
  response.status(404).json({ error: 'API endpoint not found.' })
})

app.use(express.static(resolve(directory, 'dist')))

app.listen(port, () => {
  console.log(`Payment API listening on http://localhost:${port}`)
})
