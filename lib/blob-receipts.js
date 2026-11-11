import crypto from 'node:crypto'
import { get, list, put } from '@vercel/blob'

const access = 'private'

export async function saveReceipt(record) {
  const id = crypto.createHash('sha256').update(record.paymentId).digest('hex')
  await put(`payments/${id}.json`, JSON.stringify(record), {
    access,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  })
}

export async function listReceipts() {
  const receipts = []
  let cursor
  let hasMore = true

  while (hasMore) {
    const result = await list({ access, prefix: 'payments/', cursor })
    for (const blob of result.blobs) {
      const file = await get(blob.pathname, { access, useCache: false })
      if (!file || file.statusCode !== 200 || !file.stream) {
        throw new Error('A stored payment receipt could not be read.')
      }

      const chunks = []
      for await (const chunk of file.stream) {
        chunks.push(Buffer.from(chunk))
      }
      receipts.push(JSON.parse(Buffer.concat(chunks).toString('utf8')))
    }

    hasMore = result.hasMore
    cursor = result.cursor
  }

  return receipts
}
