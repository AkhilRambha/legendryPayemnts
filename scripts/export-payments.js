import dotenv from 'dotenv'
import ExcelJS from 'exceljs'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listReceipts } from '../lib/blob-receipts.js'

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = resolve(projectDirectory, 'data', 'payments.xlsx')
dotenv.config({ path: resolve(projectDirectory, '.env.local') })
dotenv.config({ path: resolve(projectDirectory, '.env') })

const workbook = new ExcelJS.Workbook()
const worksheet = workbook.addWorksheet('Payments')
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

const receipts = await listReceipts()
for (const receipt of receipts) worksheet.addRow(receipt)

await mkdir(dirname(outputPath), { recursive: true })
await workbook.xlsx.writeFile(outputPath)
console.log(`Exported ${receipts.length} payment receipt(s) to data/payments.xlsx`)
