import { useState } from 'react'
import './PaymentCheckout.css'
import PaymentSuccess from './PaymentSuccess.jsx'
import AttendeeRegistration from './AttendeeRegistration.jsx'

const keyId = import.meta.env.VITE_RAZORPAY_KEY_ID
const amountPaise = Number(import.meta.env.VITE_PAYMENT_AMOUNT_PAISE)
const amountLabel = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
}).format(amountPaise / 100)

function PaymentCheckout() {
  const [status, setStatus] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [showDetailsForm, setShowDetailsForm] = useState(false)
  const [receipt, setReceipt] = useState(null)
  const [stage, setStage] = useState('checkout')

  function openDetailsForm() {
    setStatus('')
    setShowDetailsForm(true)
  }

  function startOver() {
    setReceipt(null)
    setStage('checkout')
    setShowDetailsForm(false)
    setStatus('')
  }

  async function startCheckout(event) {
    event.preventDefault()

    if (!keyId || !Number.isSafeInteger(amountPaise) || amountPaise < 100) {
      setStatus('Payment setup is incomplete. Check the local .env settings.')
      return
    }

    const formData = new FormData(event.currentTarget)
    const name = formData.get('name')
    const email = formData.get('email')
    const contact = formData.get('contact')

    setIsProcessing(true)
    setStatus('')

    try {
      const orderResponse = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer: { name, email, contact } }),
      })
      const order = await orderResponse.json()
      if (!orderResponse.ok) {
        throw new Error(order.error || 'Could not create a payment order.')
      }

      if (!window.Razorpay) {
        throw new Error('Razorpay Checkout did not load. Check your internet connection.')
      }

      const checkout = new window.Razorpay({
        key: keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'Legendary Payment',
        description: 'Payment checkout',
        order_id: order.order_id,
        prefill: { name, email, contact },
        handler: async (payment) => {
          try {
            const verificationResponse = await fetch('/api/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_payment_id: payment.razorpay_payment_id,
                razorpay_order_id: payment.razorpay_order_id,
                razorpay_signature: payment.razorpay_signature,
                registration_token: order.registration_token,
              }),
            })
            const result = await verificationResponse.json()
            if (!verificationResponse.ok && !result.verified) {
              throw new Error(result.error || 'Payment verification failed.')
            }
            setReceipt({
              ...result,
              customer: { name, email, contact },
            })
            setStage('success')
          } catch (error) {
            setStatus(error.message || 'Payment verification failed.')
          } finally {
            setIsProcessing(false)
          }
        },
        modal: {
          ondismiss: () => {
            setStatus('Checkout was cancelled.')
            setIsProcessing(false)
          },
        },
        theme: { color: '#6d4aff' },
      })

      checkout.on('payment.failed', (event) => {
        setStatus(event.error?.description || 'Payment failed. Please try again.')
        setIsProcessing(false)
      })
      checkout.open()
    } catch (error) {
      setStatus(error.message || 'Unable to start checkout. Please try again.')
      setIsProcessing(false)
    }
  }

  if (receipt && stage === 'success') {
    return (
      <PaymentSuccess
        receipt={receipt}
        onContinueRegistration={() => setStage('registration')}
      />
    )
  }

  if (receipt && stage === 'registration') {
    return (
      <AttendeeRegistration
        booking={receipt}
        onStartOver={startOver}
      />
    )
  }

  return (
    <main className="payment-card">
      <div className="brand-mark" aria-hidden="true">L</div>
      <p className="eyebrow">SECURE CHECKOUT</p>
      <h1>Complete your payment</h1>
      <p className="description">
        Pay securely with Razorpay Standard Checkout.
      </p>
      <div className="amount-panel">
        <span>Amount due</span>
        <strong>{amountLabel}</strong>
      </div>
      {showDetailsForm ? (
        <form className="details-form" onSubmit={startCheckout}>
          <label>
            Full name
            <input autoComplete="name" name="name" required />
          </label>
          <label>
            Email address
            <input autoComplete="email" name="email" type="email" required />
          </label>
          <label>
            Phone number
            <input
              autoComplete="tel"
              name="contact"
              type="tel"
              inputMode="tel"
              required
            />
          </label>
          <button className="pay-button" type="submit" disabled={isProcessing}>
            {isProcessing ? 'Opening secure checkout…' : 'Continue to payment'}
          </button>
        </form>
      ) : (
        <button className="pay-button" type="button" onClick={openDetailsForm}>
          Continue
        </button>
      )}
      <p className="secure-note">Your payment details are handled securely by Razorpay.</p>
      <p className="status" role="status" aria-live="polite">{status}</p>
    </main>
  )
}

export default PaymentCheckout
