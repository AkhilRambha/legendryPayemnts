import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

let firestore

export function getAdminFirestore(environment = process.env) {
  if (firestore) return firestore

  const serviceAccountPath = environment.FIREBASE_SERVICE_ACCOUNT_PATH
  const serviceAccountJson = environment.FIREBASE_SERVICE_ACCOUNT_JSON
  const serviceAccount = serviceAccountPath
    ? JSON.parse(readFileSync(resolve(process.cwd(), serviceAccountPath), 'utf8'))
    : serviceAccountJson
      ? JSON.parse(serviceAccountJson)
      : null
  const projectId = environment.FIREBASE_PROJECT_ID || serviceAccount?.project_id
  const databaseId = environment.FIREBASE_DATABASE_ID || 'default'

  if (!projectId) {
    throw new Error('FIREBASE_PROJECT_ID is required.')
  }

  const options = { projectId }
  if (environment.FIRESTORE_EMULATOR_HOST) {
    // The emulator accepts unauthenticated Admin SDK connections.
  } else if (serviceAccount) {
    options.credential = cert({
      ...serviceAccount,
      projectId,
      privateKey: serviceAccount.private_key?.replace(/\\n/g, '\n'),
    })
  } else {
    options.credential = applicationDefault()
  }

  const app = getApps()[0] || initializeApp(options)
  firestore = getFirestore(app, databaseId)
  return firestore
}
