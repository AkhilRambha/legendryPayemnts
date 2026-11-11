import 'dotenv/config'
import express from 'express'
import { getPaymentSettings } from './lib/booking-workflow.js'
import {
  createOrderHandler,
  registerAttendeesHandler,
  verifyPaymentHandler,
} from './lib/api-handlers.js'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

try {
  getPaymentSettings()
} catch (error) {
  console.error(error.message)
  process.exit(1)
}

const app = express()
const directory = dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.PORT || 3001)

app.use(express.json({ limit: '10kb' }))
app.post('/api/create-order', createOrderHandler)
app.post('/api/verify-payment', verifyPaymentHandler)
app.post('/api/register-attendees', registerAttendeesHandler)

app.use('/api', (_request, response) => {
  response.status(404).json({ error: 'API endpoint not found.' })
})

app.use(express.static(resolve(directory, 'dist')))

app.listen(port, () => {
  console.log(`Payment API listening on http://localhost:${port}`)
})
